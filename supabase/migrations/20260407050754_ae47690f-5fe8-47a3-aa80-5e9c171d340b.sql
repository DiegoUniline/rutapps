-- Migration 3: Fix apply_immediate_sale_inventory — deduct stock_camion when carga active
CREATE OR REPLACE FUNCTION public.apply_immediate_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_venta public.ventas%rowtype;
  v_has_active_carga boolean := false;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
  v_prod_name text;
begin
  select * into v_venta from public.ventas where id = new.venta_id;
  if v_venta.id is null then return new; end if;
  if v_venta.tipo <> 'venta_directa' or coalesce(v_venta.entrega_inmediata, false) is not true then return new; end if;

  select nombre, vender_sin_stock into v_prod_name, v_vender_sin_stock from productos where id = new.producto_id;

  -- Check if vendedor has active carga
  if v_venta.vendedor_id is not null then
    select exists(
      select 1 from public.cargas c 
      where c.vendedor_id = v_venta.vendedor_id 
      and c.status in ('pendiente', 'en_ruta')
    ) into v_has_active_carga;
  end if;

  if v_has_active_carga then
    -- Deduct from stock_camion
    select id, cantidad_actual into v_stock_id, v_stock_actual
    from public.stock_camion
    where vendedor_id = v_venta.vendedor_id
      and producto_id = new.producto_id
    order by fecha desc
    limit 1
    for update;

    v_new_qty := coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0);

    if not coalesce(v_vender_sin_stock, false) and v_new_qty < 0 then
      raise exception 'Stock insuficiente en ruta para "%". Disponible: %, solicitado: %',
        coalesce(v_prod_name, new.producto_id::text),
        coalesce(v_stock_actual, 0),
        coalesce(new.cantidad, 0);
    end if;

    if v_stock_id is not null then
      update public.stock_camion
      set cantidad_actual = v_new_qty
      where id = v_stock_id;
    else
      insert into public.stock_camion (empresa_id, vendedor_id, producto_id, cantidad_inicial, cantidad_actual, fecha)
      values (v_venta.empresa_id, v_venta.vendedor_id, new.producto_id, 0, v_new_qty, coalesce(v_venta.fecha, current_date));
    end if;

    insert into public.movimientos_inventario 
      (id, empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    values 
      (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad, 
       v_venta.vendedor_id, 'venta_ruta', v_venta.id, 
       coalesce(v_venta.vendedor_id, v_venta.cliente_id), 
       coalesce(v_venta.fecha, current_date), now(), 
       concat('Venta ruta ', coalesce(v_venta.folio, v_venta.id::text)));
    return new;
  end if;

  -- No active carga: deduct from almacen (POS flow)
  if v_venta.almacen_id is null then
    insert into public.movimientos_inventario 
      (id, empresa_id, tipo, producto_id, cantidad, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    values 
      (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad, 
       'venta', v_venta.id, coalesce(v_venta.vendedor_id, v_venta.cliente_id), 
       coalesce(v_venta.fecha, current_date), now(), 
       concat('Venta ', coalesce(v_venta.folio, v_venta.id::text), ' (sin almacén)'));
    return new;
  end if;

  select id, cantidad into v_stock_id, v_stock_actual
  from public.stock_almacen 
  where almacen_id = v_venta.almacen_id and producto_id = new.producto_id 
  for update;

  v_new_qty := coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0);

  if not coalesce(v_vender_sin_stock, false) and v_new_qty < 0 then
    raise exception 'Stock insuficiente para "%". Disponible: %, solicitado: %', 
      coalesce(v_prod_name, new.producto_id::text),
      coalesce(v_stock_actual, 0), new.cantidad;
  end if;

  if v_stock_id is not null then
    update public.stock_almacen 
    set cantidad = v_new_qty, updated_at = now() 
    where id = v_stock_id;
  else
    insert into public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    values (v_venta.empresa_id, v_venta.almacen_id, new.producto_id, v_new_qty);
  end if;

  insert into public.movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
  values (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad, v_venta.almacen_id, 'venta', v_venta.id, coalesce(v_venta.vendedor_id, v_venta.cliente_id), coalesce(v_venta.fecha, current_date), now(), concat('Venta POS ', coalesce(v_venta.folio, v_venta.id::text)));

  return new;
end;
$function$;