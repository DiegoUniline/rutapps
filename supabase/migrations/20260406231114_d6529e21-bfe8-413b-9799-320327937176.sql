
-- Fix remaining stock_almacen discrepancies by adjusting the main warehouse
-- For each product where SUM(stock_almacen) != productos.cantidad,
-- adjust the main almacen so totals match

WITH mismatches AS (
  SELECT p.id as producto_id, p.empresa_id, p.cantidad as stock_global,
         SUM(sa.cantidad) as suma_almacenes
  FROM productos p
  JOIN stock_almacen sa ON sa.producto_id = p.id
  GROUP BY p.id, p.empresa_id, p.cantidad
  HAVING p.cantidad != SUM(sa.cantidad)
),
main_almacen AS (
  SELECT DISTINCT ON (a.empresa_id) a.id as almacen_id, a.empresa_id
  FROM almacenes a
  WHERE a.activo = true
  ORDER BY a.empresa_id, 
    CASE WHEN a.nombre ILIKE '%general%' OR a.nombre ILIKE '%principal%' THEN 0 ELSE 1 END,
    a.created_at ASC
)
UPDATE stock_almacen sa
SET cantidad = GREATEST(0, sa.cantidad + (m.stock_global - m.suma_almacenes)),
    updated_at = now()
FROM mismatches m
JOIN main_almacen ma ON ma.empresa_id = m.empresa_id
WHERE sa.almacen_id = ma.almacen_id
  AND sa.producto_id = m.producto_id;
