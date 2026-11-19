-- Point clients referencing orphan tarifas (no lista_precios) to their empresa's principal tarifa
WITH orphan_tarifas AS (
  SELECT t.id as tarifa_id, t.empresa_id
  FROM tarifas t
  WHERE NOT EXISTS (SELECT 1 FROM lista_precios lp WHERE lp.tarifa_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tarifa_lineas tl WHERE tl.tarifa_id = t.id)
),
target AS (
  SELECT lp.tarifa_id, lp.id as lista_precio_id, lp.empresa_id
  FROM lista_precios lp
  WHERE lp.es_principal = true
)
UPDATE clientes c
SET tarifa_id = tgt.tarifa_id,
    lista_precio_id = COALESCE(c.lista_precio_id, tgt.lista_precio_id)
FROM orphan_tarifas ot
JOIN target tgt ON tgt.empresa_id = ot.empresa_id
WHERE c.tarifa_id = ot.tarifa_id;

-- Now safe to delete orphan tarifas
DELETE FROM tarifas t
WHERE NOT EXISTS (SELECT 1 FROM lista_precios lp WHERE lp.tarifa_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM tarifa_lineas tl WHERE tl.tarifa_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.tarifa_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM ventas v WHERE v.tarifa_id = t.id);