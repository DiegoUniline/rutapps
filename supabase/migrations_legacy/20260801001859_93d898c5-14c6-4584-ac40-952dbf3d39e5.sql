-- 1. Actualizar el producto en el catálogo para asegurar que tiene IVA al 16%
UPDATE public.productos 
SET tiene_iva = true 
WHERE codigo = 'PROMOCLORA';

-- 2. Corregir la línea de PED-1950 (PROMOCLORA) para que el precio_unitario sea el base (sin IVA)
-- Total = 0.012 -> Base = 0.010344... -> Redondeado a 0.01
-- IVA = 0.0016... -> Redondeado a 0.00 (pero en el total de la línea impacta)
-- El usuario quiere que "precio s/impuestos" (precio_unitario) sea menor a 0.01 y que el IVA se vea.
UPDATE public.venta_lineas
SET 
    precio_unitario = 0.0086, -- (0.01 / 1.16)
    subtotal = 0.10,         -- (12 * 0.0086) aprox
    iva_monto = 0.02,        -- (12 * 0.01 * 0.16)
    iva_pct = 16,
    total = 0.12,
    precio_lista_unitario = 0.0086,
    importe_bruto = 0.12
WHERE id = '954453d4-a5eb-40cc-ab00-fe7af187f0a8';

-- 3. Recalcular los encabezados de la venta PED-1950 para asegurar que coincidan con la suma de las líneas
-- (Usamos una subconsulta para ser precisos con lo que hay actualmente en las líneas corregidas)
UPDATE public.ventas v
SET 
    subtotal = (SELECT SUM(subtotal) FROM public.venta_lineas WHERE venta_id = v.id),
    iva_total = (SELECT SUM(iva_monto) FROM public.venta_lineas WHERE venta_id = v.id),
    total = (SELECT SUM(total) FROM public.venta_lineas WHERE venta_id = v.id)
WHERE folio = 'PED-1950';

-- 4. Verificación final de la línea y la venta
SELECT 
    v.folio, 
    v.subtotal as v_sub, 
    v.iva_total as v_iva, 
    v.total as v_tot,
    vl.cantidad,
    vl.precio_unitario,
    vl.iva_monto,
    vl.total as l_tot
FROM public.venta_lineas vl
JOIN public.ventas v ON v.id = vl.venta_id
WHERE v.folio = 'PED-1950' AND vl.id = '954453d4-a5eb-40cc-ab00-fe7af187f0a8';