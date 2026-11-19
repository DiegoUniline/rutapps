
-- Trigger: garantizar que toda tarifa nueva tenga su lista_precios principal
CREATE OR REPLACE FUNCTION public.ensure_lista_precios_principal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lista_precios WHERE tarifa_id = NEW.id) THEN
    INSERT INTO public.lista_precios (tarifa_id, empresa_id, nombre, es_principal, activa)
    VALUES (NEW.id, NEW.empresa_id, NEW.nombre, true, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_lista_precios_principal ON public.tarifas;
CREATE TRIGGER trg_ensure_lista_precios_principal
AFTER INSERT ON public.tarifas
FOR EACH ROW EXECUTE FUNCTION public.ensure_lista_precios_principal();

-- Backfill: crear lista_precios para tarifas existentes sin ninguna
INSERT INTO public.lista_precios (tarifa_id, empresa_id, nombre, es_principal, activa)
SELECT t.id, t.empresa_id, t.nombre, true, true
FROM public.tarifas t
LEFT JOIN public.lista_precios lp ON lp.tarifa_id = t.id
WHERE lp.id IS NULL;
