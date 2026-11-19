
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS licencia TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_empresa_licencia()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
  exists_flag BOOLEAN;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 90000000) + 10000000)::bigint::text, 8, '0');
    SELECT EXISTS(SELECT 1 FROM public.empresas WHERE licencia = candidate) INTO exists_flag;
    IF NOT exists_flag THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

-- Backfill existing empresas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.empresas WHERE licencia IS NULL LOOP
    UPDATE public.empresas SET licencia = public.generate_empresa_licencia() WHERE id = r.id;
  END LOOP;
END $$;

-- Trigger for new empresas
CREATE OR REPLACE FUNCTION public.set_empresa_licencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.licencia IS NULL THEN
    NEW.licencia := public.generate_empresa_licencia();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_empresa_licencia ON public.empresas;
CREATE TRIGGER trg_set_empresa_licencia
BEFORE INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.set_empresa_licencia();
