CREATE OR REPLACE FUNCTION public.apply_entrega_hecho_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_vendedor_id uuid; v_almacen_id uuid; v_linea record;
  v_neto numeric; v_pendiente numeric;
  v_maneja_lote boolean;
  v_take numeric; v_lote record; v_left numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'hecho' AND NEW.status IS DISTINCT FROM 'hecho' THEN
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id, lote_id FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND referencia_tipo IN ('entrega_hecho','entrega') AND tipo = 'salida'
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
    WHERE referencia_id = NEW.id AND referencia_tipo IN ('entrega_hecho','entrega') AND tipo = 'salida';
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
$fn$;