
-- Fix: update stock_camion without updated_at (column doesn't exist)
-- Also fix trigger function
CREATE OR REPLACE FUNCTION public.apply_pedido_entregado_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_linea record;
  v_has_active_carga boolean := false;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
begin
  if new.tipo <> 'pedido' then return new; end if;
  if new.status <> 'entregado' then return new; end if;
  if old.status = 'entregado' then return new; end if;

  if new.vendedor_id is not null then
    select exists(
      select 1 from public.cargas c 
      where c.vendedor_id = new.vendedor_id 
      and c.status in ('pendiente', 'en_ruta')
    ) into v_has_active_carga;
  end if;

  for v_linea in 
    select vl.producto_id, vl.cantidad 
    from public.venta_lineas vl 
    where vl.venta_id = new.id
  loop
    select vender_sin_stock into v_vender_sin_stock from productos where id = v_linea.producto_id;

    if v_has_active_carga then
      select id, cantidad_actual into v_stock_id, v_stock_actual
      from public.stock_camion 
      where vendedor_id = new.vendedor_id and producto_id = v_linea.producto_id
      for update;

      v_new_qty := coalesce(v_stock_actual, 0) - coalesce(v_linea.cantidad, 0);

      if not coalesce(v_vender_sin_stock, false) and v_new_qty < 0 then
        raise exception 'Stock insuficiente en camión para "%". Disponible: %, solicitado: %', 
          coalesce((select nombre from productos where id = v_linea.producto_id), v_linea.producto_id::text),
          coalesce(v_stock_actual, 0), v_linea.cantidad;
      end if;

      if v_stock_id is not null then
        update public.stock_camion set cantidad_actual = v_new_qty where id = v_stock_id;
      else
        insert into public.stock_camion (empresa_id, vendedor_id, producto_id, cantidad_actual)
        values (new.empresa_id, new.vendedor_id, v_linea.producto_id, v_new_qty);
      end if;

      insert into public.movimientos_inventario 
        (id, empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      values 
        (gen_random_uuid(), new.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, 
         new.vendedor_id, 'venta_ruta', new.id, 
         coalesce(new.vendedor_id, new.cliente_id), 
         coalesce(new.fecha, current_date), now(), 
         concat('Pedido entregado ', coalesce(new.folio, new.id::text)));

    elsif new.almacen_id is not null then
      select id, cantidad into v_stock_id, v_stock_actual
      from public.stock_almacen 
      where almacen_id = new.almacen_id and producto_id = v_linea.producto_id
      for update;

      v_new_qty := coalesce(v_stock_actual, 0) - coalesce(v_linea.cantidad, 0);

      if not coalesce(v_vender_sin_stock, false) and v_new_qty < 0 then
        raise exception 'Stock insuficiente en almacén para "%". Disponible: %, solicitado: %', 
          coalesce((select nombre from productos where id = v_linea.producto_id), v_linea.producto_id::text),
          coalesce(v_stock_actual, 0), v_linea.cantidad;
      end if;

      if v_stock_id is not null then
        update public.stock_almacen set cantidad = v_new_qty, updated_at = now() where id = v_stock_id;
      else
        insert into public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        values (new.empresa_id, new.almacen_id, v_linea.producto_id, v_new_qty);
      end if;

      insert into public.movimientos_inventario 
        (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      values 
        (gen_random_uuid(), new.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, 
         new.almacen_id, 'venta', new.id, 
         coalesce(new.vendedor_id, new.cliente_id), 
         coalesce(new.fecha, current_date), now(), 
         concat('Pedido entregado ', coalesce(new.folio, new.id::text)));

    else
      insert into public.movimientos_inventario 
        (id, empresa_id, tipo, producto_id, cantidad, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
      values 
        (gen_random_uuid(), new.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, 
         'venta', new.id, coalesce(new.vendedor_id, new.cliente_id), 
         coalesce(new.fecha, current_date), now(), 
         concat('Pedido entregado ', coalesce(new.folio, new.id::text), ' (sin ubicación)'));
    end if;
  end loop;

  return new;
end;
$$;

-- Recalculate stock_camion for affected vendedores
UPDATE public.stock_camion sc
SET cantidad_actual = (
  SELECT COALESCE(SUM(CASE WHEN mi.tipo = 'entrada' THEN mi.cantidad ELSE -mi.cantidad END), 0)
  FROM movimientos_inventario mi
  WHERE mi.vendedor_destino_id = sc.vendedor_id AND mi.producto_id = sc.producto_id
)
WHERE EXISTS (
  SELECT 1 FROM ventas v 
  JOIN venta_lineas vl ON vl.venta_id = v.id 
  WHERE v.tipo = 'pedido' AND v.status IN ('entregado','facturado') 
  AND v.vendedor_id = sc.vendedor_id AND vl.producto_id = sc.producto_id
);

-- Recalculate productos.cantidad globally
UPDATE public.productos p
SET cantidad = (
  SELECT COALESCE(SUM(sa.cantidad), 0) + COALESCE((SELECT SUM(sc2.cantidad_actual) FROM stock_camion sc2 WHERE sc2.producto_id = p.id), 0)
  FROM stock_almacen sa WHERE sa.producto_id = p.id
)
WHERE EXISTS (
  SELECT 1 FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id 
  WHERE v.tipo = 'pedido' AND v.status IN ('entregado','facturado') AND vl.producto_id = p.id
);
