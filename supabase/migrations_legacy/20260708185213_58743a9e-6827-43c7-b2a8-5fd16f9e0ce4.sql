
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
  v_maneja_lote boolean;
  v_new_qty numeric;
  v_vendedor_almacen_id uuid;
  v_pending numeric;
  v_lote RECORD;
  v_take numeric;
  v_folio text;
BEGIN
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status != 'borrador' THEN RAISE EXCEPTION 'Solo se puede confirmar un traspaso en borrador'; END IF;

  v_folio := COALESCE(v_traspaso.folio, '');

  FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
    SELECT nombre, vender_sin_stock, COALESCE(maneja_lote,false)
      INTO v_prod_name, v_allow_negative, v_maneja_lote
    FROM productos WHERE id = v_linea.producto_id;

    -- Resolve vendedor origin/destination warehouses (once per line).
    DECLARE
      v_origen_id uuid := v_traspaso.almacen_origen_id;
      v_destino_id uuid := v_traspaso.almacen_destino_id;
      v_vend_origen_alm uuid := NULL;
      v_vend_destino_alm uuid := NULL;
    BEGIN
      IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
        SELECT almacen_id INTO v_vend_origen_alm FROM profiles WHERE id = v_traspaso.vendedor_origen_id;
      END IF;
      IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
        SELECT almacen_id INTO v_vend_destino_alm FROM profiles WHERE id = v_traspaso.vendedor_destino_id;
      END IF;

      -- ========== DEDUCT FROM ORIGIN (almacén directo) ==========
      IF v_origen_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_origen_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
          IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
            RAISE EXCEPTION 'Stock insuficiente en origen para "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
          END IF;
          UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
        END IF;

        IF v_maneja_lote THEN
          -- Consumir FIFO por caducidad y emitir un movimiento por lote (el trigger sincroniza stock_lotes).
          v_pending := v_linea.cantidad;
          FOR v_lote IN
            SELECT sl.lote_id, sl.cantidad AS existencia
            FROM stock_lotes sl
            JOIN lotes l ON l.id = sl.lote_id
            WHERE sl.almacen_id = v_origen_id
              AND sl.producto_id = v_linea.producto_id
              AND sl.cantidad > 0
            ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
            FOR UPDATE OF sl
          LOOP
            EXIT WHEN v_pending <= 0;
            v_take := LEAST(v_lote.existencia, v_pending);
            INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
            VALUES (v_traspaso.empresa_id, 'traspaso', v_linea.producto_id, v_take, v_origen_id, COALESCE(v_destino_id, v_vend_destino_alm), v_lote.lote_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio);
            v_pending := v_pending - v_take;
          END LOOP;
          IF v_pending > 0 AND NOT COALESCE(v_allow_negative, false) THEN
            RAISE EXCEPTION 'Stock por lotes insuficiente en origen para "%". Faltan: %', v_prod_name, v_pending;
          END IF;
          IF v_pending > 0 THEN
            -- Permitido negativo pero sin lote asignado: registrar movimiento sin lote para conservar totales.
            INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
            VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_pending, v_origen_id, NULL, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio || ' (sin lote)');
          END IF;
        ELSE
          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio);
        END IF;
      END IF;

      -- ========== DEDUCT FROM ORIGIN (ruta / vendedor) ==========
      IF v_vend_origen_alm IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_vend_origen_alm AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
          IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
            RAISE EXCEPTION 'Stock insuficiente en ruta para "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
          END IF;
          UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
        END IF;

        IF v_maneja_lote THEN
          v_pending := v_linea.cantidad;
          FOR v_lote IN
            SELECT sl.lote_id, sl.cantidad AS existencia
            FROM stock_lotes sl
            JOIN lotes l ON l.id = sl.lote_id
            WHERE sl.almacen_id = v_vend_origen_alm
              AND sl.producto_id = v_linea.producto_id
              AND sl.cantidad > 0
            ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
            FOR UPDATE OF sl
          LOOP
            EXIT WHEN v_pending <= 0;
            v_take := LEAST(v_lote.existencia, v_pending);
            INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
            VALUES (v_traspaso.empresa_id, 'traspaso', v_linea.producto_id, v_take, v_vend_origen_alm, COALESCE(v_destino_id, v_vend_destino_alm), v_lote.lote_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio || ' (salida ruta)');
            v_pending := v_pending - v_take;
          END LOOP;
          IF v_pending > 0 AND NOT COALESCE(v_allow_negative, false) THEN
            RAISE EXCEPTION 'Stock por lotes insuficiente en ruta origen para "%". Faltan: %', v_prod_name, v_pending;
          END IF;
          IF v_pending > 0 THEN
            INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
            VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_pending, v_vend_origen_alm, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio || ' (salida ruta sin lote)');
          END IF;
        ELSE
          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_vend_origen_alm, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio || ' (salida ruta)');
        END IF;
      END IF;

      -- ========== ADD TO DESTINATION (almacén directo) ==========
      -- Cuando ya emitimos movimientos tipo 'traspaso' con almacen_destino_id + lote_id,
      -- el trigger sync_stock_lote_from_movimiento ya sumó stock_lotes en el destino.
      -- Solo actualizamos stock_almacen (total del almacén) y, si no hay lote, insertamos
      -- una entrada plana.
      IF v_destino_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_destino_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
        ELSE
          INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_destino_id, v_linea.producto_id, v_linea.cantidad);
        END IF;

        IF NOT v_maneja_lote THEN
          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio);
        END IF;
      END IF;

      -- ========== ADD TO DESTINATION (ruta / vendedor) ==========
      IF v_vend_destino_alm IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_vend_destino_alm AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
        ELSE
          INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_vend_destino_alm, v_linea.producto_id, v_linea.cantidad);
        END IF;

        IF NOT v_maneja_lote THEN
          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_vend_destino_alm, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Traspaso ' || v_folio || ' (entrada ruta)');
        END IF;
      END IF;
    END;
  END LOOP;

  UPDATE traspasos SET status = 'confirmado' WHERE id = p_traspaso_id;
END;
$function$;
