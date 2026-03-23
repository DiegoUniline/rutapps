-- Descuenta inventario automáticamente cuando una venta directa inmediata se registra sin carga activa.
create or replace function public.apply_immediate_sale_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_has_active_carga boolean := false;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_producto_actual numeric := 0;
begin
  select * into v_venta
  from public.ventas
  where id = new.venta_id;

  if v_venta.id is null then
    return new;
  end if;

  if v_venta.tipo <> 'venta_directa'
     or coalesce(v_venta.entrega_inmediata, false) is not true
     or v_venta.almacen_id is null then
    return new;
  end if;

  select exists(
    select 1
    from public.cargas c
    where c.vendedor_id = v_venta.vendedor_id
      and c.status in ('pendiente', 'en_ruta')
  ) into v_has_active_carga;

  if v_has_active_carga then
    return new;
  end if;

  select id, cantidad
  into v_stock_id, v_stock_actual
  from public.stock_almacen
  where almacen_id = v_venta.almacen_id
    and producto_id = new.producto_id
  limit 1;

  if v_stock_id is not null then
    update public.stock_almacen
    set cantidad = greatest(0, coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0)),
        updated_at = now()
    where id = v_stock_id;
  end if;

  select cantidad
  into v_producto_actual
  from public.productos
  where id = new.producto_id;

  update public.productos
  set cantidad = greatest(0, coalesce(v_producto_actual, 0) - coalesce(new.cantidad, 0))
  where id = new.producto_id;

  insert into public.movimientos_inventario (
    id,
    empresa_id,
    tipo,
    producto_id,
    cantidad,
    almacen_origen_id,
    referencia_tipo,
    referencia_id,
    user_id,
    fecha,
    created_at,
    notas
  ) values (
    gen_random_uuid(),
    v_venta.empresa_id,
    'salida',
    new.producto_id,
    new.cantidad,
    v_venta.almacen_id,
    'venta_ruta',
    v_venta.id,
    coalesce(v_venta.vendedor_id, v_venta.cliente_id),
    coalesce(v_venta.fecha, current_date),
    now(),
    concat('Venta móvil ', coalesce(v_venta.folio, v_venta.id::text))
  );

  return new;
end;
$$;

drop trigger if exists trg_apply_immediate_sale_inventory on public.venta_lineas;

create trigger trg_apply_immediate_sale_inventory
after insert on public.venta_lineas
for each row
execute function public.apply_immediate_sale_inventory();