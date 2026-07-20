-- 1) Add lada to empresas (default 52 = MX)
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS lada text NOT NULL DEFAULT '52';

-- 2) Add lada to clientes (nullable → falls back to empresa)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS lada text;

-- 3) Trigger: si insertan cliente sin lada, tomar la de la empresa
CREATE OR REPLACE FUNCTION public.set_cliente_lada_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lada IS NULL OR NEW.lada = '' THEN
    SELECT lada INTO NEW.lada FROM public.empresas WHERE id = NEW.empresa_id;
    IF NEW.lada IS NULL OR NEW.lada = '' THEN
      NEW.lada := '52';
    END IF;
  END IF;
  -- Limpiar: solo dígitos
  NEW.lada := regexp_replace(NEW.lada, '\D', '', 'g');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_cliente_lada ON public.clientes;
CREATE TRIGGER trg_set_cliente_lada
BEFORE INSERT OR UPDATE OF lada ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.set_cliente_lada_default();

-- 4) Backfill clientes existentes con la lada de su empresa
UPDATE public.clientes c
SET lada = COALESCE(NULLIF(e.lada,''), '52')
FROM public.empresas e
WHERE c.empresa_id = e.id AND (c.lada IS NULL OR c.lada = '');