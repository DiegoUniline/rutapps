-- Normalizar códigos existentes a mayúsculas y sin espacios extremos
UPDATE public.cupones SET codigo = upper(trim(codigo));

-- Índice único case-insensitive sobre el código (global, entre todos los partners)
CREATE UNIQUE INDEX IF NOT EXISTS cupones_codigo_unique_ci
  ON public.cupones (upper(trim(codigo)));

-- Trigger que normaliza el código en INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.normalize_cupon_codigo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.codigo := upper(trim(NEW.codigo));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cupon_codigo ON public.cupones;
CREATE TRIGGER trg_normalize_cupon_codigo
  BEFORE INSERT OR UPDATE ON public.cupones
  FOR EACH ROW EXECUTE FUNCTION public.normalize_cupon_codigo();