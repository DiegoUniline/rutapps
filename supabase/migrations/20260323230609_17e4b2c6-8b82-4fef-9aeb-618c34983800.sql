
CREATE OR REPLACE FUNCTION public.restore_cancelled_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric;
  v_producto_actual numeric;
  v_has_active_carga boolean;
BEGIN
  -- Only act when status changes TO cancelado
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Only restore for venta_directa with entrega_inmediata and an almacen
  IF NEW.tipo <> 'venta_directa'
     OR COALESCE(NEW.entrega_inmediata, false) IS NOT TRUE
     OR NEW.almacen_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if there was an active carga (same logic as deduction trigger)
  SELECT EXISTS(
    SELECT 1 FROM public.cargas c
    WHERE c.vendedor_id = NEW.vendedor_id
      AND c.status IN ('pendiente', 'en_ruta')
  ) INTO v_has_active_carga;

  -- If there was a carga, inventory was managed via carga flow, not stock_almacen
  IF v_has_active_carga THEN
    RETURN NEW;
  END IF;

  -- Restore stock for each line
  FOR v_linea IN
    SELECT producto_id, cantidad FROM public.venta_lineas WHERE venta_id = NEW.id
  LOOP
    -- Restore stock_almacen
    SELECT id, cantidad INTO v_stock_id, v_stock_actual
    FROM public.stock_almacen
    WHERE almacen_id = NEW.almacen_id AND producto_id = v_linea.producto_id
    LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = COALESCE(v_stock_actual, 0) + COALESCE(v_linea.cantidad, 0),
          updated_at = now()
      WHERE id = v_stock_id;
    ELSE
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (NEW.empresa_id, NEW.almacen_id, v_linea.producto_id, v_linea.cantidad);
    END IF;

    -- Restore producto.cantidad (global)
    SELECT cantidad INTO v_producto_actual FROM public.productos WHERE id = v_linea.producto_id;

    UPDATE public.productos
    SET cantidad = COALESCE(v_producto_actual, 0) + COALESCE(v_linea.cantidad, 0)
    WHERE id = v_linea.producto_id;

    -- Log restoration movement
    INSERT INTO public.movimientos_inventario (
      id, empresa_id, tipo, producto_id, cantidad,
      almacen_destino_id, referencia_tipo, referencia_id,
      user_id, fecha, created_at, notas
    ) VALUES (
      gen_random_uuid(), NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad,
      NEW.almacen_id, 'cancelacion_venta', NEW.id,
      COALESCE(NEW.vendedor_id, NEW.cliente_id), COALESCE(NEW.fecha, current_date), now(),
      concat('Devolución por cancelación de venta ', COALESCE(NEW.folio, NEW.id::text))
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restore_cancelled_sale_inventory
  AFTER UPDATE ON public.ventas
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_cancelled_sale_inventory();
