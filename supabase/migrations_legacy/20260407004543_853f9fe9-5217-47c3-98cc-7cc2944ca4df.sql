
-- Recalculate stock_almacen from movimientos_inventario
-- entrada with almacen_destino_id = +qty
-- salida with almacen_origen_id = -qty
WITH calculated AS (
  SELECT
    sa.id AS sa_id,
    sa.almacen_id,
    sa.producto_id,
    sa.empresa_id,
    COALESCE(SUM(
      CASE
        WHEN m.tipo = 'entrada' AND m.almacen_destino_id = sa.almacen_id THEN m.cantidad
        WHEN m.tipo = 'salida' AND m.almacen_origen_id = sa.almacen_id THEN -m.cantidad
        ELSE 0
      END
    ), 0) AS real_qty
  FROM stock_almacen sa
  LEFT JOIN movimientos_inventario m
    ON m.producto_id = sa.producto_id
    AND m.empresa_id = sa.empresa_id
    AND (m.almacen_destino_id = sa.almacen_id OR m.almacen_origen_id = sa.almacen_id)
  GROUP BY sa.id, sa.almacen_id, sa.producto_id, sa.empresa_id
)
UPDATE stock_almacen sa
SET cantidad = c.real_qty, updated_at = now()
FROM calculated c
WHERE sa.id = c.sa_id
  AND sa.cantidad != c.real_qty;

-- Recalculate productos.cantidad from stock_almacen + stock_camion
UPDATE productos p
SET cantidad = COALESCE(
  (SELECT SUM(cantidad) FROM stock_almacen WHERE producto_id = p.id), 0
) + COALESCE(
  (SELECT SUM(cantidad_actual) FROM stock_camion WHERE producto_id = p.id), 0
);
