
-- 1) surtir_linea_entrega: remove UPDATE productos SET cantidad
CREATE OR REPLACE FUNCTION public.surtir_linea_entrega(
  p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid,
  p_cantidad_surtida numeric, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric;
BEGIN
  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  IF NOT COALESCE(v_vender_sin_stock, false) THEN
    IF v_sa_id IS NULL OR p_cantidad_surtida > COALESCE(v_sa_qty, 0) THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén. Disponible: %', COALESCE(v_sa_qty, 0);
    END IF;
  END IF;

  IF v_sa_id IS NOT NULL THEN
    UPDATE stock_almacen SET cantidad = GREATEST(0, COALESCE(v_sa_qty, 0) - p_cantidad_surtida), updated_at = now() WHERE id = v_sa_id;
  END IF;

  -- productos.cantidad is now auto-recalculated by trigger

  UPDATE entrega_lineas SET cantidad_entregada = p_cantidad_surtida, almacen_origen_id = p_almacen_origen_id, hecho = true WHERE id = p_linea_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'salida', p_producto_id, p_cantidad_surtida, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega');
END;
$function$;

-- 2) recibir_linea_compra: remove UPDATE productos SET cantidad
CREATE OR REPLACE FUNCTION public.recibir_linea_compra(
  p_producto_id uuid, p_piezas numeric, p_almacen_id uuid,
  p_empresa_id uuid, p_compra_id uuid, p_folio text, p_user_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sa_id uuid;
  v_sa_qty numeric;
  v_today date := current_date;
BEGIN
  -- Upsert stock_almacen atomically
  IF p_almacen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen WHERE almacen_id = p_almacen_id AND producto_id = p_producto_id FOR UPDATE;

    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + p_piezas, updated_at = now() WHERE id = v_sa_id;
    ELSE
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (p_empresa_id, p_almacen_id, p_producto_id, p_piezas);
    END IF;
  END IF;

  -- productos.cantidad is now auto-recalculated by trigger

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'entrada', p_producto_id, p_piezas, p_almacen_id, 'compra', p_compra_id, p_user_id, v_today, concat('Compra ', COALESCE(p_folio, p_compra_id::text), ' recibida'));
END;
$function$;

-- 3) apply_immediate_sale_inventory: remove UPDATE productos
CREATE OR REPLACE FUNCTION public.apply_immediate_sale_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_venta public.ventas%rowtype;
  v_has_active_carga boolean := false;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
begin
  select * into v_venta from public.ventas where id = new.venta_id;
  if v_venta.id is null then return new; end if;
  if v_venta.tipo <> 'venta_directa' or coalesce(v_venta.entrega_inmediata, false) is not true or v_venta.almacen_id is null then return new; end if;

  select exists(select 1 from public.cargas c where c.vendedor_id = v_venta.vendedor_id and c.status in ('pendiente', 'en_ruta')) into v_has_active_carga;
  if v_has_active_carga then return new; end if;

  select id, cantidad into v_stock_id, v_stock_actual
  from public.stock_almacen where almacen_id = v_venta.almacen_id and producto_id = new.producto_id limit 1;

  if v_stock_id is not null then
    update public.stock_almacen set cantidad = greatest(0, coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0)), updated_at = now() where id = v_stock_id;
  end if;

  -- productos.cantidad is now auto-recalculated by trigger on stock_almacen

  insert into public.movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
  values (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad, v_venta.almacen_id, 'venta_ruta', v_venta.id, coalesce(v_venta.vendedor_id, v_venta.cliente_id), coalesce(v_venta.fecha, current_date), now(), concat('Venta móvil ', coalesce(v_venta.folio, v_venta.id::text)));

  return new;
end;
$function$;

-- 4) restore_cancelled_sale_inventory: remove UPDATE productos
CREATE OR REPLACE FUNCTION public.restore_cancelled_sale_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric;
  v_has_active_carga boolean;
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'venta_directa' OR COALESCE(NEW.entrega_inmediata, false) IS NOT TRUE OR NEW.almacen_id IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS(SELECT 1 FROM public.cargas c WHERE c.vendedor_id = NEW.vendedor_id AND c.status IN ('pendiente', 'en_ruta')) INTO v_has_active_carga;
  IF v_has_active_carga THEN RETURN NEW; END IF;

  FOR v_linea IN SELECT producto_id, cantidad FROM public.venta_lineas WHERE venta_id = NEW.id LOOP
    SELECT id, cantidad INTO v_stock_id, v_stock_actual FROM public.stock_almacen WHERE almacen_id = NEW.almacen_id AND producto_id = v_linea.producto_id LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stock_almacen SET cantidad = COALESCE(v_stock_actual, 0) + COALESCE(v_linea.cantidad, 0), updated_at = now() WHERE id = v_stock_id;
    ELSE
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (NEW.empresa_id, NEW.almacen_id, v_linea.producto_id, v_linea.cantidad);
    END IF;

    -- productos.cantidad is now auto-recalculated by trigger

    INSERT INTO public.movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    VALUES (gen_random_uuid(), NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, NEW.almacen_id, 'cancelacion_venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id), COALESCE(NEW.fecha, current_date), now(), concat('Devolución por cancelación de venta ', COALESCE(NEW.folio, NEW.id::text)));
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 5) confirmar_traspaso: remove UPDATE productos (already only operates on stock_almacen/stock_camion)
-- No change needed - it doesn't touch productos.cantidad

-- 6) cancelar_traspaso: same - already only operates on stock_almacen/stock_camion
-- No change needed
