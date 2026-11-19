
-- One-time function to backfill stock for all received/paid purchases that never had inventory movements logged
DO $$
DECLARE
  r record;
  v_current_qty numeric;
  v_factor numeric;
  v_piezas numeric;
BEGIN
  FOR r IN
    SELECT
      cl.producto_id,
      cl.cantidad,
      c.almacen_id,
      c.empresa_id,
      c.id AS compra_id,
      c.folio,
      c.fecha,
      p.factor_conversion
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    JOIN productos p ON p.id = cl.producto_id
    WHERE c.status IN ('recibida', 'pagada')
      AND NOT EXISTS (
        SELECT 1 FROM movimientos_inventario mi
        WHERE mi.referencia_tipo = 'compra'
          AND mi.referencia_id = c.id
          AND mi.producto_id = cl.producto_id
      )
  LOOP
    v_factor := COALESCE(r.factor_conversion, 1);
    v_piezas := COALESCE(r.cantidad, 0) * v_factor;

    -- Update product stock
    UPDATE productos
    SET cantidad = COALESCE(cantidad, 0) + v_piezas
    WHERE id = r.producto_id;

    -- Insert inventory movement
    INSERT INTO movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad,
      almacen_destino_id, referencia_tipo, referencia_id,
      fecha, notas
    ) VALUES (
      r.empresa_id, 'entrada', r.producto_id, v_piezas,
      r.almacen_id, 'compra', r.compra_id,
      r.fecha, 'Backfill: Compra ' || COALESCE(r.folio, r.compra_id::text) || ' recibida'
    );
  END LOOP;
END;
$$;
