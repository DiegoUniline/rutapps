
-- 1) Data fix: si una empresa tiene varias principales, deja solo la más antigua
WITH ranked AS (
  SELECT id, empresa_id,
         ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.lista_precios
  WHERE es_principal = true
)
UPDATE public.lista_precios lp
SET es_principal = false
FROM ranked r
WHERE lp.id = r.id AND r.rn > 1;

-- 2) Unique partial index: 1 sola principal por empresa
CREATE UNIQUE INDEX IF NOT EXISTS lista_precios_una_principal_por_empresa
  ON public.lista_precios (empresa_id)
  WHERE es_principal = true;

-- 3) Trigger: al marcar una como principal, desmarcar las demás de la misma empresa
CREATE OR REPLACE FUNCTION public.enforce_single_lista_principal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.es_principal = true THEN
    UPDATE public.lista_precios
       SET es_principal = false
     WHERE empresa_id = NEW.empresa_id
       AND id <> NEW.id
       AND es_principal = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_lista_principal ON public.lista_precios;
CREATE TRIGGER trg_enforce_single_lista_principal
BEFORE INSERT OR UPDATE OF es_principal ON public.lista_precios
FOR EACH ROW
WHEN (NEW.es_principal = true)
EXECUTE FUNCTION public.enforce_single_lista_principal();
