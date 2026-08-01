WITH c AS (
  SELECT vl.id,
    vl.cantidad,
    COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario, 0)::numeric AS pu,
    COALESCE(vl.subtotal,0)::numeric AS sub,
    COALESCE(vl.ieps_monto,0)::numeric AS im,
    COALESCE(vl.iva_monto,0)::numeric AS vm,
    (1 + COALESCE(vl.ieps_pct,0)/100.0) * (1 + COALESCE(vl.iva_pct,0)/100.0) AS d,
    (COALESCE(vl.ieps_pct,0) > 0 OR COALESCE(vl.iva_pct,0) > 0) AS gravado
  FROM public.venta_lineas vl
  WHERE vl.empresa_id = '41cdb6df-40c0-4a95-89de-a54bf8eba0de'
    AND vl.precio_lista_unitario IS NULL
)
UPDATE public.venta_lineas vl
SET precio_lista_unitario   = ROUND(c.pu, 6),
    importe_bruto           = ROUND(ROUND(c.pu * c.cantidad, 2) * c.d, 2),
    descuento_manual_monto  = GREATEST(0, ROUND((ROUND(c.pu * c.cantidad, 2) - c.sub) * c.d, 2)),
    descuento_promocion_monto = COALESCE(vl.descuento_promocion_monto, 0),
    descuento_total_monto   = GREATEST(0, ROUND((ROUND(c.pu * c.cantidad, 2) - c.sub) * c.d, 2)) + COALESCE(vl.descuento_promocion_monto, 0),
    base_descuento_manual   = ROUND(ROUND(c.pu * c.cantidad, 2) * c.d, 2),
    base_ieps               = c.sub,
    base_iva                = ROUND(c.sub + c.im, 2),
    impuestos_totales       = ROUND(c.im + c.vm, 2),
    cantidad_bonificada     = COALESCE(vl.cantidad_bonificada, 0),
    es_bonificacion         = COALESCE(vl.es_bonificacion, false),
    objeto_impuesto         = COALESCE(vl.objeto_impuesto, CASE WHEN c.gravado THEN '02' ELSE '01' END)
FROM c
WHERE vl.id = c.id;