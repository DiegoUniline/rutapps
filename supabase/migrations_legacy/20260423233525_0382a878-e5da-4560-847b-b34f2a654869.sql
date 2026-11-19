-- ============================================================
-- Migración A: Blindaje de triggers de inventario
-- Resuelve almacén faltante con fallback al perfil del vendedor.
-- Si no hay almacén disponible, rechaza la operación.
-- NO modifica datos históricos. NO persiste el almacén en ventas.
-- ============================================================

-- ---------- 1) Venta directa entregada ----------
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
  v_prod_name text;
  v_almacen_id uuid;
BEGIN
  IF NEW.tipo = 'saldo_inicial' THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.entrega_inmediata, false) IS TRUE THEN RETURN NEW; END IF;
  IF NEW.status <> 'entregado' OR OLD.status = 'entregado' THEN RETURN NEW; END IF;

  -- Resolver almacén: primero el de la venta, si no, el del perfil del vendedor
  v_almacen_id := COALESCE(
    NEW.almacen_id,
    (SELECT almacen_id FROM public.profiles WHERE id = NEW.vendedor_id LIMIT 1)
  );

  IF v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'No se puede entregar la venta % sin almacén asignado. Asigna un almacén al vendedor en su perfil o a la venta.',
      COALESCE(NEW.folio, NEW.id::text);
  END IF;

  FOR v_linea IN
    SELECT producto_id, cantidad FROM public.venta_lineas WHERE venta_id = NEW.id
  LOOP
    SELECT nombre, vender_sin_stock INTO v_prod_name, v_vender_sin_stock
    FROM public.productos WHERE id = v_linea.producto_id;

    SELECT id, cantidad INTO v_stock_id, v_stock_actual
    FROM public.stock_almacen
    WHERE almacen_id = v_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

    v_new_qty := COALESCE(v_stock_actual, 0) - COALESCE(v_linea.cantidad, 0);

    IF NOT COALESCE(v_vender_sin_stock, false) AND v_new_qty < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén para "%". Disponible: %, solicitado: %',
        COALESCE(v_prod_name, v_linea.producto_id::text),
        COALESCE(v_stock_actual, 0), COALESCE(v_linea.cantidad, 0);
    END IF;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_stock_id;
    ELSE
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (NEW.empresa_id, v_almacen_id, v_linea.producto_id, v_new_qty);
    END IF;

    INSERT INTO public.movimientos_inventario
      (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    VALUES
      (gen_random_uuid(), NEW.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad,
       v_almacen_id, 'venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id),
       COALESCE(NEW.fecha, current_date), now(), concat('Venta entregada ', COALESCE(NEW.folio, NEW.id::text)));
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------- 2) Pedido entregado ----------
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
  v_almacen_id uuid;
begin
  if new.tipo = 'saldo_inicial' then return new; end if;
  if new.tipo <> 'pedido' then return new; end if;
  if new.status <> 'entregado' then return new; end if;
  if old.status = 'entregado' then return new; end if;

  -- Conservar guard original: si hay flujo de entregas, este trigger no debe duplicar
  select exists(
    select 1 from public.entregas e where e.pedido_id = new.id
  ) into v_has_entregas;

  if v_has_entregas then
    return new;
  end if;

  -- Resolver almacén con fallback al perfil del vendedor
  v_almacen_id := coalesce(
    new.almacen_id,
    (select almacen_id from public.profiles where id = new.vendedor_id limit 1)
  );

  if v_almacen_id is null then
    raise exception 'No se puede entregar el pedido % sin almacén asignado. Asigna un almacén al vendedor en su perfil o al pedido.',
      coalesce(new.folio, new.id::text);
  end if;

  for v_linea in
    select vl.producto_id, vl.cantidad from public.venta_lineas vl where vl.venta_id = new.id
  loop
    select vender_sin_stock into v_vender_sin_stock from productos where id = v_linea.producto_id;

    select id, cantidad into v_stock_id, v_stock_actual
    from public.stock_almacen
    where almacen_id = v_almacen_id and producto_id = v_linea.producto_id for update;

    v_new_qty := coalesce(v_stock_actual, 0) - coalesce(v_linea.cantidad, 0);
    if not coalesce(v_vender_sin_stock, false) and v_new_qty < 0 then
      raise exception 'Stock insuficiente en almacén para "%"',
        coalesce((select nombre from productos where id = v_linea.producto_id), '');
    end if;

    if v_stock_id is not null then
      update public.stock_almacen set cantidad = v_new_qty, updated_at = now() where id = v_stock_id;
    else
      insert into public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      values (new.empresa_id, v_almacen_id, v_linea.producto_id, v_new_qty);
    end if;

    insert into public.movimientos_inventario
      (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    values
      (gen_random_uuid(), new.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad,
       v_almacen_id, 'venta', new.id, coalesce(new.vendedor_id, new.cliente_id),
       coalesce(new.fecha, current_date), now(),
       concat('Pedido entregado ', coalesce(new.folio, new.id::text)));
  end loop;

  return new;
end;
$function$;

-- ---------- 3) Venta POS inmediata ----------
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
    values (v_venta.empresa_id, v_almacen_id, new.producto_id, v_new_qty);
  end if;

  insert into public.movimientos_inventario
    (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
  values
    (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad,
     v_almacen_id, 'venta', v_venta.id, coalesce(v_venta.vendedor_id, v_venta.cliente_id),
     coalesce(v_venta.fecha, current_date), now(),
     concat('Venta POS ', coalesce(v_venta.folio, v_venta.id::text)));

  return new;
end;
$function$;