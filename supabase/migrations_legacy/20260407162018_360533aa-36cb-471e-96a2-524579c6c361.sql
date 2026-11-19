
-- 1) confirmar_traspaso: use stock_almacen for vendedor origins/destinations
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
  v_prod_name text;
  v_allow_negative boolean;
  v_new_qty numeric;
  v_vendedor_almacen_id uuid;
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
      FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_origen_id AND producto_id = v_linea.producto_id FOR UPDATE;

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

    -- Vendedor origin: resolve to their almacen_id
    IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
      SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_origen_id;
      IF v_vendedor_almacen_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
          IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
            RAISE EXCEPTION 'Stock insuficiente en ruta para "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
          END IF;
          UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || COALESCE(v_traspaso.folio, '') || ' (salida ruta)');
      END IF;
    END IF;

    -- === ADD TO DESTINATION ===
    IF v_traspaso.almacen_destino_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_sa_id, v_sa_qty
      FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_destino_id AND producto_id = v_linea.producto_id FOR UPDATE;

      IF v_sa_id IS NOT NULL THEN
        UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
      ELSE
        INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_traspaso.almacen_destino_id, v_linea.producto_id, v_linea.cantidad);
      END IF;

      INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || COALESCE(v_traspaso.folio, ''));
    END IF;

    -- Vendedor destination: resolve to their almacen_id
    IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
      SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_destino_id;
      IF v_vendedor_almacen_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
        ELSE
          INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_vendedor_almacen_id, v_linea.producto_id, v_linea.cantidad);
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || COALESCE(v_traspaso.folio, '') || ' (entrada ruta)');
      END IF;
    END IF;
  END LOOP;

  UPDATE traspasos SET status = 'confirmado' WHERE id = p_traspaso_id;
END;
$function$;

-- 2) cancelar_traspaso: use stock_almacen for vendedor origins/destinations
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
  v_new_qty numeric;
  v_prod_name text;
  v_allow_negative boolean;
  v_vendedor_almacen_id uuid;
BEGIN
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status = 'cancelado' THEN RAISE EXCEPTION 'Este traspaso ya está cancelado'; END IF;

  IF v_traspaso.status = 'confirmado' THEN
    FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
      SELECT nombre, vender_sin_stock INTO v_prod_name, v_allow_negative FROM productos WHERE id = v_linea.producto_id;

      -- === RETURN TO ORIGIN ===
      IF v_traspaso.almacen_origen_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_origen_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
        ELSE
          INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_traspaso.almacen_origen_id, v_linea.producto_id, v_linea.cantidad);
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, ''));
      END IF;

      IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
        SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_origen_id;
        IF v_vendedor_almacen_id IS NOT NULL THEN
          SELECT id, cantidad INTO v_sa_id, v_sa_qty
          FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

          IF v_sa_id IS NOT NULL THEN
            UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
          ELSE
            INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_vendedor_almacen_id, v_linea.producto_id, v_linea.cantidad);
          END IF;

          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (devuelto a ruta)');
        END IF;
      END IF;

      -- === DEDUCT FROM DESTINATION ===
      IF v_traspaso.almacen_destino_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_destino_id AND producto_id = v_linea.producto_id FOR UPDATE;

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
        SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_destino_id;
        IF v_vendedor_almacen_id IS NOT NULL THEN
          SELECT id, cantidad INTO v_sa_id, v_sa_qty
          FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

          IF v_sa_id IS NOT NULL THEN
            v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
            IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
              RAISE EXCEPTION 'Stock insuficiente en ruta destino para cancelar "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
            END IF;
            UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
          END IF;

          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (retirado de ruta)');
        END IF;
      END IF;

    END LOOP;
  END IF;

  UPDATE traspasos SET status = 'cancelado' WHERE id = p_traspaso_id;
END;
$function$;

-- 3) apply_descarga_ruta_aprobada: deduct from vendedor's almacen
CREATE OR REPLACE FUNCTION public.apply_descarga_ruta_aprobada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_new_qty numeric;
  v_vendedor_almacen_id uuid;
BEGIN
  IF NEW.status <> 'aprobada' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprobada' THEN RETURN NEW; END IF;

  -- Get vendedor's almacen_id
  SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = NEW.vendedor_id;

  FOR v_linea IN
    SELECT producto_id, cantidad_real
    FROM public.descarga_ruta_lineas
    WHERE descarga_id = NEW.id AND cantidad_real > 0
  LOOP
    IF v_vendedor_almacen_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_sa_id, v_sa_qty
      FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

      IF v_sa_id IS NOT NULL THEN
        v_new_qty := GREATEST(0, COALESCE(v_sa_qty, 0) - v_linea.cantidad_real);
        UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
      END IF;
    END IF;

    INSERT INTO public.movimientos_inventario
      (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    VALUES
      (gen_random_uuid(), NEW.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad_real,
       v_vendedor_almacen_id, 'descarga', NEW.id, NEW.aprobado_por,
       COALESCE(NEW.fecha, current_date), now(), 'Descarga de ruta aprobada');
  END LOOP;

  RETURN NEW;
END;
$function$;
