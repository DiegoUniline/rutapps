DO $$
DECLARE emp uuid := 'a2305cca-06ea-4ad2-872c-274f9d2d9495';
BEGIN
CREATE TEMP TABLE _fix ON COMMIT DROP AS
WITH promo AS (
  SELECT id AS promo_id, nombre, unnest(producto_ids)::uuid pid, cantidad_minima, cantidad_gratis
  FROM promociones WHERE empresa_id = emp AND activa = true AND tipo = 'producto_gratis'
)
SELECT l.id AS linea_id, l.venta_id, pr.promo_id, pr.nombre,
       (floor(l.cantidad/(pr.cantidad_minima+pr.cantidad_gratis))*pr.cantidad_gratis*l.precio_unitario)::numeric AS d,
       l.cantidad, l.subtotal
FROM venta_lineas l
JOIN ventas v ON v.id = l.venta_id
JOIN promo pr ON pr.pid = l.producto_id
WHERE v.empresa_id = emp AND v.status <> 'cancelado'
  AND coalesce(l.descuento_promocion_monto,0) = 0
  AND l.cantidad >= pr.cantidad_minima + pr.cantidad_gratis;

UPDATE venta_lineas l SET
  descuento_promocion_monto = f.d,
  subtotal = l.subtotal - f.d,
  total = l.total - f.d,
  precio_unitario = round((l.subtotal - f.d)/nullif(l.cantidad,0), 6)
FROM _fix f WHERE l.id = f.linea_id;

INSERT INTO promocion_aplicada (venta_id, venta_linea_id, promocion_id, descripcion, descuento_aplicado)
SELECT f.venta_id, f.linea_id, f.promo_id, f.nombre, f.d FROM _fix f
WHERE f.d > 0
  AND NOT EXISTS (SELECT 1 FROM promocion_aplicada pa WHERE pa.venta_linea_id = f.linea_id);

UPDATE ventas v SET
  total = v.total - s.d,
  subtotal = coalesce(v.subtotal,0) - s.d,
  descuento_total = coalesce(v.descuento_total,0) + s.d
FROM (SELECT venta_id, sum(d) d FROM _fix GROUP BY venta_id) s
WHERE v.id = s.venta_id;

UPDATE ventas v SET saldo_pendiente = greatest(v.total - coalesce((
   SELECT sum(ca.monto_aplicado) FROM cobro_aplicaciones ca
   JOIN cobros c ON c.id = ca.cobro_id AND c.status = 'activo'
   WHERE ca.venta_id = v.id),0), 0)
WHERE v.id IN (SELECT DISTINCT venta_id FROM _fix);
END $$;