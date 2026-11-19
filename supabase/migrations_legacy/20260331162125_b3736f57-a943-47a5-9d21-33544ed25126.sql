
-- Atomic function to confirm a traspaso (move stock in one DB call)
CREATE OR REPLACE FUNCTION public.confirmar_traspaso(p_traspaso_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- Lock traspaso row
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status != 'borrador' THEN RAISE EXCEPTION 'Solo se puede confirmar un traspaso en borrador'; END IF;

  -- Process each line
  FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
    SELECT nombre, vender_sin_stock INTO v_prod_name, v_allow_negative
    FROM productos WHERE id = v_linea.producto_id;

    -- === DEDUCT FROM ORIGIN ===
    IF v_traspaso.almacen_origen_id IS NOT NULL THEN
      -- stock_almacen
      SELECT id, cantidad INTO v_sa_id, v_sa_qty
      FROM stock_almacen
      WHERE almacen_id = v_traspaso.almacen_origen_id AND producto_id = v_linea.producto_id
      FOR UPDATE;

      IF v_sa_id IS NOT NULL THEN
        IF NOT COALESCE(v_allow_negative, false) AND v_linea.cantidad > COALESCE(v_sa_qty, 0) THEN
          RAISE EXCEPTION 'Stock insuficiente en origen para "%". Disponible: %', v_prod_name, COALESCE(v_sa_qty, 0);
        END IF;
        UPDATE stock_almacen SET cantidad = GREATEST(0, COALESCE(v_sa_qty, 0) - v_linea.cantidad), updated_at = now() WHERE id = v_sa_id;
      END IF;

      -- movimiento salida
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
          RAISE EXCEPTION 'Stock insuficiente en ruta para "%". Disponible: %', v_prod_name, v_sc.cantidad_actual;
        END IF;
        UPDATE stock_camion SET cantidad_actual = GREATEST(0, v_sc.cantidad_actual - v_linea.cantidad) WHERE id = v_sc.id;
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

  -- Update status
  UPDATE traspasos SET status = 'confirmado' WHERE id = p_traspaso_id;
END;
$$;

-- Atomic function to cancel a traspaso (reverse stock in one DB call)
CREATE OR REPLACE FUNCTION public.cancelar_traspaso(p_traspaso_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_traspaso traspasos%ROWTYPE;
  v_linea RECORD;
  v_today date := CURRENT_DATE;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_sc RECORD;
BEGIN
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status = 'cancelado' THEN RAISE EXCEPTION 'Este traspaso ya está cancelado'; END IF;

  -- Only reverse stock if it was confirmed
  IF v_traspaso.status = 'confirmado' THEN
    FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP

      -- === RETURN TO ORIGIN ===
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

      -- === DEDUCT FROM DESTINATION ===
      IF v_traspaso.almacen_destino_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen
        WHERE almacen_id = v_traspaso.almacen_destino_id AND producto_id = v_linea.producto_id
        FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = GREATEST(0, COALESCE(v_sa_qty, 0) - v_linea.cantidad), updated_at = now() WHERE id = v_sa_id;
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
          UPDATE stock_camion SET cantidad_actual = GREATEST(0, v_sc.cantidad_actual - v_linea.cantidad) WHERE id = v_sc.id;
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_traspaso.vendedor_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (retirado de ruta)');
      END IF;

    END LOOP;
  END IF;

  UPDATE traspasos SET status = 'cancelado' WHERE id = p_traspaso_id;
END;
$$;
