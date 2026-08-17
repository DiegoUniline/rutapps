UPDATE public.productos p
SET usa_listas_precio = true
FROM public.empresas e
WHERE e.licencia = '53021303' AND p.empresa_id = e.id AND p.usa_listas_precio IS DISTINCT FROM true;