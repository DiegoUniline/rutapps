-- VENTA DE RUTA ATÓMICA / NUNCA "COBRADA SIN STOCK" (bug #1 del diagnóstico).
--
-- Problema: la venta de ruta (venta_directa + entrega_inmediata) descontaba stock
-- al INSERTAR sus líneas (trigger apply_immediate_sale_inventory). Si el conteo
-- digital no alcanzaba y el producto NO permitía vender sin stock, la BD RECHAZABA
-- las líneas (RAISE 'Stock insuficiente'). Como al sincronizar offline la cabecera
-- y el COBRO suben por separado ANTES que las líneas, quedaba: venta cobrada, sin
-- productos, sin movimiento de inventario. Exactamente "cobré pero no bajó el stock".
--
-- Decisión (Opción A, confirmada por el dueño): la venta de ruta es FÍSICA — el
-- vendedor entrega lo que trae en el camión. La venta SIEMPRE se registra. Si el
-- conteo digital no alcanzaba, el stock del camión queda en NEGATIVO y el movimiento
-- se marca "SIN STOCK SUFICIENTE (revisar)". Se cuadra en la LIQUIDACIÓN (descarga de
-- camión / conteo físico). Así nunca se pierde una venta real ni se cobra sin
-- registrar producto, y el negativo señala exactamente qué revisar.
--
-- Solo cambia la venta POS inmediata de ruta. Los flujos de bodega/entregas
-- (apply_delivered_direct_sale_inventory, apply_pedido_entregado_inventory) siguen
-- validando stock como hoy. El trigger es AFTER INSERT (un re-sync hace UPDATE, no
-- re-dispara) → idempotente, no descuenta doble.

CREATE OR REPLACE FUNCTION public.apply_immediate_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_venta public.ventas%rowtype;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
  v_prod_name text;
  v_almacen_id uuid;
  v_sin_stock boolean;
begin
  select * into v_venta from public.ventas where id = new.venta_id;
  if v_venta.id is null then return new; end if;
  if v_venta.tipo = 'saldo_inicial' then return new; end if;
  if v_venta.tipo <> 'venta_directa' or coalesce(v_venta.entrega_inmediata, false) is not true then return new; end if;

  select nombre, vender_sin_stock into v_prod_name, v_vender_sin_stock from productos where id = new.producto_id;

  -- Resolver almacén con fallback al perfil del vendedor
  v_almacen_id := coalesce(
    v_venta.almacen_id,
    (select almacen_id from public.profiles where id = v_venta.vendedor_id limit 1)
  );

  if v_almacen_id is null then
    raise exception 'No se puede registrar la venta % sin almacén asignado. Asigna un almacén al vendedor en su perfil o a la venta.',
      coalesce(v_venta.folio, v_venta.id::text);
  end if;

  select id, cantidad into v_stock_id, v_stock_actual
  from public.stock_almacen
  where almacen_id = v_almacen_id and producto_id = new.producto_id
  for update;

  v_new_qty := coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0);

  -- Opción A: NO se rechaza la venta de ruta. Si el conteo no alcanzaba, el stock
  -- queda negativo y se marca para revisar (se cuadra en la liquidación).
  v_sin_stock := (not coalesce(v_vender_sin_stock, false)) and v_new_qty < 0;

  if v_stock_id is not null then
    update public.stock_almacen
    set cantidad = v_new_qty, updated_at = now()
    where id = v_stock_id;
  else
    insert into public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    values (v_venta.empresa_id, v_almacen_id, new.producto_id, v_new_qty);
  end if;

  insert into public.movimientos_inventario
    (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
  values
    (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad,
     v_almacen_id, 'venta', v_venta.id, coalesce(v_venta.vendedor_id, v_venta.cliente_id),
     coalesce(v_venta.fecha, current_date), now(),
     concat('Venta POS ', coalesce(v_venta.folio, v_venta.id::text),
            case when v_sin_stock then ' · SIN STOCK SUFICIENTE (revisar)' else '' end));

  return new;
end;
$function$;
