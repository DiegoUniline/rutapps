WITH affected_lines AS (
    SELECT 
        vl.id as linea_id,
        vl.venta_id,
        vl.cantidad,
        vl.total,
        ROUND((vl.total / 1.16)::numeric, 2) as new_subtotal,
        ROUND((vl.total - (vl.total / 1.16))::numeric, 2) as new_iva_monto
    FROM public.venta_lineas vl
    JOIN public.ventas v ON vl.venta_id = v.id
    JOIN public.productos p ON vl.producto_id = p.id
    WHERE (p.nombre ILIKE '%clorales%' OR p.codigo = '75000608')
      AND v.empresa_id = (SELECT id FROM public.empresas WHERE licencia = '43129204')
      AND v.fecha >= '2026-07-28'
      AND v.status != 'cancelado'
      AND (vl.iva_pct = 0 OR vl.iva_monto = 0)
)
UPDATE public.venta_lineas
SET 
    iva_pct = 16,
    iva_monto = affected_lines.new_iva_monto,
    subtotal = affected_lines.new_subtotal
FROM affected_lines
WHERE public.venta_lineas.id = affected_lines.linea_id
RETURNING public.venta_lineas.id, public.venta_lineas.venta_id;