-- ============================================================================
-- Promociones: alcance por lista de precios + mínimo acumulado entre SKU.
--
-- Compatibilidad: los DEFAULT reproducen el comportamiento previo
--   alcance_lista = 'todas'   → no se restringe ninguna promoción histórica.
--   modo_minimo   = 'por_sku' → el mínimo se sigue evaluando por SKU/renglón.
-- No se actualizan filas de promocion_aplicada ni de ventas: sus triggers
-- recalculan encabezados y eso alteraría ventas ya cerradas.
-- ============================================================================

ALTER TABLE public.promociones
  ADD COLUMN IF NOT EXISTS alcance_lista text NOT NULL DEFAULT 'todas',
  ADD COLUMN IF NOT EXISTS lista_precio_id uuid NULL REFERENCES public.lista_precios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modo_minimo text NOT NULL DEFAULT 'por_sku',
  ADD COLUMN IF NOT EXISTS participantes_ids uuid[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promociones_alcance_lista_chk') THEN
    ALTER TABLE public.promociones
      ADD CONSTRAINT promociones_alcance_lista_chk CHECK (alcance_lista IN ('todas', 'especifica'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promociones_modo_minimo_chk') THEN
    ALTER TABLE public.promociones
      ADD CONSTRAINT promociones_modo_minimo_chk CHECK (modo_minimo IN ('por_sku', 'acumulado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_promociones_lista_precio ON public.promociones(lista_precio_id) WHERE lista_precio_id IS NOT NULL;

-- La lista debe pertenecer a la misma empresa (aislamiento por tenant).
CREATE OR REPLACE FUNCTION public.tg_promociones_validar_lista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lista_precio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lista_precios lp
    WHERE lp.id = NEW.lista_precio_id AND lp.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'La lista de precios no pertenece a la empresa';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promociones_validar_lista ON public.promociones;
CREATE TRIGGER trg_promociones_validar_lista
BEFORE INSERT OR UPDATE OF lista_precio_id, empresa_id ON public.promociones
FOR EACH ROW EXECUTE FUNCTION public.tg_promociones_validar_lista();

-- Snapshot del beneficio aplicado: la venta conserva nombre, tipo y unidades
-- regaladas aunque la promoción se edite o elimine después.
ALTER TABLE public.promocion_aplicada
  ADD COLUMN IF NOT EXISTS promocion_nombre text NULL,
  ADD COLUMN IF NOT EXISTS tipo text NULL,
  ADD COLUMN IF NOT EXISTS cantidad_gratis numeric NOT NULL DEFAULT 0;

-- ¿El renglón cae dentro de la condición de compra de la promoción?
-- Misma regla que `itemCubierto` en src/hooks/usePromociones.ts.
CREATE OR REPLACE FUNCTION public.fn_promo_linea_elegible(
  p public.promociones,
  vl public.venta_lineas,
  _clasificacion_id uuid,
  _cliente_id uuid,
  _zona_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(vl.cantidad, 0) > 0
    AND (
      COALESCE(p.alcance_lista, 'todas') <> 'especifica'
      OR (p.lista_precio_id IS NOT NULL
          AND NOT COALESCE(vl.precio_manual, false)
          AND vl.lista_precio_id = p.lista_precio_id)
    )
    AND (
      p.aplica_a = 'todos'
      OR (p.aplica_a = 'producto' AND vl.producto_id = ANY(p.producto_ids))
      OR (p.aplica_a = 'clasificacion' AND _clasificacion_id = ANY(p.clasificacion_ids))
      OR (p.aplica_a = 'cliente' AND _cliente_id = ANY(p.cliente_ids))
      OR (p.aplica_a = 'zona' AND _zona_id = ANY(p.zona_ids))
    );
$$;

-- Reparación de ventas sin promociones registradas (botón "Actualizar promos").
-- Sigue siendo idempotente: si la venta ya tiene promocion_aplicada no se toca.
CREATE OR REPLACE FUNCTION public.fn_reevaluar_promos_venta(_venta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  p public.promociones;
  l record;
  total_reparado numeric := 0;
  usados uuid[] := '{}';
  regalo_consumido jsonb := '{}'::jsonb;
  fecha_venta date;
  dia_txt text;
  v_zona uuid;
  cant_min numeric;
  cant_gratis numeric;
  disparo numeric;
  ganado numeric;
  regalo_linea record;
  disponibles numeric;
  gratis_real numeric;
  desc_monto numeric;
  unit numeric;
  -- modo acumulado
  cant_grupo numeric;
  g_in numeric;
  g_out numeric;
  consumido numeric;
  avail_in numeric;
  avail_out numeric;
  s int;
  pedido numeric;
  de_fuera numeric;
  del_grupo numeric;
  por_asignar numeric;
  saltar numeric;
  u numeric;
BEGIN
  SELECT * INTO v FROM public.ventas WHERE id = _venta_id;
  IF NOT FOUND OR v.status = 'cancelado' THEN RETURN 0; END IF;

  -- Idempotencia: si la venta ya tiene promociones registradas, no se toca.
  IF EXISTS (SELECT 1 FROM public.promocion_aplicada WHERE venta_id = _venta_id) THEN
    RETURN 0;
  END IF;

  SELECT c.zona_id INTO v_zona FROM public.clientes c WHERE c.id = v.cliente_id;

  fecha_venta := COALESCE(v.fecha, (v.created_at AT TIME ZONE 'America/Mexico_City')::date);
  dia_txt := CASE EXTRACT(dow FROM fecha_venta)::int
    WHEN 0 THEN 'domingo' WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
    WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' ELSE 'sábado' END;

  FOR p IN
    SELECT * FROM public.promociones
    WHERE empresa_id = v.empresa_id AND activa
      AND (vigencia_inicio IS NULL OR vigencia_inicio <= fecha_venta)
      AND (vigencia_fin IS NULL OR vigencia_fin >= fecha_venta)
      AND (COALESCE(array_length(dias_semana,1),0) = 0 OR dia_txt = ANY(dias_semana))
    ORDER BY COALESCE(prioridad,0) DESC
  LOOP
    cant_min := GREATEST(1, COALESCE(p.cantidad_minima,1));
    cant_gratis := GREATEST(1, COALESCE(p.cantidad_gratis,1));

    -- ── Modo acumulado: suma de los SKU participantes ──────────────────────
    IF COALESCE(p.modo_minimo, 'por_sku') = 'acumulado' THEN
      IF p.tipo = 'producto_gratis' THEN
        IF p.producto_gratis_id IS NULL THEN CONTINUE; END IF;

        SELECT COALESCE(SUM(CASE WHEN vl.producto_id = p.producto_gratis_id THEN 0 ELSE vl.cantidad END),0),
               COALESCE(SUM(CASE WHEN vl.producto_id = p.producto_gratis_id THEN vl.cantidad ELSE 0 END),0)
          INTO disparo, g_in
        FROM public.venta_lineas vl
        LEFT JOIN public.productos pr ON pr.id = vl.producto_id
        WHERE vl.venta_id = _venta_id
          AND NOT (vl.producto_id = ANY(usados))
          AND vl.producto_id = ANY(p.participantes_ids)
          AND public.fn_promo_linea_elegible(p, vl, pr.clasificacion_id, v.cliente_id, v_zona);

        SELECT COALESCE(SUM(vl.cantidad),0) - g_in INTO g_out
        FROM public.venta_lineas vl
        WHERE vl.venta_id = _venta_id AND vl.producto_id = p.producto_gratis_id;

        consumido := COALESCE((regalo_consumido ->> p.producto_gratis_id::text)::numeric, 0);
        avail_out := GREATEST(0, g_out - consumido);
        avail_in := GREATEST(0, g_in - GREATEST(0, consumido - g_out));
        cant_grupo := disparo + avail_in;

        gratis_real := 0;
        s := floor(cant_grupo / cant_min)::int;
        WHILE s > 0 LOOP
          pedido := s * cant_gratis;
          de_fuera := LEAST(pedido, avail_out);
          del_grupo := LEAST(pedido - de_fuera, avail_in);
          IF cant_grupo - del_grupo >= s * cant_min THEN
            gratis_real := de_fuera + del_grupo;
            EXIT;
          END IF;
          s := s - 1;
        END LOOP;
        IF gratis_real <= 0 THEN CONTINUE; END IF;

        -- Reparto en los renglones del regalo: primero los de fuera del grupo.
        por_asignar := gratis_real;
        saltar := consumido;
        FOR l IN
          SELECT vl.*, (vl.producto_id = ANY(p.participantes_ids)
                        AND NOT (vl.producto_id = ANY(usados))
                        AND public.fn_promo_linea_elegible(p, vl, pr.clasificacion_id, v.cliente_id, v_zona)) AS en_grupo
          FROM public.venta_lineas vl
          LEFT JOIN public.productos pr ON pr.id = vl.producto_id
          WHERE vl.venta_id = _venta_id AND vl.producto_id = p.producto_gratis_id
            AND COALESCE(vl.cantidad,0) > 0
          ORDER BY en_grupo ASC, vl.created_at
        LOOP
          EXIT WHEN por_asignar <= 0;
          u := GREATEST(0, l.cantidad - saltar);
          saltar := GREATEST(0, saltar - l.cantidad);
          u := LEAST(u, por_asignar);
          IF u <= 0 THEN CONTINUE; END IF;
          unit := l.total / NULLIF(l.cantidad,0);
          desc_monto := LEAST(ROUND(u * unit, 2), l.total);
          IF desc_monto > 0 THEN
            INSERT INTO public.promocion_aplicada (promocion_id, venta_id, venta_linea_id, descuento_aplicado, descripcion, promocion_nombre, tipo, cantidad_gratis)
            VALUES (p.id, _venta_id, l.id, desc_monto, u || '× gratis — ' || p.nombre, p.nombre, p.tipo::text, u);
            total_reparado := total_reparado + desc_monto;
          END IF;
          por_asignar := por_asignar - u;
        END LOOP;

        regalo_consumido := regalo_consumido || jsonb_build_object(
          p.producto_gratis_id::text, consumido + gratis_real);

        IF NOT COALESCE(p.acumulable,false) THEN
          SELECT usados || COALESCE(array_agg(DISTINCT vl.producto_id),'{}') INTO usados
          FROM public.venta_lineas vl
          LEFT JOIN public.productos pr ON pr.id = vl.producto_id
          WHERE vl.venta_id = _venta_id
            AND vl.producto_id = ANY(p.participantes_ids)
            AND public.fn_promo_linea_elegible(p, vl, pr.clasificacion_id, v.cliente_id, v_zona);
        END IF;
        CONTINUE;
      END IF;

      SELECT COALESCE(SUM(vl.cantidad),0) INTO cant_grupo
      FROM public.venta_lineas vl
      LEFT JOIN public.productos pr ON pr.id = vl.producto_id
      WHERE vl.venta_id = _venta_id
        AND NOT (vl.producto_id = ANY(usados))
        AND vl.producto_id = ANY(p.participantes_ids)
        AND public.fn_promo_linea_elegible(p, vl, pr.clasificacion_id, v.cliente_id, v_zona);

      IF cant_grupo <= 0 OR cant_grupo < COALESCE(p.cantidad_minima,0) THEN CONTINUE; END IF;
      IF p.tipo = 'volumen' AND (COALESCE(p.cantidad_minima,0) <= 0 OR COALESCE(p.valor,0) <= 0) THEN CONTINUE; END IF;

      FOR l IN
        SELECT vl.*
        FROM public.venta_lineas vl
        LEFT JOIN public.productos pr ON pr.id = vl.producto_id
        WHERE vl.venta_id = _venta_id
          AND NOT (vl.producto_id = ANY(usados))
          AND vl.producto_id = ANY(p.participantes_ids)
          AND COALESCE(vl.total,0) > 0
          AND public.fn_promo_linea_elegible(p, vl, pr.clasificacion_id, v.cliente_id, v_zona)
      LOOP
        unit := l.total / NULLIF(l.cantidad,0);
        desc_monto := 0;
        IF p.tipo IN ('descuento_porcentaje', 'volumen') THEN
          desc_monto := ROUND(l.total * COALESCE(p.valor,0) / 100.0, 2);
        ELSIF p.tipo = 'descuento_monto' THEN
          desc_monto := ROUND(LEAST(COALESCE(p.valor,0) * l.cantidad, l.total), 2);
        ELSIF p.tipo = 'precio_especial' THEN
          desc_monto := ROUND(GREATEST(0, (unit - COALESCE(p.valor,0)) * l.cantidad), 2);
        END IF;
        IF desc_monto <= 0 THEN CONTINUE; END IF;
        desc_monto := LEAST(desc_monto, l.total);

        INSERT INTO public.promocion_aplicada (promocion_id, venta_id, venta_linea_id, descuento_aplicado, descripcion, promocion_nombre, tipo, cantidad_gratis)
        VALUES (p.id, _venta_id, l.id, desc_monto, p.nombre, p.nombre, p.tipo::text, 0);
        total_reparado := total_reparado + desc_monto;
        IF NOT COALESCE(p.acumulable,false) THEN
          usados := usados || l.producto_id;
        END IF;
      END LOOP;
      CONTINUE;
    END IF;

    -- Producto gratis con regalo DISTINTO: se evalúa global por promoción.
    IF p.tipo = 'producto_gratis' AND p.producto_gratis_id IS NOT NULL THEN
      SELECT COALESCE(SUM(vl.cantidad),0) INTO disparo
      FROM public.venta_lineas vl
      LEFT JOIN public.productos pr ON pr.id = vl.producto_id
      WHERE vl.venta_id = _venta_id
        AND vl.producto_id <> p.producto_gratis_id
        AND NOT (vl.producto_id = ANY(usados))
        AND public.fn_promo_linea_elegible(p, vl, pr.clasificacion_id, v.cliente_id, v_zona);

      ganado := floor(COALESCE(disparo,0) / cant_min) * cant_gratis;
      IF ganado <= 0 THEN CONTINUE; END IF;

      SELECT * INTO regalo_linea FROM public.venta_lineas
      WHERE venta_id = _venta_id AND producto_id = p.producto_gratis_id
      ORDER BY cantidad DESC LIMIT 1;
      IF NOT FOUND OR COALESCE(regalo_linea.cantidad,0) <= 0 THEN CONTINUE; END IF;

      disponibles := regalo_linea.cantidad
        - COALESCE((regalo_consumido ->> p.producto_gratis_id::text)::numeric, 0);
      gratis_real := LEAST(ganado, GREATEST(disponibles, 0));
      IF gratis_real <= 0 THEN CONTINUE; END IF;

      unit := regalo_linea.total / NULLIF(regalo_linea.cantidad,0);
      desc_monto := ROUND(gratis_real * unit, 2);
      IF desc_monto <= 0 THEN CONTINUE; END IF;

      INSERT INTO public.promocion_aplicada (promocion_id, venta_id, venta_linea_id, descuento_aplicado, descripcion, promocion_nombre, tipo, cantidad_gratis)
      VALUES (p.id, _venta_id, regalo_linea.id, desc_monto, gratis_real || '× gratis — ' || p.nombre, p.nombre, p.tipo::text, gratis_real);
      total_reparado := total_reparado + desc_monto;
      regalo_consumido := regalo_consumido || jsonb_build_object(
        p.producto_gratis_id::text,
        COALESCE((regalo_consumido ->> p.producto_gratis_id::text)::numeric,0) + gratis_real);

      IF NOT COALESCE(p.acumulable,false) THEN
        SELECT usados || COALESCE(array_agg(DISTINCT vl.producto_id),'{}') INTO usados
        FROM public.venta_lineas vl
        WHERE vl.venta_id = _venta_id AND vl.producto_id <> p.producto_gratis_id;
      END IF;
      CONTINUE;
    END IF;

    -- Resto de tipos: por línea.
    FOR l IN
      SELECT vl.*, pr.clasificacion_id
      FROM public.venta_lineas vl
      LEFT JOIN public.productos pr ON pr.id = vl.producto_id
      WHERE vl.venta_id = _venta_id
        AND NOT (vl.producto_id = ANY(usados))
        AND COALESCE(vl.cantidad,0) > 0 AND COALESCE(vl.total,0) > 0
        AND public.fn_promo_linea_elegible(p, vl, pr.clasificacion_id, v.cliente_id, v_zona)
    LOOP
      IF l.cantidad < COALESCE(p.cantidad_minima,0) THEN CONTINUE; END IF;
      unit := l.total / NULLIF(l.cantidad,0);
      desc_monto := 0;

      IF p.tipo = 'descuento_porcentaje' THEN
        desc_monto := ROUND(l.total * COALESCE(p.valor,0) / 100.0, 2);
      ELSIF p.tipo = 'descuento_monto' THEN
        desc_monto := ROUND(LEAST(COALESCE(p.valor,0) * l.cantidad, l.total), 2);
      ELSIF p.tipo = 'precio_especial' THEN
        desc_monto := ROUND(GREATEST(0, (unit - COALESCE(p.valor,0)) * l.cantidad), 2);
      ELSIF p.tipo = 'volumen' THEN
        IF COALESCE(p.cantidad_minima,0) <= 0 OR COALESCE(p.valor,0) <= 0 THEN CONTINUE; END IF;
        desc_monto := ROUND(l.total * COALESCE(p.valor,0) / 100.0, 2);
      ELSIF p.tipo = 'producto_gratis' THEN
        ganado := floor(l.cantidad / cant_min) * cant_gratis;
        IF ganado <= 0 THEN CONTINUE; END IF;
        desc_monto := ROUND(ganado * unit, 2);
      END IF;

      IF desc_monto <= 0 THEN CONTINUE; END IF;
      desc_monto := LEAST(desc_monto, l.total);

      INSERT INTO public.promocion_aplicada (promocion_id, venta_id, venta_linea_id, descuento_aplicado, descripcion, promocion_nombre, tipo, cantidad_gratis)
      VALUES (p.id, _venta_id, l.id, desc_monto, p.nombre, p.nombre, p.tipo::text,
              CASE WHEN p.tipo = 'producto_gratis' THEN ganado ELSE 0 END);
      total_reparado := total_reparado + desc_monto;

      IF NOT COALESCE(p.acumulable,false) THEN
        usados := usados || l.producto_id;
      END IF;
    END LOOP;
  END LOOP;

  RETURN ROUND(total_reparado, 2);
END;
$$;
