-- LOTE EN EL CICLO DEL CAMIÓN (carga → venta ruta/POS → descarga), FEFO.
--
-- Hueco: todo el lado del camión mueve stock_almacen pero sin lote_id, así que
-- stock_lotes del camión nunca se llena/consume → descuadre y no se puede vender
-- por lote desde ruta.
--
-- Fix SEGURO y aislado: NO se tocan las funciones de stock general
-- (apply_entrega_cargado_inventory, apply_immediate_sale_inventory,
-- apply_descarga_ruta_aprobada). Se agregan triggers que SOLO mueven stock_lotes,
-- espejando las mismas condiciones. La bodega ya descontó su lote en el surtido;
-- aquí solo se traslada/consume el lote en el camión.
--
-- Piezas:
--   A) Carga: acredita al camión los mismos lotes que se surtieron.
--   B) Venta ruta/POS inmediata: consume FEFO el lote del almacén de venta
--      (camión o bodega) cuando la línea no trae lote (el escritorio ya lo trae).
--   C) Descarga: regresa a la bodega los lotes que quedaron en el camión (FEFO)
--      y deja el camión en 0.
--   D) Se amplía la reversa de cancelación de venta para cubrir también las
--      salidas FEFO de ruta/POS ('venta_lote').
-- Productos sin lote: no-op en todas.

-- ════════════════════════════════════════════════════════════════════════════
-- A) CARGA AL CAMIÓN
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.aplicar_lote_carga_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_active text[] := ARRAY['asignado','cargado','en_ruta'];
  v_truck uuid;
  v_vend uuid;
  v_mov RECORD;
  v_bodega uuid;
BEGIN
  -- ===== REVERSIÓN: saliendo de activo a estado no-activo y no-hecho =====
  IF TG_OP = 'UPDATE'
     AND OLD.status::text = ANY(v_active)
     AND NOT (NEW.status::text = ANY(v_active))
     AND NEW.status::text <> 'hecho' THEN

    -- Cancelado / no entregado: se queda en el camión (igual que el general).
    IF NEW.status::text IN ('cancelado','no_entregado') THEN RETURN NEW; END IF;

    -- Reasignar / reprogramar: devolver el lote del camión a la bodega original.
    FOR v_mov IN
      SELECT producto_id, lote_id, cantidad, almacen_destino_id AS truck
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_cargado_lote' AND lote_id IS NOT NULL
    LOOP
      SELECT almacen_origen_id INTO v_bodega
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega' AND tipo = 'salida'
        AND producto_id = v_mov.producto_id AND lote_id = v_mov.lote_id AND almacen_origen_id IS NOT NULL
      LIMIT 1;
      IF v_bodega IS NOT NULL THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
        VALUES (NEW.empresa_id, 'traspaso', v_mov.producto_id, v_mov.cantidad,
                v_mov.truck, v_bodega, v_mov.lote_id, 'entrega_cargado_lote_rev', NEW.id, CURRENT_DATE,
                'Reversa lote · carga (reasignación) devuelto a bodega');
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_cargado_lote';
    RETURN NEW;
  END IF;

  -- ===== APLICACIÓN: entrando a activo =====
  IF NOT (NEW.status::text = ANY(v_active)) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = ANY(v_active) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_cargado_lote') THEN
    RETURN NEW;
  END IF;

  v_vend := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  IF v_vend IS NULL THEN RETURN NEW; END IF;
  SELECT almacen_id INTO v_truck FROM public.profiles WHERE id = v_vend;
  IF v_truck IS NULL THEN RETURN NEW; END IF;

  -- Acreditar al camión los lotes surtidos (bodega ya se descontó en el surtido).
  FOR v_mov IN
    SELECT producto_id, lote_id, SUM(cantidad) AS cantidad
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega' AND tipo = 'salida' AND lote_id IS NOT NULL
    GROUP BY producto_id, lote_id
  LOOP
    -- Solo destino = camión (sin origen) → el trigger central solo SUMA stock_lotes del camión.
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, vendedor_destino_id, fecha, notas)
    VALUES (NEW.empresa_id, 'entrada', v_mov.producto_id, v_mov.cantidad, v_truck, v_mov.lote_id,
            'entrega_cargado_lote', NEW.id, v_vend, CURRENT_DATE, 'Carga lote a camión');
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aplicar_lote_carga_entrega ON public.entregas;
CREATE TRIGGER trg_aplicar_lote_carga_entrega
AFTER UPDATE OF status ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.aplicar_lote_carga_entrega();

-- ════════════════════════════════════════════════════════════════════════════
-- B) VENTA DIRECTA RUTA / POS (inmediata) — consume FEFO el lote del almacén.
--    El escritorio ya trae lote en la línea; aquí solo actuamos cuando NO lo trae.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.aplicar_lote_venta_inmediata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venta public.ventas%rowtype;
  v_maneja boolean;
  v_almacen uuid;
  v_pending numeric;
  v_lote RECORD;
  v_take numeric;
BEGIN
  IF NEW.lote_id IS NOT NULL THEN RETURN NEW; END IF;  -- escritorio ya lo maneja
  SELECT * INTO v_venta FROM public.ventas WHERE id = NEW.venta_id;
  IF v_venta.id IS NULL THEN RETURN NEW; END IF;
  IF v_venta.tipo <> 'venta_directa' OR COALESCE(v_venta.entrega_inmediata, false) IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT COALESCE(maneja_lote, false) INTO v_maneja FROM public.productos WHERE id = NEW.producto_id;
  IF NOT v_maneja THEN RETURN NEW; END IF;

  v_almacen := COALESCE(v_venta.almacen_id,
                        (SELECT almacen_id FROM public.profiles WHERE id = v_venta.vendedor_id LIMIT 1));
  IF v_almacen IS NULL THEN RETURN NEW; END IF;

  v_pending := COALESCE(NEW.cantidad, 0);
  FOR v_lote IN
    SELECT sl.lote_id, sl.cantidad AS existencia
    FROM public.stock_lotes sl JOIN public.lotes l ON l.id = sl.lote_id
    WHERE sl.almacen_id = v_almacen AND sl.producto_id = NEW.producto_id AND sl.cantidad > 0
    ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
    FOR UPDATE OF sl
  LOOP
    EXIT WHEN v_pending <= 0;
    v_take := LEAST(v_lote.existencia, v_pending);
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
    VALUES (v_venta.empresa_id, 'salida', NEW.producto_id, v_take, v_almacen, v_lote.lote_id,
            'venta_lote', v_venta.id, COALESCE(v_venta.vendedor_id, v_venta.cliente_id), COALESCE(v_venta.fecha, CURRENT_DATE),
            'Venta lote (FEFO) ' || COALESCE(v_venta.folio, ''));
    v_pending := v_pending - v_take;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aplicar_lote_venta_inmediata ON public.venta_lineas;
CREATE TRIGGER trg_aplicar_lote_venta_inmediata
AFTER INSERT ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.aplicar_lote_venta_inmediata();

-- ════════════════════════════════════════════════════════════════════════════
-- C) DESCARGA DE CAMIÓN — regresar a bodega los lotes que quedan en el camión.
--    El general mete el físico (cantidad_real) a la bodega y deja el camión en 0.
--    Aquí, por lote: mover FEFO del camión a bodega hasta cantidad_real, y dejar
--    el camión en 0 (el remanente, si el físico fue menor, es pérdida = sale del
--    camión sin destino, igual que el general deja el camión en 0).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.aplicar_lote_descarga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_camion uuid;
  v_bodega uuid;
  v_linea RECORD;
  v_pending numeric;
  v_lote RECORD;
  v_take numeric;
BEGIN
  IF NEW.status <> 'aprobada' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprobada' THEN RETURN NEW; END IF;
  IF NOT COALESCE(NEW.descargo_camion, false) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = NEW.id AND referencia_tipo = 'descarga_lote') THEN
    RETURN NEW;
  END IF;

  SELECT almacen_id INTO v_camion FROM public.profiles WHERE id = NEW.vendedor_id;
  v_bodega := NEW.almacen_destino_id;
  IF v_camion IS NULL OR v_bodega IS NULL THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT producto_id, COALESCE(cantidad_real, 0) AS cantidad_real
    FROM public.descarga_ruta_lineas WHERE descarga_id = NEW.id
  LOOP
    -- 1) Devolver a bodega, FEFO desde el camión, hasta el físico contado.
    v_pending := v_linea.cantidad_real;
    FOR v_lote IN
      SELECT sl.lote_id, sl.cantidad AS existencia
      FROM public.stock_lotes sl JOIN public.lotes l ON l.id = sl.lote_id
      WHERE sl.almacen_id = v_camion AND sl.producto_id = v_linea.producto_id AND sl.cantidad > 0
      ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
      FOR UPDATE OF sl
    LOOP
      EXIT WHEN v_pending <= 0;
      v_take := LEAST(v_lote.existencia, v_pending);
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
      VALUES (NEW.empresa_id, 'traspaso', v_linea.producto_id, v_take, v_camion, v_bodega, v_lote.lote_id,
              'descarga_lote', NEW.id, COALESCE(NEW.fecha, CURRENT_DATE), 'Descarga lote · camión→bodega (FEFO)');
      v_pending := v_pending - v_take;
    END LOOP;

    -- 2) Dejar el camión en 0: lo que quede en lotes del camión es pérdida (sale sin destino).
    FOR v_lote IN
      SELECT sl.lote_id, sl.cantidad AS existencia
      FROM public.stock_lotes sl
      WHERE sl.almacen_id = v_camion AND sl.producto_id = v_linea.producto_id AND sl.cantidad > 0
      FOR UPDATE OF sl
    LOOP
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
      VALUES (NEW.empresa_id, 'salida', v_linea.producto_id, v_lote.existencia, v_camion, v_lote.lote_id,
              'descarga_lote', NEW.id, COALESCE(NEW.fecha, CURRENT_DATE), 'Descarga lote · merma/faltante en camión');
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aplicar_lote_descarga ON public.descarga_ruta;
CREATE TRIGGER trg_aplicar_lote_descarga
AFTER UPDATE OF status ON public.descarga_ruta
FOR EACH ROW EXECUTE FUNCTION public.aplicar_lote_descarga();

-- ════════════════════════════════════════════════════════════════════════════
-- D) Ampliar la reversa de cancelación de venta para cubrir salidas FEFO de
--    ruta/POS ('venta_lote'), además de las de escritorio ('venta').
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revertir_lote_venta_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_tipo text;
  v_rec RECORD;
  v_net numeric;
BEGIN
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('cancelado', 'borrador') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT ((COALESCE(OLD.entrega_inmediata, false) = true) OR (OLD.status = 'entregado')) THEN RETURN NEW; END IF;
  IF NEW.almacen_id IS NULL THEN RETURN NEW; END IF;

  v_ref_tipo := CASE WHEN NEW.status = 'cancelado' THEN 'cancelacion_venta_lote' ELSE 'reverso_borrador_lote' END;

  FOR v_rec IN
    SELECT producto_id, lote_id, MAX(almacen_origen_id) AS almacen_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo IN ('venta','venta_lote') AND tipo = 'salida' AND lote_id IS NOT NULL
    GROUP BY producto_id, lote_id
  LOOP
    SELECT COALESCE(SUM(CASE
             WHEN tipo = 'salida' AND referencia_tipo IN ('venta','venta_lote') THEN cantidad
             WHEN tipo = 'entrada' AND referencia_tipo IN ('cancelacion_venta_lote', 'reverso_borrador_lote') THEN -cantidad
             ELSE 0 END), 0)
    INTO v_net
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND producto_id = v_rec.producto_id AND lote_id = v_rec.lote_id;

    IF v_net > 0 THEN
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
      VALUES (NEW.empresa_id, 'entrada', v_rec.producto_id, v_net, v_rec.almacen_id, v_rec.lote_id,
              v_ref_tipo, NEW.id, COALESCE(NEW.fecha, CURRENT_DATE),
              'Reversa lote · ' || (CASE WHEN NEW.status = 'cancelado' THEN 'cancelación' ELSE 'vuelta a borrador' END) || ' venta');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
