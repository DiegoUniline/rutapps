
-- Function to recalculate productos.cantidad from stock_almacen + stock_camion
CREATE OR REPLACE FUNCTION public.recalc_producto_stock_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_producto_id uuid;
  v_total numeric;
BEGIN
  -- Determine which producto_id changed
  IF TG_OP = 'DELETE' THEN
    v_producto_id := OLD.producto_id;
  ELSE
    v_producto_id := NEW.producto_id;
  END IF;

  -- Calculate total = all warehouses + all trucks
  SELECT
    COALESCE((SELECT SUM(cantidad) FROM stock_almacen WHERE producto_id = v_producto_id), 0)
    +
    COALESCE((SELECT SUM(cantidad_actual) FROM stock_camion WHERE producto_id = v_producto_id AND cantidad_actual > 0), 0)
  INTO v_total;

  UPDATE productos SET cantidad = v_total WHERE id = v_producto_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on stock_almacen
CREATE TRIGGER trg_recalc_stock_total_almacen
AFTER INSERT OR UPDATE OF cantidad OR DELETE
ON stock_almacen
FOR EACH ROW
EXECUTE FUNCTION recalc_producto_stock_total();

-- Also trigger on stock_camion changes
CREATE TRIGGER trg_recalc_stock_total_camion
AFTER INSERT OR UPDATE OF cantidad_actual OR DELETE
ON stock_camion
FOR EACH ROW
EXECUTE FUNCTION recalc_producto_stock_total();
