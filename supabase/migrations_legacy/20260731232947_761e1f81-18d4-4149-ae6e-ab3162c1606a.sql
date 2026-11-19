WITH tgt AS (
  SELECT vl.id, vl.venta_id, vl.total::numeric AS tot,
         COALESCE(p.iva_pct,0)::numeric AS iva_pct,
         CASE WHEN p.tiene_ieps THEN COALESCE(p.ieps_pct,0)::numeric ELSE 0 END AS ieps_pct
  FROM public.venta_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  JOIN public.empresas e ON e.id = v.empresa_id
  JOIN public.productos p ON p.id = vl.producto_id
  WHERE e.licencia = '43129204'
    AND p.tiene_iva = true
    AND COALESCE(p.iva_pct,0) > 0
    AND COALESCE(vl.iva_monto,0) = 0
    AND COALESCE(vl.total,0) > 0
), calc AS (
  SELECT id, venta_id, tot,
         ROUND(tot / ((1+ieps_pct/100)*(1+iva_pct/100)), 2) AS base,
         ieps_pct, iva_pct
  FROM tgt
), calc2 AS (
  SELECT id, venta_id, tot, base,
         ROUND(base * ieps_pct/100, 2) AS ieps_m,
         tot - base - ROUND(base * ieps_pct/100, 2) AS iva_m
  FROM calc
)
UPDATE public.venta_lineas vl
SET subtotal = c.base,
    ieps_monto = c.ieps_m,
    iva_monto = c.iva_m
FROM calc2 c
WHERE vl.id = c.id;

WITH afect AS (
  SELECT DISTINCT vl.venta_id
  FROM public.venta_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  JOIN public.empresas e ON e.id = v.empresa_id
  WHERE e.licencia = '43129204'
), agg AS (
  SELECT vl.venta_id,
         SUM(COALESCE(vl.subtotal,0)) AS sub,
         SUM(COALESCE(vl.iva_monto,0)) AS iva,
         SUM(COALESCE(vl.ieps_monto,0)) AS ieps
  FROM public.venta_lineas vl
  WHERE vl.venta_id IN (SELECT venta_id FROM afect)
  GROUP BY vl.venta_id
)
UPDATE public.ventas v
SET subtotal = a.sub, iva_total = a.iva, ieps_total = a.ieps
FROM agg a
WHERE v.id = a.venta_id
  AND (v.subtotal IS DISTINCT FROM a.sub OR v.iva_total IS DISTINCT FROM a.iva OR v.ieps_total IS DISTINCT FROM a.ieps);