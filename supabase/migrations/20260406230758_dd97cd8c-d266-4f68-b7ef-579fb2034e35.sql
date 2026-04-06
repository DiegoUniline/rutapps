
CREATE OR REPLACE FUNCTION public.surtir_linea_entrega(
  p_linea_id uuid,
  p_producto_id uuid,
  p_cantidad_surtida numeric,
  p_almacen_origen_id uuid,
  p_empresa_id uuid,
  p_entrega_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric := 0;
BEGIN
  -- Lock product row and read stock atomically
  SELECT cantidad, vender_sin_stock
  INTO v_stock, v_vender_sin_stock
  FROM productos
  WHERE id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  -- Validate stock
  IF NOT COALESCE(v_vender_sin_stock, false) AND p_cantidad_surtida > v_stock THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %', v_stock;
  END IF;

  -- Deduct global stock (productos.cantidad)
  UPDATE productos
  SET cantidad = GREATEST(0, v_stock - p_cantidad_surtida)
  WHERE id = p_producto_id;

  -- Deduct warehouse stock (stock_almacen)
  IF p_almacen_origen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen
    WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id
    FOR UPDATE;

    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen
      SET cantidad = GREATEST(0, COALESCE(v_sa_qty, 0) - p_cantidad_surtida),
          updated_at = now()
      WHERE id = v_sa_id;
    END IF;
  END IF;

  -- Mark entrega line as fulfilled
  UPDATE entrega_lineas
  SET cantidad_entregada = p_cantidad_surtida,
      almacen_origen_id = p_almacen_origen_id,
      hecho = true
  WHERE id = p_linea_id;

  -- Log inventory movement
  INSERT INTO movimientos_inventario (
    empresa_id, tipo, producto_id, cantidad,
    almacen_origen_id, referencia_tipo, referencia_id,
    user_id, fecha, notas
  ) VALUES (
    p_empresa_id, 'salida', p_producto_id, p_cantidad_surtida,
    p_almacen_origen_id, 'entrega', p_entrega_id,
    p_user_id, v_today, 'Surtido de entrega'
  );
END;
$$;
