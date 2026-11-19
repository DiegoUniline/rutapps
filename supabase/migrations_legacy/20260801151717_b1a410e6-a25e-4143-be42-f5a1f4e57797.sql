UPDATE public.venta_lineas v
SET updated_at = COALESCE(v.updated_at, now())
WHERE v.id IN (SELECT id FROM public.venta_lineas WHERE importe_bruto IS NULL ORDER BY created_at DESC LIMIT 2000);