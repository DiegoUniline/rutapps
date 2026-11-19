UPDATE public.productos p
SET formula = s.formula
FROM public._difa_formulas_staging s
WHERE p.empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec'
  AND (p.codigo = s.codigo OR p.codigo = '0' || s.codigo)
  AND (p.formula IS NULL OR p.formula = '');

DROP TABLE public._difa_formulas_staging;