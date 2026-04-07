-- Migration 4: Fix restore_cancelled_sale_inventory — cover both immediate and delivered sales
CREATE OR REPLACE FUNCTION public.restore_cancelled_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric;
  v_has_active_carga boolean := false;
  v_was_delivered boolean;
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;

  -- Determine if stock was actually deducted
  v_was_delivered := (COALESCE(OLD.entrega_inmediata, false) = true) OR (OLD.status = 'entregado');
  IF NOT v_was_delivered THEN RETURN NEW; END IF;

  -- Check if vendedor had active carga (stock was on truck, not almacen)
  IF NEW.vendedor_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.cargas c 
      WHERE c.vendedor_id = NEW.vendedor_id 
      AND c.status IN ('pendiente', 'en_ruta')
    ) INTO v_has_active_carga;
  END IF;

  FOR v_linea IN SELECT producto_id, cantidad FROM public.venta_lineas WHERE venta_id = NEW.id LOOP
    IF v_has_active_carga THEN
      -- Restore to stock_camion
      SELECT id, cantidad_actual INTO v_stock_id, v_stock_actual
      FROM public.stock_camion
      WHERE vendedor_id = NEW.vendedor_id AND producto_id = v_linea.producto_id
      ORDER BY fecha DESC LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_camion SET cantidad_actual = COALESCE(v_stock_actual, 0) + COALESCE(v_linea.cantidad, 0) WHERE id = v_stock_id;
      ELSE
        INSERT INTO public.stock_camion (empresa_id, vendedor_id, producto_id, cantidad_inicial, cantidad_actual, fecha)
        VALUES (NEW.empresa_id, NEW.vendedor_id, v_linea.producto_id, 0, v_linea.cantidad, current_date);
      END IF;

      INSERT INTO public.movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      VALUES (gen_random_uuid(), NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, NEW.vendedor_id, 'cancelacion_venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id), COALESCE(NEW.fecha, current_date), now(), concat('Cancelación venta ', COALESCE(NEW.folio, NEW.id::text), ' (devuelto a ruta)'));

    ELSIF NEW.almacen_id IS NOT NULL THEN
      -- Restore to stock_almacen
      SELECT id, cantidad INTO v_stock_id, v_stock_actual
      FROM public.stock_almacen
      WHERE almacen_id = NEW.almacen_id AND producto_id = v_linea.producto_id
      LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_almacen SET cantidad = COALESCE(v_stock_actual, 0) + COALESCE(v_linea.cantidad, 0), updated_at = now() WHERE id = v_stock_id;
      ELSE
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (NEW.empresa_id, NEW.almacen_id, v_linea.producto_id, v_linea.cantidad);
      END IF;

      INSERT INTO public.movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      VALUES (gen_random_uuid(), NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, NEW.almacen_id, 'cancelacion_venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id), COALESCE(NEW.fecha, current_date), now(), concat('Devolución por cancelación de venta ', COALESCE(NEW.folio, NEW.id::text)));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;