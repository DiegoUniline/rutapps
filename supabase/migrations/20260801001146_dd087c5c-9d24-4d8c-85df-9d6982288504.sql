UPDATE public.productos 
SET tiene_iva = true, iva_pct = 16 
WHERE id = 'f3001d8a-d086-40ce-90bb-e2bb98b909fe' 
  AND empresa_id = (SELECT id FROM public.empresas WHERE licencia = '43129204');