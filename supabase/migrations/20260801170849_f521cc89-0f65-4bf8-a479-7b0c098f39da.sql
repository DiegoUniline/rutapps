UPDATE public.clientes c
SET nombre = COALESCE(NULLIF(TRIM(c.contacto), ''), c.nombre),
    contacto = CASE WHEN NULLIF(TRIM(c.contacto), '') IS NULL THEN c.contacto ELSE c.nombre END
FROM public.empresas e
WHERE e.id = c.empresa_id AND e.licencia = '53021303';