-- INVENTARIO A PRUEBA DE DESCUENTO DOBLE al surtir entregas (#9 del diagnóstico).
--
-- Problema: surtir_linea_entrega descuenta el stock del almacén y registra la
-- salida, pero NO revisaba si esa línea YA había sido surtida. Si la función se
-- ejecuta dos veces para la misma línea (doble clic, reintento de la app,
-- re-sincronización offline, o dos usuarios a la vez), descuenta el stock DOS
-- veces y registra DOS salidas → el inventario del sistema queda más bajo que el
-- físico (stock fantasma).
--
-- Solución (idempotencia): al entrar, se BLOQUEA la fila de la línea y se revisa
-- si ya está 'hecho = true'. Si ya fue surtida, la función NO hace nada y regresa
-- (no-op). Esto es exactamente la misma regla que ya aplica el frontend
-- (surte solo las líneas con hecho = false), pero ahora blindada en la base de
-- datos para que ninguna repetición pueda colarse.
--
-- El FOR UPDATE sobre la línea evita que dos llamadas simultáneas pasen ambas el
-- chequeo (condición de carrera): la segunda espera a la primera y ya la ve hecha.
--
-- No cambia el comportamiento normal (surtir una línea pendiente funciona igual).
-- No toca datos existentes. Es CREATE OR REPLACE (reemplaza la función).

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
  v_already boolean;
BEGIN
  -- IDEMPOTENCIA: bloquear la línea y salir si ya fue surtida (evita descuento
  -- doble por doble clic / reintento / re-sync / carrera).
  SELECT hecho INTO v_already
  FROM entrega_lineas
  WHERE id = p_linea_id
  FOR UPDATE;

  IF COALESCE(v_already, false) THEN
    RETURN; -- ya surtida: no-op
  END IF;

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
