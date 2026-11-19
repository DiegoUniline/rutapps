-- Auto-pasar entregas a 'en_ruta' cuando el vendedor abre su jornada
-- Solo aplica a entregas asignadas/cargadas con fecha = fecha de la sesión

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
      AND status IN ('asignado', 'cargado');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_entregas_en_ruta ON public.ruta_sesiones;
CREATE TRIGGER trg_auto_entregas_en_ruta
AFTER INSERT ON public.ruta_sesiones
FOR EACH ROW
EXECUTE FUNCTION public.auto_entregas_en_ruta_on_sesion();