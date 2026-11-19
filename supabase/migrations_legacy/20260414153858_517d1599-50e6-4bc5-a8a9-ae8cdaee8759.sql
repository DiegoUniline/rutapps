
-- 1. Add 'saldo_inicial' to tipo_venta enum
ALTER TYPE public.tipo_venta ADD VALUE IF NOT EXISTS 'saldo_inicial';

-- 2. Add columns to ventas
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS es_saldo_inicial boolean NOT NULL DEFAULT false;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS concepto text;

-- 3. Create registrar_saldo_inicial RPC
CREATE OR REPLACE FUNCTION public.registrar_saldo_inicial(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_monto numeric,
  p_fecha date DEFAULT CURRENT_DATE,
  p_concepto text DEFAULT 'Saldo anterior',
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venta_id uuid;
  v_folio text;
BEGIN
  -- Generate folio
  SELECT 'SAL-' || LPAD((COALESCE(MAX(
    CASE WHEN folio ~ '^SAL-[0-9]+$'
      THEN CAST(SUBSTRING(folio FROM 5) AS INT)
      ELSE 0
    END
  ), 0) + 1)::TEXT, 4, '0')
  INTO v_folio
  FROM public.ventas
  WHERE empresa_id = p_empresa_id;

  INSERT INTO public.ventas (
    empresa_id, cliente_id, total, saldo_pendiente,
    subtotal, iva_total, ieps_total,
    tipo, es_saldo_inicial, fecha, concepto,
    status, condicion_pago, folio, vendedor_id
  ) VALUES (
    p_empresa_id, p_cliente_id, p_monto, p_monto,
    p_monto, 0, 0,
    'saldo_inicial', true, p_fecha, p_concepto,
    'confirmado', 'credito', v_folio, NULL
  ) RETURNING id INTO v_venta_id;

  RETURN v_venta_id;
END;
$$;

-- 4. Update auto_folio_venta to handle saldo_inicial
CREATE OR REPLACE FUNCTION public.auto_folio_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    IF NEW.tipo = 'saldo_inicial' THEN
      SELECT 'SAL-' || LPAD((COALESCE(MAX(
        CASE WHEN folio ~ '^SAL-[0-9]+$'
          THEN CAST(SUBSTRING(folio FROM 5) AS INT)
          ELSE 0
        END
      ), 0) + 1)::TEXT, 4, '0')
      INTO NEW.folio
      FROM public.ventas
      WHERE empresa_id = NEW.empresa_id;
    ELSE
      NEW.folio := next_folio(
        CASE WHEN NEW.tipo = 'pedido' THEN 'PED' ELSE 'VTA' END,
        NEW.empresa_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Update inventory triggers to skip saldo_inicial

-- apply_immediate_sale_inventory: skip saldo_inicial
CREATE OR REPLACE FUNCTION public.apply_immediate_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_venta public.ventas%rowtype;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
  v_prod_name text;
begin
  select * into v_venta from public.ventas where id = new.venta_id;
  if v_venta.id is null then return new; end if;
  -- Skip saldo_inicial
  if v_venta.tipo = 'saldo_inicial' then return new; end if;
  if v_venta.tipo <> 'venta_directa' or coalesce(v_venta.entrega_inmediata, false) is not true then return new; end if;

  select nombre, vender_sin_stock into v_prod_name, v_vender_sin_stock from productos where id = new.producto_id;

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
$$;

-- apply_delivered_direct_sale_inventory: skip saldo_inicial
CREATE OR REPLACE FUNCTION public.apply_delivered_direct_sale_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
  v_prod_name text;
BEGIN
  -- Skip saldo_inicial
  IF NEW.tipo = 'saldo_inicial' THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.entrega_inmediata, false) IS TRUE THEN RETURN NEW; END IF;
  IF NEW.status <> 'entregado' OR OLD.status = 'entregado' THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT producto_id, cantidad FROM public.venta_lineas WHERE venta_id = NEW.id
  LOOP
    SELECT nombre, vender_sin_stock INTO v_prod_name, v_vender_sin_stock FROM public.productos WHERE id = v_linea.producto_id;

    IF NEW.almacen_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_stock_id, v_stock_actual
      FROM public.stock_almacen
      WHERE almacen_id = NEW.almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

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
$$;

-- apply_pedido_entregado_inventory: skip saldo_inicial
CREATE OR REPLACE FUNCTION public.apply_pedido_entregado_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_linea record;
  v_stock_id uuid;
  v_stock_actual numeric := 0;
  v_new_qty numeric;
  v_vender_sin_stock boolean;
begin
  -- Skip saldo_inicial
  if new.tipo = 'saldo_inicial' then return new; end if;
  if new.tipo <> 'pedido' then return new; end if;
  if new.status <> 'entregado' then return new; end if;
  if old.status = 'entregado' then return new; end if;

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
$$;

-- Also update restore_cancelled_sale_inventory to skip saldo_inicial
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
  v_was_delivered boolean;
BEGIN
  -- Skip saldo_inicial
  IF NEW.tipo = 'saldo_inicial' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('cancelado', 'borrador') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;

  v_was_delivered := (COALESCE(OLD.entrega_inmediata, false) = true) OR (OLD.status = 'entregado');
  IF NOT v_was_delivered THEN RETURN NEW; END IF;

  IF NEW.almacen_id IS NULL THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT producto_id, cantidad FROM public.venta_lineas WHERE venta_id = NEW.id
  LOOP
    SELECT id, cantidad INTO v_stock_id, v_stock_actual
      FROM public.stock_almacen
      WHERE almacen_id = NEW.almacen_id AND producto_id = v_linea.producto_id LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stock_almacen
        SET cantidad = COALESCE(v_stock_actual, 0) + COALESCE(v_linea.cantidad, 0), updated_at = now()
        WHERE id = v_stock_id;
    ELSE
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (NEW.empresa_id, NEW.almacen_id, v_linea.producto_id, v_linea.cantidad);
    END IF;

    INSERT INTO public.movimientos_inventario
      (id, empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    VALUES
      (gen_random_uuid(), NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad,
       NEW.almacen_id, 'cancelacion_venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id),
       COALESCE(NEW.fecha, current_date), now(),
       concat('Cancelación venta ', COALESCE(NEW.folio, NEW.id::text)));
  END LOOP;

  RETURN NEW;
END;
$$;
