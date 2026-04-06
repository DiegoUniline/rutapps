
-- Fix bad ajuste movements: entrada with almacen_origen but no almacen_destino
-- These should have almacen_destino set (stock was ADDED to that warehouse)
UPDATE movimientos_inventario
SET almacen_destino_id = almacen_origen_id,
    almacen_origen_id = NULL
WHERE tipo = 'entrada'
  AND almacen_origen_id IS NOT NULL
  AND almacen_destino_id IS NULL
  AND referencia_tipo = 'ajuste';

-- Recalculate stock_almacen from all movements for ALL empresas
-- Step 1: Calculate correct stock per almacen/producto from movements
WITH calculated AS (
  SELECT
    sa.id as sa_id,
    sa.almacen_id,
    sa.producto_id,
    sa.empresa_id,
    GREATEST(0, COALESCE(
      (SELECT SUM(mi.cantidad) FROM movimientos_inventario mi
       WHERE mi.producto_id = sa.producto_id
         AND mi.almacen_destino_id = sa.almacen_id
         AND mi.tipo = 'entrada'), 0)
    -
    COALESCE(
      (SELECT SUM(mi.cantidad) FROM movimientos_inventario mi
       WHERE mi.producto_id = sa.producto_id
         AND mi.almacen_origen_id = sa.almacen_id
         AND mi.tipo = 'salida'), 0)
    ) as stock_correcto
  FROM stock_almacen sa
)
UPDATE stock_almacen sa
SET cantidad = c.stock_correcto,
    updated_at = now()
FROM calculated c
WHERE sa.id = c.sa_id
  AND sa.cantidad IS DISTINCT FROM c.stock_correcto;

-- Step 2: Recalculate productos.cantidad as SUM of all stock_almacen + stock_camion
UPDATE productos p
SET cantidad = COALESCE(almacen_total.total, 0) + COALESCE(camion_total.total, 0)
FROM (
  SELECT producto_id, SUM(cantidad) as total
  FROM stock_almacen
  GROUP BY producto_id
) almacen_total
LEFT JOIN (
  SELECT producto_id, SUM(cantidad_actual) as total
  FROM stock_camion
  WHERE cantidad_actual > 0
  GROUP BY producto_id
) camion_total ON camion_total.producto_id = almacen_total.producto_id
WHERE p.id = almacen_total.producto_id
  AND p.cantidad IS DISTINCT FROM (COALESCE(almacen_total.total, 0) + COALESCE(camion_total.total, 0));
