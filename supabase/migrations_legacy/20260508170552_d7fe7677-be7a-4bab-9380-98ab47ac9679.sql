CREATE OR REPLACE FUNCTION public.auto_entregas_en_ruta_on_sesion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'en_ruta' THEN
    UPDATE public.entregas
    SET status = 'en_ruta'
    WHERE empresa_id = NEW.empresa_id
      AND vendedor_id = NEW.vendedor_id
      AND fecha = NEW.fecha
      AND status = 'cargado';
  END IF;
  RETURN NEW;
END;
$$;