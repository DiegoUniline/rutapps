UPDATE public.tarifa_lineas tl
SET base_precio = 'sin_impuestos'
FROM public.tarifas t
JOIN public.empresas e ON e.id = t.empresa_id
WHERE tl.tarifa_id = t.id
  AND e.licencia = '53021303'
  AND tl.base_precio <> 'sin_impuestos';