
-- Fix stock_almacen by deducting all entrega movements that were never deducted
-- We calculate the total per (almacen, producto) from movimientos_inventario of type 'entrega'
-- and subtract from current stock_almacen

UPDATE stock_almacen sa
SET cantidad = GREATEST(0, sa.cantidad - agg.total_salida),
    updated_at = now()
FROM (
  SELECT mi.almacen_origen_id as almacen_id, mi.producto_id, SUM(mi.cantidad) as total_salida
  FROM movimientos_inventario mi
  WHERE mi.referencia_tipo = 'entrega'
    AND mi.tipo = 'salida'
    AND mi.almacen_origen_id IS NOT NULL
  GROUP BY mi.almacen_origen_id, mi.producto_id
) agg
WHERE sa.almacen_id = agg.almacen_id
  AND sa.producto_id = agg.producto_id;
