WITH updated_sales AS (
    SELECT DISTINCT venta_id FROM (
        SELECT vl.venta_id
        FROM public.venta_lineas vl
        JOIN public.ventas v ON vl.venta_id = v.id
        WHERE vl.producto_id = 'f3001d8a-d086-40ce-90bb-e2bb98b909fe'
          AND v.empresa_id = (SELECT id FROM public.empresas WHERE licencia = '43129204')
          AND v.fecha >= '2026-07-28'
    ) s
)
UPDATE public.ventas v
SET 
    subtotal = (SELECT SUM(subtotal) FROM public.venta_lineas WHERE venta_id = v.id),
    iva_total = (SELECT SUM(iva_monto) FROM public.venta_lineas WHERE venta_id = v.id)
FROM updated_sales
WHERE v.id = updated_sales.venta_id;