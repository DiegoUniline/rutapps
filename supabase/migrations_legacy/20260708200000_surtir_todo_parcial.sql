-- SURTIR TODO PARCIAL: surtir cada línea con lo que alcance el stock.
--
-- Problema: "Surtir todo" llamaba a surtir_linea_entrega con la cantidad
-- COMPLETA pedida por línea. Si un producto no tenía stock suficiente, el RPC
-- lanzaba «Stock insuficiente en almacén» y abortaba TODO el proceso (el bucle
-- truena en la primera línea sin stock), dejando sin surtir incluso las líneas
-- que sí alcanzaban.
--
-- Solución: nueva función surtir_linea_entrega_parcial que, en lugar de fallar,
-- surte el MÁXIMO disponible (LEAST(pedida, disponible)). Reglas:
--   * Si el producto es vender_sin_stock: surte lo pedido completo (puede ir a
--     negativo, igual que el flujo normal).
--   * Si disponible <= 0 (o no hay nada que surtir): NO hace nada y la línea
--     queda PENDIENTE (hecho = false) para surtirla después cuando llegue stock.
--   * En otro caso: surte disponible, marca la línea hecha con esa cantidad y
--     registra la salida.
-- Devuelve la cantidad realmente surtida (0 = línea intacta / pendiente), para
-- que el frontend sepa qué quedó completo, parcial o pendiente.
--
-- Mantiene la misma idempotencia que surtir_linea_entrega (bloquea la línea con
-- FOR UPDATE y sale si ya está hecha). No cambia surtir_linea_entrega: el
-- surtido individual sigue exigiendo stock completo; solo "Surtir todo" usa esta.

CREATE OR REPLACE FUNCTION public.surtir_linea_entrega_parcial(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_cantidad_pedida numeric, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_disponible numeric;
  v_surtir numeric;
  v_already boolean;
BEGIN
  -- IDEMPOTENCIA: bloquear la línea y salir si ya fue surtida.
  SELECT hecho INTO v_already
  FROM entrega_lineas
  WHERE id = p_linea_id
  FOR UPDATE;

  IF COALESCE(v_already, false) THEN
    RETURN 0; -- ya surtida: no-op
  END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  v_disponible := COALESCE(v_sa_qty, 0);

  IF COALESCE(v_vender_sin_stock, false) THEN
    -- Puede ir a negativo: surtir lo pedido completo.
    v_surtir := p_cantidad_pedida;
  ELSE
    -- Clamp al disponible: surtir el máximo que alcance.
    v_surtir := LEAST(p_cantidad_pedida, v_disponible);
  END IF;

  -- Nada que surtir (0 disponible o pedido 0) → dejar la línea PENDIENTE.
  IF v_surtir <= 0 THEN
    RETURN 0;
  END IF;

  IF v_sa_id IS NOT NULL THEN
    UPDATE stock_almacen SET cantidad = v_disponible - v_surtir, updated_at = now() WHERE id = v_sa_id;
  END IF;

  UPDATE entrega_lineas
  SET cantidad_entregada = v_surtir, almacen_origen_id = p_almacen_origen_id, hecho = true
  WHERE id = p_linea_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'salida', p_producto_id, v_surtir, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega');

  RETURN v_surtir;
END;
$function$;
