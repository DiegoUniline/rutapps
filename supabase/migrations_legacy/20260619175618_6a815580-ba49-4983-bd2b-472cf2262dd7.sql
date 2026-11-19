
-- 1) Arreglar trigger para que NUNCA cree una segunda principal
CREATE OR REPLACE FUNCTION public.ensure_lista_precios_principal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ya_existe_principal boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lista_precios WHERE tarifa_id = NEW.id) THEN
    SELECT EXISTS(
      SELECT 1 FROM public.lista_precios
      WHERE empresa_id = NEW.empresa_id AND es_principal = true
    ) INTO v_ya_existe_principal;

    INSERT INTO public.lista_precios (tarifa_id, empresa_id, nombre, es_principal, activa)
    VALUES (NEW.id, NEW.empresa_id, NEW.nombre, NOT v_ya_existe_principal, true);
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Consolidar duplicados: elegir UNA principal por empresa (la más antigua activa),
--    renombrar las demás y quitarles es_principal. NO se borra nada.
WITH ranked AS (
  SELECT
    lp.id,
    lp.empresa_id,
    lp.nombre,
    lp.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY lp.empresa_id
      ORDER BY lp.activa DESC, lp.created_at ASC, lp.id ASC
    ) AS rn
  FROM public.lista_precios lp
  WHERE lp.nombre ILIKE '%general%'
    AND lp.empresa_id IN (
      SELECT empresa_id
      FROM public.lista_precios
      WHERE nombre ILIKE '%general%'
      GROUP BY empresa_id
      HAVING COUNT(*) > 1
    )
)
UPDATE public.lista_precios lp
SET
  es_principal = (r.rn = 1),
  activa = CASE WHEN r.rn = 1 THEN true ELSE lp.activa END,
  nombre = CASE
    WHEN r.rn = 1 THEN 'Lista General'
    ELSE r.nombre || ' (duplicada ' || to_char(r.created_at, 'YYYY-MM-DD') || ')'
  END
FROM ranked r
WHERE lp.id = r.id;
