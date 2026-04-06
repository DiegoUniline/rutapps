-- Make the apply_immediate_sale_inventory trigger more robust
-- Use FOR UPDATE to prevent race conditions and handle missing stock_almacen rows
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
begin
  select * into v_venta from public.ventas where id = new.venta_id;
  if v_venta.id is null then return new; end if;
  if v_venta.tipo <> 'venta_directa' or coalesce(v_venta.entrega_inmediata, false) is not true or v_venta.almacen_id is null then return new; end if;

  select exists(select 1 from public.cargas c where c.vendedor_id = v_venta.vendedor_id and c.status in ('pendiente', 'en_ruta')) into v_has_active_carga;
  if v_has_active_carga then return new; end if;

  -- Use FOR UPDATE to prevent race conditions
  select id, cantidad into v_stock_id, v_stock_actual
  from public.stock_almacen 
  where almacen_id = v_venta.almacen_id and producto_id = new.producto_id 
  for update;

  if v_stock_id is not null then
    update public.stock_almacen 
    set cantidad = greatest(0, coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0)), updated_at = now() 
    where id = v_stock_id;
  else
    -- Create stock_almacen row if missing (edge case: product never had stock in this warehouse)
    insert into public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    values (v_venta.empresa_id, v_venta.almacen_id, new.producto_id, greatest(0, -coalesce(new.cantidad, 0)));
  end if;

  -- productos.cantidad is auto-recalculated by trigger on stock_almacen

  insert into public.movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
  values (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad, v_venta.almacen_id, 'venta', v_venta.id, coalesce(v_venta.vendedor_id, v_venta.cliente_id), coalesce(v_venta.fecha, current_date), now(), concat('Venta POS ', coalesce(v_venta.folio, v_venta.id::text)));

  return new;
end;
$function$;