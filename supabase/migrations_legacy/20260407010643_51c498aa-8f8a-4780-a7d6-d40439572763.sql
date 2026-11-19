
-- Recalculate stock_camion based on movimientos_inventario
-- For each vendedor+producto, get the correct total from movements
DO $$
DECLARE
  r RECORD;
  v_correct_total numeric;
  v_current_total numeric;
  v_diff numeric;
  v_sc RECORD;
  v_remaining numeric;
BEGIN
  -- For each vendedor+producto combo that has stock_camion entries
  FOR r IN 
    SELECT DISTINCT vendedor_id, producto_id 
    FROM stock_camion 
    WHERE cantidad_actual > 0
  LOOP
    -- Calculate correct total from movimientos_inventario
    SELECT COALESCE(SUM(
      CASE 
        WHEN tipo = 'entrada' THEN cantidad
        WHEN tipo = 'salida' THEN -cantidad
        ELSE 0
      END
    ), 0) INTO v_correct_total
    FROM movimientos_inventario
    WHERE vendedor_destino_id = r.vendedor_id
      AND producto_id = r.producto_id;

    -- Get current total in stock_camion
    SELECT COALESCE(SUM(cantidad_actual), 0) INTO v_current_total
    FROM stock_camion
    WHERE vendedor_id = r.vendedor_id
      AND producto_id = r.producto_id
      AND cantidad_actual > 0;

    v_diff := v_current_total - v_correct_total;
    
    -- If there's a positive difference (current > correct), we need to reduce
    IF v_diff > 0 THEN
      v_remaining := v_diff;
      -- Deduct from newest entries first (LIFO for corrections)
      FOR v_sc IN 
        SELECT id, cantidad_actual 
        FROM stock_camion 
        WHERE vendedor_id = r.vendedor_id 
          AND producto_id = r.producto_id 
          AND cantidad_actual > 0
        ORDER BY fecha DESC, created_at DESC
      LOOP
        IF v_remaining <= 0 THEN EXIT; END IF;
        
        IF v_sc.cantidad_actual <= v_remaining THEN
          UPDATE stock_camion SET cantidad_actual = 0 WHERE id = v_sc.id;
          v_remaining := v_remaining - v_sc.cantidad_actual;
        ELSE
          UPDATE stock_camion SET cantidad_actual = v_sc.cantidad_actual - v_remaining WHERE id = v_sc.id;
          v_remaining := 0;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Recalculate productos.cantidad from stock_almacen + stock_camion
UPDATE productos p
SET cantidad = COALESCE(
  (SELECT SUM(cantidad) FROM stock_almacen WHERE producto_id = p.id), 0
) + COALESCE(
  (SELECT SUM(cantidad_actual) FROM stock_camion WHERE producto_id = p.id), 0
);
