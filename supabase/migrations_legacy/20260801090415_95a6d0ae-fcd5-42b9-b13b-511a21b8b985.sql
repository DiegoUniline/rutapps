WITH afectadas AS (
  SELECT pa.venta_linea_id,
         SUM(pa.descuento_aplicado)::numeric AS desc_promo,
         MIN(pa.promocion_id::text)::uuid    AS promocion_id
  FROM public.promocion_aplicada pa
  JOIN public.ventas v ON v.id = pa.venta_id
  WHERE v.empresa_id IN (
      '5d2d9498-9d9c-4686-a89b-7ee920a99d88',
      '41cdb6df-40c0-4a95-89de-a54bf8eba0de',
      '27d242e0-c142-4f55-8edb-fb8c6f9873f1')
    AND pa.venta_linea_id IS NOT NULL
  GROUP BY pa.venta_linea_id
),
calc AS (
  SELECT vl.id,
         LEAST(a.desc_promo, GREATEST(COALESCE(vl.importe_bruto, vl.total), vl.total)) AS desc_promo,
         a.promocion_id,
         pr.nombre AS promocion_nombre,
         GREATEST(COALESCE(vl.importe_bruto, vl.total), vl.total) AS bruto
  FROM public.venta_lineas vl
  JOIN afectadas a ON a.venta_linea_id = vl.id
  LEFT JOIN public.promociones pr ON pr.id = a.promocion_id
  WHERE COALESCE(vl.descuento_promocion_monto,0) < a.desc_promo - 0.005
    AND vl.total <= a.desc_promo + 0.005
)
UPDATE public.venta_lineas vl
SET importe_bruto             = c.bruto,
    descuento_promocion_monto = c.desc_promo,
    descuento_total_monto     = ROUND(COALESCE(vl.descuento_manual_monto,0) + c.desc_promo, 2),
    promocion_id              = COALESCE(vl.promocion_id, c.promocion_id),
    promocion_nombre          = COALESCE(vl.promocion_nombre, c.promocion_nombre),
    total                     = 0,
    subtotal                  = 0,
    iva_monto                 = 0,
    ieps_monto                = 0,
    base_iva                  = 0,
    base_ieps                 = 0,
    precio_unitario           = 0
FROM calc c
WHERE vl.id = c.id;