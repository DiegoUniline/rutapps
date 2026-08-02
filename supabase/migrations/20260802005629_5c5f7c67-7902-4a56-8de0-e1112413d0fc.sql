CREATE OR REPLACE FUNCTION public.fn_reevaluar_promos_venta(_venta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  p record;
  l record;
  total_reparado numeric := 0;
  usados uuid[] := '{}';
  regalo_consumido jsonb := '{}'::jsonb;
  fecha_venta date;
  dia_txt text;
  cant_min numeric;
  cant_gratis numeric;
  disparo numeric;
  ganado numeric;
  regalo_linea record;
  disponibles numeric;
  gratis_real numeric;
  desc_monto numeric;
  unit numeric;
BEGIN
  SELECT * INTO v FROM public.ventas WHERE id = _venta_id;
  IF NOT FOUND OR v.status = 'cancelado' THEN RETURN 0; END IF;

  -- Idempotencia: si la venta ya tiene promociones registradas, no se toca.
  IF EXISTS (SELECT 1 FROM public.promocion_aplicada WHERE venta_id = _venta_id) THEN
    RETURN 0;
  END IF;

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

    -- Producto gratis con regalo DISTINTO: se evalúa global por promoción.
    IF p.tipo = 'producto_gratis' AND p.producto_gratis_id IS NOT NULL THEN
      SELECT COALESCE(SUM(vl.cantidad),0) INTO disparo
      FROM public.venta_lineas vl
      LEFT JOIN public.productos pr ON pr.id = vl.producto_id
      WHERE vl.venta_id = _venta_id
        AND vl.producto_id <> p.producto_gratis_id
        AND NOT (vl.producto_id = ANY(usados))
        AND (
          p.aplica_a = 'todos'
          OR (p.aplica_a = 'producto' AND vl.producto_id = ANY(p.producto_ids))
          OR (p.aplica_a = 'clasificacion' AND pr.clasificacion_id = ANY(p.clasificacion_ids))
          OR (p.aplica_a = 'cliente' AND v.cliente_id = ANY(p.cliente_ids))
        );

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

      INSERT INTO public.promocion_aplicada (promocion_id, venta_id, venta_linea_id, descuento_aplicado, descripcion)
      VALUES (p.id, _venta_id, regalo_linea.id, desc_monto, gratis_real || '× gratis — ' || p.nombre);
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
        AND (
          p.aplica_a = 'todos'
          OR (p.aplica_a = 'producto' AND vl.producto_id = ANY(p.producto_ids))
          OR (p.aplica_a = 'clasificacion' AND pr.clasificacion_id = ANY(p.clasificacion_ids))
          OR (p.aplica_a = 'cliente' AND v.cliente_id = ANY(p.cliente_ids))
        )
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

      INSERT INTO public.promocion_aplicada (promocion_id, venta_id, venta_linea_id, descuento_aplicado, descripcion)
      VALUES (p.id, _venta_id, l.id, desc_monto, p.nombre);
      total_reparado := total_reparado + desc_monto;

      IF NOT COALESCE(p.acumulable,false) THEN
        usados := usados || l.producto_id;
      END IF;
    END LOOP;
  END LOOP;

  RETURN ROUND(total_reparado, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reparar_promociones(
  _empresa_id uuid DEFAULT NULL,
  _desde date DEFAULT NULL
)
RETURNS TABLE (venta_id uuid, folio text, empresa text, total_anterior numeric, descuento numeric, total_nuevo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  d numeric;
  antes numeric;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email','') <> 'diego.leon@uniline.mx' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  FOR r IN
    SELECT v.id, v.folio, v.total, e.nombre AS empresa
    FROM public.ventas v
    JOIN public.empresas e ON e.id = v.empresa_id
    WHERE v.status <> 'cancelado'
      AND (_empresa_id IS NULL OR v.empresa_id = _empresa_id)
      AND (_desde IS NULL OR v.fecha >= _desde)
      AND NOT EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id)
    ORDER BY v.created_at DESC
  LOOP
    antes := r.total;
    d := public.fn_reevaluar_promos_venta(r.id);
    IF COALESCE(d,0) > 0 THEN
      venta_id := r.id; folio := r.folio; empresa := r.empresa;
      total_anterior := antes; descuento := d;
      SELECT v2.total INTO total_nuevo FROM public.ventas v2 WHERE v2.id = r.id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reparar_promociones(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reparar_promociones(uuid, date) TO authenticated;