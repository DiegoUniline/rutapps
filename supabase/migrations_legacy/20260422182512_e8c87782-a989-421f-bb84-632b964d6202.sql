CREATE OR REPLACE FUNCTION public.apply_pedido_entregado_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_linea record;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
  v_has_entregas boolean := false;
begin
  if new.tipo = 'saldo_inicial' then return new; end if;
  if new.tipo <> 'pedido' then return new; end if;
  if new.status <> 'entregado' then return new; end if;
  if old.status = 'entregado' then return new; end if;

  select exists(
    select 1
    from public.entregas e
    where e.pedido_id = new.id
  ) into v_has_entregas;

  -- Si el pedido ya está gestionado por el flujo de entregas,
  -- el inventario se controla en surtido/carga/entrega y no debe duplicarse aquí.
  if v_has_entregas then
    return new;
  end if;

  for v_linea in 
    select vl.producto_id, vl.cantidad from public.venta_lineas vl where vl.venta_id = new.id
  loop
    select vender_sin_stock into v_vender_sin_stock from productos where id = v_linea.producto_id;

    if new.almacen_id is not null then
      select id, cantidad into v_stock_id, v_stock_actual
      from public.stock_almacen 
      where almacen_id = new.almacen_id and producto_id = v_linea.producto_id for update;

      v_new_qty := coalesce(v_stock_actual, 0) - coalesce(v_linea.cantidad, 0);
      if not coalesce(v_vender_sin_stock, false) and v_new_qty < 0 then
        raise exception 'Stock insuficiente en almacén para "%"', 
          coalesce((select nombre from productos where id = v_linea.producto_id), '');
      end if;

      if v_stock_id is not null then
        update public.stock_almacen set cantidad = v_new_qty, updated_at = now() where id = v_stock_id;
      else
        insert into public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        values (new.empresa_id, new.almacen_id, v_linea.producto_id, v_new_qty);
      end if;
    end if;

    insert into public.movimientos_inventario 
      (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    values 
      (gen_random_uuid(), new.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, 
       new.almacen_id, 'venta', new.id, coalesce(new.vendedor_id, new.cliente_id), 
       coalesce(new.fecha, current_date), now(), 
       concat('Pedido entregado ', coalesce(new.folio, new.id::text)));
  end loop;

  return new;
end;
$function$;