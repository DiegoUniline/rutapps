-- 1) Índice para evitar duplicados de reglas por lista/grupo
CREATE UNIQUE INDEX IF NOT EXISTS tarifa_lineas_grupo_uk
  ON public.tarifa_lineas (tarifa_id, (grupos[1]))
  WHERE aplica_a = 'grupo';

-- 2) DIFASUR: convertir reglas por producto -> reglas por lista (grupos = [lista_id])
WITH emp AS (SELECT id FROM public.empresas WHERE licencia = '53021303'),
lineas AS (
  SELECT tl.*, t.empresa_id,
         (SELECT p.lista_id FROM public.productos p
           WHERE p.id = ANY(tl.producto_ids) AND p.lista_id IS NOT NULL LIMIT 1) AS lista_id,
         coalesce(array_length(tl.producto_ids,1),0) AS n
  FROM public.tarifa_lineas tl
  JOIN public.tarifas t ON t.id = tl.tarifa_id
  WHERE t.empresa_id = (SELECT id FROM emp)
    AND tl.aplica_a = 'producto'
),
mejores AS (
  SELECT DISTINCT ON (tarifa_id, lista_id) *
  FROM lineas WHERE lista_id IS NOT NULL
  ORDER BY tarifa_id, lista_id, n DESC, created_at ASC
)
INSERT INTO public.tarifa_lineas
  (tarifa_id, aplica_a, grupos, producto_ids, clasificacion_ids, tipo_calculo,
   precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio,
   comision_pct, lista_precio_id, descuento_max, notas)
SELECT m.tarifa_id, 'grupo'::aplica_a_tarifa, ARRAY[m.lista_id::text], '{}', '{}', m.tipo_calculo,
       coalesce(m.precio,0), m.precio_minimo, coalesce(m.margen_pct,0), coalesce(m.descuento_pct,0),
       coalesce(m.redondeo,'ninguno'), coalesce(m.base_precio,'sin_impuestos'),
       coalesce(m.comision_pct,0), m.lista_precio_id, m.descuento_max, m.notas
FROM mejores m
ON CONFLICT DO NOTHING;

-- 3) Eliminar las reglas por producto ya convertidas (mismo tarifa + misma lista)
WITH emp AS (SELECT id FROM public.empresas WHERE licencia = '53021303')
DELETE FROM public.tarifa_lineas tl
USING public.tarifas t
WHERE t.id = tl.tarifa_id
  AND t.empresa_id = (SELECT id FROM emp)
  AND tl.aplica_a = 'producto'
  AND EXISTS (
    SELECT 1 FROM public.tarifa_lineas g
    WHERE g.tarifa_id = tl.tarifa_id
      AND g.aplica_a = 'grupo'
      AND g.grupos && ARRAY[(
        SELECT p.lista_id::text FROM public.productos p
        WHERE p.id = ANY(tl.producto_ids) AND p.lista_id IS NOT NULL LIMIT 1)]
  );