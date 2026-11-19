CREATE OR REPLACE FUNCTION public.revertir_lote_venta_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ref_tipo text; v_rec RECORD; v_net numeric;
BEGIN
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('cancelado', 'borrador') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT ((COALESCE(OLD.entrega_inmediata, false) = true) OR (OLD.status = 'entregado')) THEN RETURN NEW; END IF;
  IF NEW.almacen_id IS NULL THEN RETURN NEW; END IF;
  v_ref_tipo := CASE WHEN NEW.status = 'cancelado' THEN 'cancelacion_venta_lote' ELSE 'reverso_borrador_lote' END;
  FOR v_rec IN
    SELECT producto_id, lote_id, (array_agg(almacen_origen_id))[1] AS almacen_id FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo IN ('venta','venta_lote') AND tipo = 'salida' AND lote_id IS NOT NULL
    GROUP BY producto_id, lote_id
  LOOP
    SELECT COALESCE(SUM(CASE
             WHEN tipo = 'salida' AND referencia_tipo IN ('venta','venta_lote') THEN cantidad
             WHEN tipo = 'entrada' AND referencia_tipo IN ('cancelacion_venta_lote', 'reverso_borrador_lote') THEN -cantidad
             ELSE 0 END), 0) INTO v_net
    FROM public.movimientos_inventario WHERE referencia_id = NEW.id AND producto_id = v_rec.producto_id AND lote_id = v_rec.lote_id;
    IF v_net > 0 THEN
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
      VALUES (NEW.empresa_id, 'entrada', v_rec.producto_id, v_net, v_rec.almacen_id, v_rec.lote_id, v_ref_tipo, NEW.id, COALESCE(NEW.fecha, CURRENT_DATE),
              'Reversa lote · ' || (CASE WHEN NEW.status = 'cancelado' THEN 'cancelación' ELSE 'vuelta a borrador' END) || ' venta');
    END IF;
  END LOOP;
  RETURN NEW;
END; $function$;