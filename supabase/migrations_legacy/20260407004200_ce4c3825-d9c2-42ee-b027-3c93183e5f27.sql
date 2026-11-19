
-- 1. Fix confirmar_traspaso: replace GREATEST(0,...) with validation
CREATE OR REPLACE FUNCTION public.confirmar_traspaso(p_traspaso_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_traspaso traspasos%ROWTYPE;
  v_linea RECORD;
  v_today date := CURRENT_DATE;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_prod_qty numeric;
  v_prod_name text;
  v_allow_negative boolean;
  v_sc RECORD;
  v_new_qty numeric;
BEGIN
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status != 'borrador' THEN RAISE EXCEPTION 'Solo se puede confirmar un traspaso en borrador'; END IF;

  FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
    SELECT nombre, vender_sin_stock INTO v_prod_name, v_allow_negative
    FROM productos WHERE id = v_linea.producto_id;

    -- === DEDUCT FROM ORIGIN ===
    IF v_traspaso.almacen_origen_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_sa_id, v_sa_qty
      FROM stock_almacen
      WHERE almacen_id = v_traspaso.almacen_origen_id AND producto_id = v_linea.producto_id
      FOR UPDATE;

      IF v_sa_id IS NOT NULL THEN
        v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
        IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
          RAISE EXCEPTION 'Stock insuficiente en origen para "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
        END IF;
        UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
      END IF;

      INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || COALESCE(v_traspaso.folio, ''));
    END IF;

    IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
      SELECT id, cantidad_actual INTO v_sc
      FROM stock_camion
      WHERE vendedor_id = v_traspaso.vendedor_origen_id AND producto_id = v_linea.producto_id AND cantidad_actual > 0
      ORDER BY created_at ASC LIMIT 1
      FOR UPDATE;

      IF v_sc.id IS NOT NULL THEN
        IF NOT COALESCE(v_allow_negative, false) AND v_linea.cantidad > v_sc.cantidad_actual THEN
          RAISE EXCEPTION 'Stock insuficiente en ruta para "%". Disponible: %, solicitado: %', v_prod_name, v_sc.cantidad_actual, v_linea.cantidad;
        END IF;
        UPDATE stock_camion SET cantidad_actual = v_sc.cantidad_actual - v_linea.cantidad WHERE id = v_sc.id;
      END IF;

      INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_traspaso.vendedor_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || COALESCE(v_traspaso.folio, '') || ' (salida ruta)');
    END IF;

    -- === ADD TO DESTINATION ===
    IF v_traspaso.almacen_destino_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_sa_id, v_sa_qty
      FROM stock_almacen
      WHERE almacen_id = v_traspaso.almacen_destino_id AND producto_id = v_linea.producto_id
      FOR UPDATE;

      IF v_sa_id IS NOT NULL THEN
        UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
      ELSE
        INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (v_traspaso.empresa_id, v_traspaso.almacen_destino_id, v_linea.producto_id, v_linea.cantidad);
      END IF;

      INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || COALESCE(v_traspaso.folio, ''));
    END IF;

    IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
      INSERT INTO stock_camion (empresa_id, vendedor_id, producto_id, cantidad_inicial, cantidad_actual, fecha)
      VALUES (v_traspaso.empresa_id, v_traspaso.vendedor_destino_id, v_linea.producto_id, v_linea.cantidad, v_linea.cantidad, v_today);

      INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.vendedor_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || COALESCE(v_traspaso.folio, '') || ' (entrada ruta)');
    END IF;
  END LOOP;

  UPDATE traspasos SET status = 'confirmado' WHERE id = p_traspaso_id;
END;
$function$;

-- 2. Fix cancelar_traspaso: replace GREATEST(0,...) with validation on deduct side
CREATE OR REPLACE FUNCTION public.cancelar_traspaso(p_traspaso_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_traspaso traspasos%ROWTYPE;
  v_linea RECORD;
  v_today date := CURRENT_DATE;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_sc RECORD;
  v_new_qty numeric;
  v_prod_name text;
  v_allow_negative boolean;
BEGIN
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status = 'cancelado' THEN RAISE EXCEPTION 'Este traspaso ya está cancelado'; END IF;

  IF v_traspaso.status = 'confirmado' THEN
    FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
      SELECT nombre, vender_sin_stock INTO v_prod_name, v_allow_negative FROM productos WHERE id = v_linea.producto_id;

      -- === RETURN TO ORIGIN (always positive — adding back) ===
      IF v_traspaso.almacen_origen_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen
        WHERE almacen_id = v_traspaso.almacen_origen_id AND producto_id = v_linea.producto_id
        FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
        ELSE
          INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
          VALUES (v_traspaso.empresa_id, v_traspaso.almacen_origen_id, v_linea.producto_id, v_linea.cantidad);
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, ''));
      END IF;

      IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
        INSERT INTO stock_camion (empresa_id, vendedor_id, producto_id, cantidad_inicial, cantidad_actual, fecha)
        VALUES (v_traspaso.empresa_id, v_traspaso.vendedor_origen_id, v_linea.producto_id, v_linea.cantidad, v_linea.cantidad, v_today);

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.vendedor_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (devuelto a ruta)');
      END IF;

      -- === DEDUCT FROM DESTINATION (validate stock) ===
      IF v_traspaso.almacen_destino_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen
        WHERE almacen_id = v_traspaso.almacen_destino_id AND producto_id = v_linea.producto_id
        FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
          IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
            RAISE EXCEPTION 'Stock insuficiente en destino para cancelar "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
          END IF;
          UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, ''));
      END IF;

      IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
        SELECT id, cantidad_actual INTO v_sc
        FROM stock_camion
        WHERE vendedor_id = v_traspaso.vendedor_destino_id AND producto_id = v_linea.producto_id AND cantidad_actual > 0
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE;

        IF v_sc.id IS NOT NULL THEN
          IF NOT COALESCE(v_allow_negative, false) AND v_linea.cantidad > v_sc.cantidad_actual THEN
            RAISE EXCEPTION 'Stock insuficiente en ruta destino para cancelar "%". Disponible: %, solicitado: %', v_prod_name, v_sc.cantidad_actual, v_linea.cantidad;
          END IF;
          UPDATE stock_camion SET cantidad_actual = v_sc.cantidad_actual - v_linea.cantidad WHERE id = v_sc.id;
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_traspaso.vendedor_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (retirado de ruta)');
      END IF;

    END LOOP;
  END IF;

  UPDATE traspasos SET status = 'cancelado' WHERE id = p_traspaso_id;
END;
$function$;

-- 3. Fix surtir_linea_entrega: replace GREATEST(0,...) with proper deduction
CREATE OR REPLACE FUNCTION public.surtir_linea_entrega(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_cantidad_surtida numeric, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_new_qty numeric;
BEGIN
  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  v_new_qty := COALESCE(v_sa_qty, 0) - p_cantidad_surtida;

  IF NOT COALESCE(v_vender_sin_stock, false) THEN
    IF v_sa_id IS NULL OR v_new_qty < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén. Disponible: %, solicitado: %', COALESCE(v_sa_qty, 0), p_cantidad_surtida;
    END IF;
  END IF;

  IF v_sa_id IS NOT NULL THEN
    UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
  END IF;

  UPDATE entrega_lineas SET cantidad_entregada = p_cantidad_surtida, almacen_origen_id = p_almacen_origen_id, hecho = true WHERE id = p_linea_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'salida', p_producto_id, p_cantidad_surtida, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega');
END;
$function$;

-- 4. Fix apply_immediate_sale_inventory: replace GREATEST(0,...) with validation
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
begin
  select * into v_venta from public.ventas where id = new.venta_id;
  if v_venta.id is null then return new; end if;
  if v_venta.tipo <> 'venta_directa' or coalesce(v_venta.entrega_inmediata, false) is not true or v_venta.almacen_id is null then return new; end if;

  select exists(select 1 from public.cargas c where c.vendedor_id = v_venta.vendedor_id and c.status in ('pendiente', 'en_ruta')) into v_has_active_carga;
  if v_has_active_carga then return new; end if;

  select vender_sin_stock into v_vender_sin_stock from productos where id = new.producto_id;

  select id, cantidad into v_stock_id, v_stock_actual
  from public.stock_almacen 
  where almacen_id = v_venta.almacen_id and producto_id = new.producto_id 
  for update;

  v_new_qty := coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0);

  if not coalesce(v_vender_sin_stock, false) and v_new_qty < 0 then
    raise exception 'Stock insuficiente para "%". Disponible: %, solicitado: %', 
      coalesce((select nombre from productos where id = new.producto_id), new.producto_id::text),
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

-- 5. Fix recalc_producto_stock_total: include negative stock_camion
CREATE OR REPLACE FUNCTION public.recalc_producto_stock_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_producto_id uuid;
  v_total numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_producto_id := OLD.producto_id;
  ELSE
    v_producto_id := NEW.producto_id;
  END IF;

  SELECT
    COALESCE((SELECT SUM(cantidad) FROM stock_almacen WHERE producto_id = v_producto_id), 0)
    +
    COALESCE((SELECT SUM(cantidad_actual) FROM stock_camion WHERE producto_id = v_producto_id), 0)
  INTO v_total;

  UPDATE productos SET cantidad = v_total WHERE id = v_producto_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;
