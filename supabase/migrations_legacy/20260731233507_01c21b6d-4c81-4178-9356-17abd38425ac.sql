UPDATE public.venta_lineas vl
SET 
    precio_lista_unitario = s.precio_lista,
    importe_bruto = s.importe_bruto,
    descuento_promocion_monto = s.promo_monto,
    descuento_manual_monto = s.desc_manual,
    descuento_total_monto = ROUND(s.promo_monto + s.desc_manual, 2),
    base_ieps = s.base_neta,
    base_iva = ROUND(s.base_neta + s.ieps_m, 2),
    ieps_monto = s.ieps_m,
    iva_monto = s.iva_m,
    impuestos_totales = ROUND(s.ieps_m + s.iva_m, 2),
    objeto_impuesto = CASE WHEN s.iva_m > 0 OR s.ieps_m > 0 THEN '02' ELSE '01' END
FROM (
    SELECT 
        vl.id,
        COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario) as precio_lista,
        ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario) * (1 + vl.ieps_pct / 100.0) * (1 + vl.iva_pct / 100.0), 2) as importe_bruto,
        COALESCE((SELECT SUM(descuento_aplicado) FROM public.promocion_aplicada pa WHERE pa.venta_linea_id = vl.id), 0) as promo_monto,
        ROUND(ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) * (vl.descuento_pct / 100.0), 2) as desc_manual,
        (ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) 
         - ROUND(ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) * (vl.descuento_pct / 100.0), 2)
         - COALESCE((SELECT SUM(descuento_aplicado) FROM public.promocion_aplicada pa WHERE pa.venta_linea_id = vl.id), 0)
        ) as base_neta,
        ROUND((ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) 
         - ROUND(ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) * (vl.descuento_pct / 100.0), 2)
         - COALESCE((SELECT SUM(descuento_aplicado) FROM public.promocion_aplicada pa WHERE pa.venta_linea_id = vl.id), 0)
        ) * (vl.ieps_pct / 100.0), 2) as ieps_m,
        ROUND(((ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) 
         - ROUND(ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) * (vl.descuento_pct / 100.0), 2)
         - COALESCE((SELECT SUM(descuento_aplicado) FROM public.promocion_aplicada pa WHERE pa.venta_linea_id = vl.id), 0)
        ) + ROUND((ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) 
         - ROUND(ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) * (vl.descuento_pct / 100.0), 2)
         - COALESCE((SELECT SUM(descuento_aplicado) FROM public.promocion_aplicada pa WHERE pa.venta_linea_id = vl.id), 0)
        ) * (vl.ieps_pct / 100.0), 2)) * (vl.iva_pct / 100.0), 2) as iva_m,
        vl.total as total_original,
        ROUND(
            (ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) 
            - ROUND(ROUND(vl.cantidad * COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario), 2) * (vl.descuento_pct / 100.0), 2)
            - COALESCE((SELECT SUM(descuento_aplicado) FROM public.promocion_aplicada pa WHERE pa.venta_linea_id = vl.id), 0)
            ) * (1 + vl.ieps_pct / 100.0) * (1 + vl.iva_pct / 100.0), 2) as total_simulado
    FROM public.venta_lineas vl
    JOIN public.ventas v ON v.id = vl.venta_id
    WHERE v.created_at >= '2026-07-27' 
      AND v.status != 'cancelado'
      AND vl.precio_lista_unitario IS NULL
) s
WHERE vl.id = s.id
  AND ABS(s.total_original - s.total_simulado) <= 0.05;