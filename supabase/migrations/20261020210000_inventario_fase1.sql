-- =====================================================================
-- RutApp · Fase 1 inventario y saldos (2026-10-20). Lo ejecuta el dueño (D-002).
-- Construido sobre las definiciones REALES de producción (export 2026-10-20).
-- A (D-006) No se borra un documento que ya movió stock: se cancela.
-- B Entregas: reabrir/cancelar después de entregada sin stock fantasma (G1);
--   cancelar en surtido regresa a bodega (G2); reversa de lotes de carga válida.
-- C Saldo: una sola regla (fn_venta_cobrable), nunca negativo.
-- D Cierre parcial solo con entregas del pedido; devoluciones por renglón (G6).
-- Si alguna función de producción cambió desde el export, aborta sin tocar nada.
-- Todo o nada.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE r record; v_md5 text;
BEGIN
  IF to_regclass('public.stock_almacen') IS NULL THEN
    RAISE EXCEPTION 'Proyecto equivocado: esto no es rutapp';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('apply_entrega_hecho_inventory', '3d1dd956d680542c9d6602856bb961be', '94567c4eefa99fcd2a94a4a704b5d990'),
    ('apply_entrega_cargado_inventory', '41506292a5fc0f6a5d5c9f239ef8d1ca', '6804b5ded4b2e388ad3d3f9c4068e4c4'),
    ('aplicar_lote_carga_entrega', 'f9a71970bb8adc18a9a56b2c72a05c02', 'c67e624d5da4ae11728f9c48839a5c41'),
    ('apply_devolucion_linea_inventory', '38812d494e8d4e21eaf8ca71c55b8364', '943e8acaa12249eac98332cfba10d8b5'),
    ('reverse_devolucion_linea_inventory', 'e995516d2b25e2c661dbc1125cac7fec', '39b71f63684f8767405bad129bdfb006'),
    ('recalc_venta_saldo_on_total_change', '20960861ef3cf7df73eecad2534ec61c', 'c7f65260545b97c40c279615ca7c09ad'),
    ('fn_recalc_venta_saldo', '7701169e9528585e5a986f1488ea4560', 'd924ada31eeb2f170728d5cbd4410c07'),
    ('cerrar_pedido_parcial', 'cd5ac0d35db99f742112ceb9a886f052', '9f12b6ee8a3a3a393dcb673cc9209e43')
  ) AS x(nombre, md5, md5_nuevo) LOOP
    SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nombre;
    -- Acepta la versión original o la ya corregida (correr dos veces no daña nada).
    IF v_md5 IS DISTINCT FROM r.md5 AND v_md5 IS DISTINCT FROM r.md5_nuevo THEN
      RAISE EXCEPTION '% en producción cambió (md5 %); no se aplica nada', r.nombre, v_md5;
    END IF;
  END LOOP;
END
$guard$;


-- ---------- A · No borrar documentos que movieron stock (D-006) ----------
-- Efecto neto por almacén y producto de los movimientos de un documento.
-- Entrada con origen = traspaso (salvo cuando el origen ya se descontó al surtir).
CREATE OR REPLACE FUNCTION public.fn_doc_mueve_stock(p_doc uuid, p_producto uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT m.producto_id, x.almacen_id, SUM(x.delta) AS neto
      FROM public.movimientos_inventario m
      CROSS JOIN LATERAL (VALUES
        (CASE WHEN m.tipo::text IN ('entrada','transferencia') THEN m.almacen_destino_id END,
         COALESCE(m.cantidad, 0)),
        (CASE WHEN m.tipo::text IN ('salida','transferencia')
                OR (m.tipo::text = 'entrada' AND COALESCE(m.notas, '') NOT ILIKE '%ya descontado%')
              THEN m.almacen_origen_id END,
         -COALESCE(m.cantidad, 0))
      ) AS x(almacen_id, delta)
      WHERE m.referencia_id = p_doc
        AND (p_producto IS NULL OR m.producto_id = p_producto)
        AND x.almacen_id IS NOT NULL
      GROUP BY m.producto_id, x.almacen_id
    ) n
    WHERE abs(n.neto) > 0.000001
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_bloquea_borrado_con_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc  uuid;
  v_prod uuid;
BEGIN
  -- Procesos del servidor (limpieza de cuentas) quedan exentos.
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN OLD; END IF;
  v_doc := (to_jsonb(OLD) ->> TG_ARGV[0])::uuid;
  IF TG_NARGS > 1 THEN v_prod := (to_jsonb(OLD) ->> TG_ARGV[1])::uuid; END IF;
  IF v_doc IS NOT NULL AND public.fn_doc_mueve_stock(v_doc, v_prod) THEN
    RAISE EXCEPTION 'No se puede borrar: ya movió inventario. Cancélalo en lugar de borrarlo.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.entregas;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('id');
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.entrega_lineas;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.entrega_lineas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('entrega_id', 'producto_id');
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.compras;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('id');
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.compra_lineas;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.compra_lineas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('compra_id', 'producto_id');
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.traspasos;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.traspasos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('id');
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.traspaso_lineas;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.traspaso_lineas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('traspaso_id', 'producto_id');
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.descarga_ruta;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.descarga_ruta
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('id');
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.descarga_ruta_lineas;
CREATE TRIGGER trg_bloquea_borrado_con_stock BEFORE DELETE ON public.descarga_ruta_lineas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('descarga_id', 'producto_id');


-- ---------- B · Entregas ----------

CREATE OR REPLACE FUNCTION public.apply_entrega_hecho_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vendedor_id uuid; v_almacen_id uuid; v_linea record;
  v_neto numeric; v_pendiente numeric;
  v_maneja_lote boolean;
  v_take numeric; v_lote record; v_left numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'hecho' AND NEW.status IS DISTINCT FROM 'hecho' THEN
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id, lote_id FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND tipo = 'salida'
        AND (referencia_tipo = 'entrega_hecho' OR (referencia_tipo = 'entrega' AND NEW.status::text = 'borrador'))
    LOOP
      IF v_linea.almacen_origen_id IS NOT NULL AND v_linea.cantidad > 0 THEN
        UPDATE public.stock_almacen SET cantidad = cantidad + v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
        IF v_linea.lote_id IS NOT NULL THEN
          INSERT INTO public.stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
          VALUES (NEW.empresa_id, v_linea.almacen_origen_id, v_linea.producto_id, v_linea.lote_id, v_linea.cantidad)
          ON CONFLICT (almacen_id, lote_id)
            DO UPDATE SET cantidad = public.stock_lotes.cantidad + v_linea.cantidad, updated_at = now();
        END IF;
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND tipo = 'salida'
        AND (referencia_tipo = 'entrega_hecho' OR (referencia_tipo = 'entrega' AND NEW.status::text = 'borrador'));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'hecho' THEN RETURN NEW; END IF;

  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_vendedor_id;
  IF v_almacen_id IS NULL THEN v_almacen_id := NEW.almacen_id; END IF;
  IF v_almacen_id IS NULL THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT el.id, el.producto_id, el.cantidad_entregada, el.unidad_id, el.lote_id, COALESCE(p.maneja_lote,false) AS maneja_lote
    FROM public.entrega_lineas el
    JOIN public.productos p ON p.id = el.producto_id
    WHERE el.entrega_id = NEW.id AND el.hecho = true AND COALESCE(el.cantidad_entregada, 0) > 0
  LOOP
    SELECT COALESCE(SUM(CASE WHEN tipo='salida' AND almacen_origen_id = v_almacen_id THEN cantidad ELSE 0 END),0)
    INTO v_neto FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_hecho' AND producto_id = v_linea.producto_id;

    v_pendiente := v_linea.cantidad_entregada - v_neto;

    IF v_pendiente > 0 THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad, updated_at)
      VALUES (NEW.empresa_id, v_almacen_id, v_linea.producto_id, -v_pendiente, now())
      ON CONFLICT (almacen_id, producto_id)
        DO UPDATE SET cantidad = public.stock_almacen.cantidad - v_pendiente, updated_at = now();

      IF v_linea.maneja_lote THEN
        IF v_linea.lote_id IS NOT NULL THEN
          INSERT INTO public.movimientos_inventario (
            empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
            vendedor_destino_id, lote_id, referencia_tipo, referencia_id, notas, fecha
          ) VALUES (
            NEW.empresa_id, 'salida', v_linea.producto_id, v_pendiente, v_linea.unidad_id, v_almacen_id,
            v_vendedor_id, v_linea.lote_id, 'entrega_hecho', NEW.id,
            'Entrega a cliente (folio ' || COALESCE(NEW.folio,'—') || ')', CURRENT_DATE
          );
        ELSE
          v_left := v_pendiente;
          FOR v_lote IN
            SELECT sl.lote_id, sl.cantidad AS existencia
            FROM public.stock_lotes sl
            JOIN public.lotes l ON l.id = sl.lote_id
            WHERE sl.almacen_id = v_almacen_id AND sl.producto_id = v_linea.producto_id AND sl.cantidad > 0
            ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
            FOR UPDATE OF sl
          LOOP
            EXIT WHEN v_left <= 0;
            v_take := LEAST(v_lote.existencia, v_left);
            INSERT INTO public.movimientos_inventario (
              empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
              vendedor_destino_id, lote_id, referencia_tipo, referencia_id, notas, fecha
            ) VALUES (
              NEW.empresa_id, 'salida', v_linea.producto_id, v_take, v_linea.unidad_id, v_almacen_id,
              v_vendedor_id, v_lote.lote_id, 'entrega_hecho', NEW.id,
              'Entrega a cliente (folio ' || COALESCE(NEW.folio,'—') || ')', CURRENT_DATE
            );
            v_left := v_left - v_take;
          END LOOP;

          IF v_left > 0 THEN
            INSERT INTO public.movimientos_inventario (
              empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
              vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
            ) VALUES (
              NEW.empresa_id, 'salida', v_linea.producto_id, v_left, v_linea.unidad_id, v_almacen_id,
              v_vendedor_id, 'entrega_hecho', NEW.id,
              'Entrega a cliente (folio ' || COALESCE(NEW.folio,'—') || ') — sin lote', CURRENT_DATE
            );
          END IF;
        END IF;
      ELSE
        INSERT INTO public.movimientos_inventario (
          empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
          vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
        ) VALUES (
          NEW.empresa_id, 'salida', v_linea.producto_id, v_pendiente, v_linea.unidad_id, v_almacen_id,
          v_vendedor_id, 'entrega_hecho', NEW.id,
          'Entrega a cliente (folio ' || COALESCE(NEW.folio,'—') || ')', CURRENT_DATE
        );
      END IF;
    ELSE
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
        vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
      )
      SELECT NEW.empresa_id, 'salida', v_linea.producto_id, 0, v_linea.unidad_id, v_almacen_id,
        v_vendedor_id, 'entrega_hecho', NEW.id, 'Anclaje (descuento previo)', CURRENT_DATE
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario
        WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_hecho' AND producto_id = v_linea.producto_id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_entrega_cargado_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vendedor_id uuid;
  v_almacen_destino uuid;
  v_linea record;
  v_existing int;
  v_surtir_done boolean;
  v_active_statuses text[] := ARRAY['asignado','cargado','en_ruta'];
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.status::text = ANY(v_active_statuses)
          OR (OLD.status::text = 'hecho' AND NEW.status::text IN ('borrador','surtido')))
     AND NOT (NEW.status::text = ANY(v_active_statuses))
     AND NEW.status::text <> 'hecho' THEN

    -- Cargado con el repartidor + cancelado/no_entregado => se queda en el camión
    IF NEW.status::text IN ('cancelado','no_entregado') THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND notas ILIKE 'Cancelación%'
    ) THEN
      RETURN NEW;
    END IF;
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id, almacen_destino_id, notas
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id
        AND referencia_tipo IN ('entrega_cargado', 'entrega')
        AND notas ILIKE 'Carga%'
    LOOP
      IF v_linea.almacen_origen_id IS NOT NULL AND v_linea.cantidad > 0
         AND v_linea.notas NOT ILIKE '%anclaje%' AND v_linea.notas NOT ILIKE '%surtir%' THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad + v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
      END IF;
      IF v_linea.almacen_destino_id IS NOT NULL AND v_linea.cantidad > 0 THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad - v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_destino_id AND producto_id = v_linea.producto_id;
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo IN ('entrega_cargado', 'entrega')
      AND notas ILIKE 'Carga%';
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(v_active_statuses)) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = ANY(v_active_statuses) THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'entrega_cargado' AND referencia_id = NEW.id;
  IF v_existing > 0 THEN RETURN NEW; END IF;

  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  IF v_vendedor_id IS NULL THEN RETURN NEW; END IF;
  SELECT almacen_id INTO v_almacen_destino FROM public.profiles WHERE id = v_vendedor_id;
  IF v_almacen_destino IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega' AND tipo = 'salida' AND cantidad > 0
  ) INTO v_surtir_done;

  FOR v_linea IN
    SELECT producto_id, cantidad_entregada, almacen_origen_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id AND hecho = true AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    IF NOT v_surtir_done AND v_linea.almacen_origen_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad - v_linea.cantidad_entregada, updated_at = now()
      WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
    END IF;

    INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (NEW.empresa_id, v_almacen_destino, v_linea.producto_id, v_linea.cantidad_entregada)
    ON CONFLICT (almacen_id, producto_id)
      DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id,
      vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
    ) VALUES (
      NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad_entregada,
      v_linea.almacen_origen_id, v_almacen_destino, v_vendedor_id, 'entrega_cargado', NEW.id,
      CASE WHEN v_surtir_done THEN 'Carga a camión (origen ya descontado por surtir)'
           ELSE 'Carga a ruta (trigger BD, asignación)' END,
      CURRENT_DATE
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_lote_carga_entrega()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active text[] := ARRAY['asignado','cargado','en_ruta'];
  v_truck uuid; v_vend uuid; v_mov RECORD; v_bodega uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.status::text = ANY(v_active)
          OR (OLD.status::text = 'hecho' AND NEW.status::text IN ('borrador','surtido')))
     AND NOT (NEW.status::text = ANY(v_active)) AND NEW.status::text <> 'hecho' THEN
    IF NEW.status::text IN ('cancelado','no_entregado') THEN RETURN NEW; END IF;
    FOR v_mov IN
      SELECT producto_id, lote_id, cantidad, almacen_destino_id AS truck
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_cargado_lote' AND lote_id IS NOT NULL
    LOOP
      SELECT almacen_origen_id INTO v_bodega FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega' AND tipo = 'salida'
        AND producto_id = v_mov.producto_id AND lote_id = v_mov.lote_id AND almacen_origen_id IS NOT NULL LIMIT 1;
      -- El lote sale del camión; en bodega sigue apartado por el surtido (se repone al des-surtir).
      IF v_mov.truck IS NOT NULL THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
        VALUES (NEW.empresa_id, 'salida', v_mov.producto_id, v_mov.cantidad, v_mov.truck, v_mov.lote_id,
                'entrega_cargado_lote_rev', NEW.id, CURRENT_DATE, 'Reversa lote · carga (reasignación) sale del camión');
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_cargado_lote';
    RETURN NEW;
  END IF;
  IF NOT (NEW.status::text = ANY(v_active)) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = ANY(v_active) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_cargado_lote') THEN RETURN NEW; END IF;
  v_vend := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  IF v_vend IS NULL THEN RETURN NEW; END IF;
  SELECT almacen_id INTO v_truck FROM public.profiles WHERE id = v_vend;
  IF v_truck IS NULL THEN RETURN NEW; END IF;
  FOR v_mov IN
    SELECT producto_id, lote_id, SUM(cantidad) AS cantidad FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega' AND tipo = 'salida' AND lote_id IS NOT NULL
    GROUP BY producto_id, lote_id
  LOOP
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, vendedor_destino_id, fecha, notas)
    VALUES (NEW.empresa_id, 'entrada', v_mov.producto_id, v_mov.cantidad, v_truck, v_mov.lote_id,
            'entrega_cargado_lote', NEW.id, v_vend, CURRENT_DATE, 'Carga lote a camión');
  END LOOP;
  RETURN NEW;
END; $function$;

-- G2: cancelar (o no entregado) antes de cargar al camión regresa lo surtido a la bodega.
CREATE OR REPLACE FUNCTION public.fn_revertir_surtido_al_cancelar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
  v_upd int;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR OLD.status::text NOT IN ('borrador','surtido')
     OR NEW.status::text NOT IN ('cancelado','no_entregado') THEN
    RETURN NEW;
  END IF;

  FOR v_mov IN
    SELECT id, producto_id, cantidad, lote_id, almacen_origen_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega' AND tipo = 'salida'
    FOR UPDATE
  LOOP
    IF v_mov.almacen_origen_id IS NOT NULL AND COALESCE(v_mov.cantidad, 0) <> 0 THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad + v_mov.cantidad, updated_at = now()
      WHERE almacen_id = v_mov.almacen_origen_id AND producto_id = v_mov.producto_id;
      GET DIAGNOSTICS v_upd = ROW_COUNT;
      IF v_upd = 0 THEN
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (NEW.empresa_id, v_mov.almacen_origen_id, v_mov.producto_id, v_mov.cantidad);
      END IF;
      IF v_mov.lote_id IS NOT NULL THEN
        PERFORM public._aplica_stock_lote(NEW.empresa_id, v_mov.almacen_origen_id, v_mov.producto_id, v_mov.lote_id, v_mov.cantidad);
      END IF;
    END IF;
    DELETE FROM public.movimientos_inventario WHERE id = v_mov.id;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revertir_surtido_al_cancelar ON public.entregas;
CREATE TRIGGER trg_revertir_surtido_al_cancelar AFTER UPDATE OF status ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.fn_revertir_surtido_al_cancelar();


-- ---------- C · Saldo ----------

CREATE OR REPLACE FUNCTION public.fn_venta_cobrable(v_venta public.ventas)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p_venta_id     uuid := v_venta.id;
  v_cobrable     numeric;
  v_orig_base    numeric;
  v_deliv_base   numeric;
  v_es_entregado boolean;
BEGIN
  IF v_venta.cerrado_at IS NOT NULL THEN
    v_cobrable := COALESCE(v_venta.total_efectivo, 0);
  ELSE
    v_es_entregado :=
          v_venta.tipo::text = 'pedido'
      AND v_venta.politica_cobro IS NOT DISTINCT FROM 'entregado'
      -- Un pedido de CONTADO adeuda el total: no se reduce por lo entregado.
      AND COALESCE(v_venta.condicion_pago::text, '') <> 'contado'
      AND COALESCE(v_venta.es_saldo_inicial, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.venta_lineas
        WHERE venta_id = p_venta_id
          AND (COALESCE(facturado, false) = true OR factura_cfdi_id IS NOT NULL)
      );

    IF v_es_entregado THEN
      SELECT COALESCE(SUM(base), 0), COALESCE(SUM(base * ratio), 0)
        INTO v_orig_base, v_deliv_base
      FROM (
        SELECT
          (COALESCE(vl.subtotal,0) + COALESCE(vl.iva_monto,0) + COALESCE(vl.ieps_monto,0)) AS base,
          CASE WHEN vl.cantidad > 0
               THEN LEAST(COALESCE(ent.entregado, 0), vl.cantidad) / vl.cantidad
               ELSE 0 END AS ratio
        FROM public.venta_lineas vl
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(el.cantidad_entregada), 0) AS entregado
          FROM public.entrega_lineas el
          JOIN public.entregas e ON e.id = el.entrega_id
          WHERE e.pedido_id = p_venta_id
            AND e.status::text NOT IN ('cancelado','no_entregado')
            AND el.producto_id = vl.producto_id
        ) ent ON true
        WHERE vl.venta_id = p_venta_id
      ) q;

      IF COALESCE(v_orig_base, 0) > 0 THEN
        v_cobrable := ROUND(COALESCE(v_venta.total, 0) * (v_deliv_base / v_orig_base), 2);
      ELSE
        v_cobrable := 0;
      END IF;
    ELSE
      v_cobrable := COALESCE(v_venta.total, 0);
    END IF;
  END IF;

  RETURN v_cobrable;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recalc_venta_saldo(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta        public.ventas%ROWTYPE;
  v_cobros       numeric;
  v_cobrable     numeric;
  v_orig_base    numeric;
  v_deliv_base   numeric;
  v_es_entregado boolean;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id
    AND COALESCE(c.status, 'activo') <> 'cancelado';

  v_cobrable := public.fn_venta_cobrable(v_venta);

  UPDATE public.ventas
  SET saldo_pendiente = GREATEST(0, v_cobrable - COALESCE(v_cobros, 0))
  WHERE id = p_venta_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_venta_saldo_on_total_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pagado numeric;
BEGIN
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = NEW.id AND c.status <> 'cancelado';
  -- Misma regla que fn_recalc_venta_saldo (política de cobro, cierre parcial); nunca negativo.
  NEW.saldo_pendiente := GREATEST(0, public.fn_venta_cobrable(NEW) - v_pagado);
  RETURN NEW;
END;
$function$;

-- ---------- D · Cierre parcial y devoluciones ----------

CREATE OR REPLACE FUNCTION public.cerrar_pedido_parcial(p_venta_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta      public.ventas%ROWTYPE;
  v_orig_base  numeric;
  v_deliv_base numeric;
  v_cobrable   numeric;
  v_cobros     numeric;
  v_saldo      numeric;
  v_snapshot   jsonb;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  IF v_venta.tipo::text <> 'pedido' THEN
    RAISE EXCEPTION 'Solo se pueden cerrar pedidos'; END IF;
  IF v_venta.politica_cobro IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Solo aplica a pedidos con política de cobro por entregado'; END IF;
  IF v_venta.cerrado_at IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'; END IF;
  IF v_venta.status::text IN ('cancelado','facturado') THEN
    RAISE EXCEPTION 'No se puede cerrar un pedido cancelado o facturado'; END IF;
  IF COALESCE(v_venta.es_saldo_inicial,false) THEN
    RAISE EXCEPTION 'No aplica a saldos iniciales'; END IF;

  SELECT COALESCE(SUM(base), 0), COALESCE(SUM(base * ratio), 0)
    INTO v_orig_base, v_deliv_base
  FROM (
    SELECT
      (COALESCE(vl.subtotal,0) + COALESCE(vl.iva_monto,0) + COALESCE(vl.ieps_monto,0)) AS base,
      CASE WHEN vl.cantidad > 0
           THEN LEAST(COALESCE(ent.entregado, 0), vl.cantidad) / vl.cantidad
           ELSE 0 END AS ratio
    FROM public.venta_lineas vl
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(el.cantidad_entregada), 0) AS entregado
      FROM public.entrega_lineas el
      JOIN public.entregas e ON e.id = el.entrega_id
      WHERE e.pedido_id = p_venta_id
        AND e.status::text NOT IN ('cancelado','no_entregado')
        AND el.producto_id = vl.producto_id
    ) ent ON true
    WHERE vl.venta_id = p_venta_id
  ) q;

  IF COALESCE(v_deliv_base, 0) <= 0 THEN
    RAISE EXCEPTION 'No hay nada entregado: cancela el pedido en vez de cerrarlo';
  END IF;

  v_cobrable := CASE WHEN COALESCE(v_orig_base,0) > 0
                     THEN ROUND(COALESCE(v_venta.total,0) * (v_deliv_base / v_orig_base), 2)
                     ELSE 0 END;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';

  v_saldo := GREATEST(0, v_cobrable - v_cobros);

  v_snapshot := jsonb_build_object(
    'pedido_total',    COALESCE(v_venta.total,0),
    'total_efectivo',  v_cobrable,
    'cobros',          v_cobros,
    'saldo',           v_saldo,
    'base_original',   v_orig_base,
    'base_entregada',  v_deliv_base,
    'lineas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'linea_id',    vl.id,
               'producto_id', vl.producto_id,
               'pedido',      vl.cantidad,
               'entregado',   COALESCE((
                  SELECT SUM(el.cantidad_entregada)
                  FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
                  WHERE e.pedido_id = p_venta_id
                    AND e.status::text NOT IN ('cancelado','no_entregado')
                    AND el.producto_id = vl.producto_id), 0),
               'subtotal_orig', vl.subtotal,
               'iva_orig',      vl.iva_monto,
               'ieps_orig',     vl.ieps_monto,
               'total_orig',    vl.total
             )), '[]'::jsonb)
      FROM public.venta_lineas vl WHERE vl.venta_id = p_venta_id
    )
  );

  -- UPDATE sin LATERAL: el ratio se calcula inline usando vl (target) y ent (FROM).
  UPDATE public.venta_lineas vl
  SET
    cantidad   = LEAST(COALESCE(ent.entregado, 0), vl.cantidad),
    subtotal   = ROUND(COALESCE(vl.subtotal,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    iva_monto  = ROUND(COALESCE(vl.iva_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    ieps_monto = ROUND(COALESCE(vl.ieps_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    total      = ROUND(COALESCE(vl.total,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2)
  FROM (
    SELECT vl2.id AS linea_id,
           COALESCE((SELECT SUM(el.cantidad_entregada)
                       FROM public.entrega_lineas el
                       JOIN public.entregas e ON e.id = el.entrega_id
                      WHERE e.pedido_id = p_venta_id
                        AND e.status::text NOT IN ('cancelado','no_entregado')
                        AND el.producto_id = vl2.producto_id), 0) AS entregado
    FROM public.venta_lineas vl2
    WHERE vl2.venta_id = p_venta_id
  ) ent
  WHERE vl.id = ent.linea_id AND vl.venta_id = p_venta_id;

  UPDATE public.ventas
  SET cerrado_at       = now(),
      cerrado_por      = COALESCE(p_user_id, auth.uid()),
      total_efectivo   = v_cobrable,
      cerrado_snapshot = v_snapshot
  WHERE id = p_venta_id;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_devolucion_linea_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dev record;
  v_almacen_id uuid;
  v_merma_almacen uuid;
  v_existing int;
  v_legacy int;
BEGIN
  SELECT id, empresa_id, user_id, vendedor_id, almacen_destino_id INTO v_dev
  FROM public.devoluciones WHERE id = NEW.devolucion_id;
  IF v_dev.id IS NULL THEN RETURN NEW; END IF;

  -- Almacén destino automático: el del usuario que registró (fallback al vendedor).
  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.user_id;
  IF v_almacen_id IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
    SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.vendedor_id;
  END IF;

  -- Ruteo automático por motivo (producto NO vendible → Almacén Mermas).
  IF NEW.motivo::text IN ('danado', 'vencido', 'caducado') THEN
    SELECT id INTO v_merma_almacen
    FROM public.almacenes
    WHERE empresa_id = v_dev.empresa_id AND es_merma = true
    LIMIT 1;
    IF v_merma_almacen IS NOT NULL THEN
      v_almacen_id := v_merma_almacen;
    END IF;
  END IF;

  -- NUEVO (escritorio): si la devolución trae almacén destino explícito, GANA
  -- sobre el ruteo automático. Retrocompatible: móvil no lo setea → sin cambios.
  IF v_dev.almacen_destino_id IS NOT NULL THEN
    v_almacen_id := v_dev.almacen_destino_id;
    IF v_almacen_id <> COALESCE(v_merma_almacen, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      v_merma_almacen := NULL;
    END IF;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_devolucion_linea_inventory: no almacen for devolucion %', v_dev.id;
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion_aplicada' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id
    AND notas LIKE '%[linea:' || NEW.id::text || ']%';
  IF v_existing > 0 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_legacy
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id AND tipo = 'entrada';
  IF v_legacy > 0 THEN
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
      referencia_tipo, referencia_id, user_id, notas, fecha
    ) VALUES (
      v_dev.empresa_id, 'entrada', NEW.producto_id, 0, v_almacen_id,
      'devolucion_aplicada', v_dev.id, v_dev.user_id, 'Ancla (reingreso previo por app móvil)', CURRENT_DATE
    );
    RETURN NEW;
  END IF;

  -- Reingreso real al almacén elegido (vendible o mermas)
  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  VALUES (v_dev.empresa_id, v_almacen_id, NEW.producto_id, NEW.cantidad)
  ON CONFLICT (almacen_id, producto_id)
    DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (
    empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
    referencia_tipo, referencia_id, user_id, notas, fecha
  ) VALUES (
    v_dev.empresa_id, 'entrada', NEW.producto_id, NEW.cantidad, v_almacen_id,
    'devolucion_aplicada', v_dev.id, v_dev.user_id,
    CASE WHEN v_merma_almacen IS NOT NULL THEN 'Devolución a MERMAS (trigger BD)'
         ELSE 'Devolución (trigger BD)' END || ' [linea:' || NEW.id::text || ']',
    CURRENT_DATE
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_devolucion_linea_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
BEGIN
  -- Renglón aplicado con etiqueta propia: se revierte solo lo suyo.
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = OLD.devolucion_id AND referencia_tipo = 'devolucion_aplicada'
               AND notas LIKE '%[linea:' || OLD.id::text || ']%') THEN
    FOR v_mov IN
      SELECT id, almacen_destino_id, producto_id, cantidad
      FROM public.movimientos_inventario
      WHERE referencia_id = OLD.devolucion_id AND referencia_tipo = 'devolucion_aplicada'
        AND tipo = 'entrada' AND cantidad > 0
        AND notas LIKE '%[linea:' || OLD.id::text || ']%'
    LOOP
      IF v_mov.almacen_destino_id IS NOT NULL THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad - v_mov.cantidad, updated_at = now()
        WHERE almacen_id = v_mov.almacen_destino_id AND producto_id = v_mov.producto_id;
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = OLD.devolucion_id AND referencia_tipo = 'devolucion_aplicada'
      AND notas LIKE '%[linea:' || OLD.id::text || ']%';
    RETURN OLD;
  END IF;

  FOR v_mov IN
    SELECT id, almacen_destino_id, producto_id, cantidad
    FROM public.movimientos_inventario
    WHERE referencia_id = OLD.devolucion_id
      AND producto_id = OLD.producto_id
      AND referencia_tipo IN ('devolucion_aplicada', 'devolucion')
      AND tipo = 'entrada'
      AND cantidad > 0
  LOOP
    IF v_mov.almacen_destino_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad - v_mov.cantidad, updated_at = now()
      WHERE almacen_id = v_mov.almacen_destino_id
        AND producto_id = v_mov.producto_id;
    END IF;
  END LOOP;

  DELETE FROM public.movimientos_inventario
  WHERE referencia_id = OLD.devolucion_id
    AND producto_id = OLD.producto_id
    AND referencia_tipo IN ('devolucion_aplicada', 'devolucion');

  RETURN OLD;
END;
$function$;

COMMIT;
