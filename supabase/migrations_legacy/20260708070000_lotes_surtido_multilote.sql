-- ============================================================================
-- LOTES · Surtido de pedido por lote (asignación multi-lote FEFO)
--
-- Nueva variante del surtido que recibe una asignación [{lote_id, cantidad}]:
--   • descuenta stock_almacen por el total (una sola vez),
--   • inserta UN movimiento por lote (salida, referencia 'entrega', lote_id)
--     → el trigger central descuenta stock_lotes de cada lote,
--   • marca la línea de entrega como surtida con la cantidad total.
-- La función original surtir_linea_entrega se mantiene para productos sin lote.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.surtir_linea_entrega_lotes(
  p_linea_id uuid,
  p_producto_id uuid,
  p_almacen_origen_id uuid,
  p_entrega_id uuid,
  p_empresa_id uuid,
  p_user_id uuid,
  p_asignacion jsonb   -- [{"lote_id":"<uuid>","cantidad":10}, ...]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric := 0;
  v_item jsonb;
  v_lote uuid;
  v_cant numeric;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_vender_sin_stock boolean;
  v_today date := current_date;
BEGIN
  SELECT COALESCE(SUM((x->>'cantidad')::numeric), 0) INTO v_total
  FROM jsonb_array_elements(COALESCE(p_asignacion, '[]'::jsonb)) x;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Asignación de lotes vacía'; END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;

  -- Descontar el total del stock del almacén (bloqueo).
  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  IF v_sa_id IS NULL THEN
    IF NOT COALESCE(v_vender_sin_stock, false) THEN
      RAISE EXCEPTION 'Sin stock en el almacén origen';
    END IF;
    INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (p_empresa_id, p_almacen_origen_id, p_producto_id, -v_total);
  ELSE
    IF NOT COALESCE(v_vender_sin_stock, false) AND COALESCE(v_sa_qty,0) - v_total < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén. Disponible: %, solicitado: %', COALESCE(v_sa_qty,0), v_total;
    END IF;
    UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) - v_total, updated_at = now() WHERE id = v_sa_id;
  END IF;

  -- Un movimiento por lote → el trigger central descuenta stock_lotes.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_asignacion, '[]'::jsonb))
  LOOP
    v_lote := (v_item->>'lote_id')::uuid;
    v_cant := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_lote IS NULL OR v_cant <= 0 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE id = v_lote AND producto_id = p_producto_id) THEN
      RAISE EXCEPTION 'Un lote no corresponde al producto';
    END IF;
    INSERT INTO movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
    VALUES
      (p_empresa_id, 'salida', p_producto_id, v_cant, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega (lote)', v_lote);
  END LOOP;

  UPDATE entrega_lineas
  SET cantidad_entregada = v_total, almacen_origen_id = p_almacen_origen_id, hecho = true
  WHERE id = p_linea_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.surtir_linea_entrega_lotes(uuid, uuid, uuid, uuid, uuid, uuid, jsonb) TO authenticated, service_role;
