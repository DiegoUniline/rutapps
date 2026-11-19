CREATE OR REPLACE FUNCTION public.apply_delivered_direct_sale_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
  v_has_active_carga boolean := false;
  v_prod_name text;
BEGIN
  IF NEW.tipo <> 'venta_directa' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.entrega_inmediata, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'entregado' OR OLD.status = 'entregado' THEN
    RETURN NEW;
  END IF;

  IF NEW.vendedor_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.cargas c
      WHERE c.vendedor_id = NEW.vendedor_id
        AND c.status IN ('pendiente', 'en_ruta')
    ) INTO v_has_active_carga;
  END IF;

  FOR v_linea IN
    SELECT producto_id, cantidad
    FROM public.venta_lineas
    WHERE venta_id = NEW.id
  LOOP
    SELECT nombre, vender_sin_stock
      INTO v_prod_name, v_vender_sin_stock
    FROM public.productos
    WHERE id = v_linea.producto_id;

    IF v_has_active_carga THEN
      SELECT id, cantidad_actual
        INTO v_stock_id, v_stock_actual
      FROM public.stock_camion
      WHERE vendedor_id = NEW.vendedor_id
        AND producto_id = v_linea.producto_id
      LIMIT 1
      FOR UPDATE;

      v_new_qty := COALESCE(v_stock_actual, 0) - COALESCE(v_linea.cantidad, 0);

      IF NOT COALESCE(v_vender_sin_stock, false) AND v_new_qty < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente en ruta para "%". Disponible: %, solicitado: %',
          COALESCE(v_prod_name, v_linea.producto_id::text),
          COALESCE(v_stock_actual, 0),
          COALESCE(v_linea.cantidad, 0);
      END IF;

      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_camion
        SET cantidad_actual = v_new_qty
        WHERE id = v_stock_id;
      ELSE
        INSERT INTO public.stock_camion (empresa_id, vendedor_id, producto_id, cantidad_inicial, cantidad_actual, fecha)
        VALUES (NEW.empresa_id, NEW.vendedor_id, v_linea.producto_id, 0, v_new_qty, COALESCE(NEW.fecha, current_date));
      END IF;

      INSERT INTO public.movimientos_inventario
        (id, empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      VALUES
        (gen_random_uuid(), NEW.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad,
         NEW.vendedor_id, 'venta_ruta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id),
         COALESCE(NEW.fecha, current_date), now(), concat('Venta entregada ', COALESCE(NEW.folio, NEW.id::text)));

    ELSIF NEW.almacen_id IS NOT NULL THEN
      SELECT id, cantidad
        INTO v_stock_id, v_stock_actual
      FROM public.stock_almacen
      WHERE almacen_id = NEW.almacen_id
        AND producto_id = v_linea.producto_id
      FOR UPDATE;

      v_new_qty := COALESCE(v_stock_actual, 0) - COALESCE(v_linea.cantidad, 0);

      IF NOT COALESCE(v_vender_sin_stock, false) AND v_new_qty < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente en almacén para "%". Disponible: %, solicitado: %',
          COALESCE(v_prod_name, v_linea.producto_id::text),
          COALESCE(v_stock_actual, 0),
          COALESCE(v_linea.cantidad, 0);
      END IF;

      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_almacen
        SET cantidad = v_new_qty,
            updated_at = now()
        WHERE id = v_stock_id;
      ELSE
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (NEW.empresa_id, NEW.almacen_id, v_linea.producto_id, v_new_qty);
      END IF;

      INSERT INTO public.movimientos_inventario
        (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      VALUES
        (gen_random_uuid(), NEW.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad,
         NEW.almacen_id, 'venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id),
         COALESCE(NEW.fecha, current_date), now(), concat('Venta entregada ', COALESCE(NEW.folio, NEW.id::text)));
    ELSE
      INSERT INTO public.movimientos_inventario
        (id, empresa_id, tipo, producto_id, cantidad, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      VALUES
        (gen_random_uuid(), NEW.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad,
         'venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id),
         COALESCE(NEW.fecha, current_date), now(), concat('Venta entregada ', COALESCE(NEW.folio, NEW.id::text), ' (sin ubicación)'));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_delivered_direct_sale_inventory ON public.ventas;

CREATE TRIGGER trg_apply_delivered_direct_sale_inventory
AFTER UPDATE OF status ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.apply_delivered_direct_sale_inventory();