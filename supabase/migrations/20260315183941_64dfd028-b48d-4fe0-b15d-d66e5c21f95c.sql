
CREATE OR REPLACE FUNCTION public.auto_create_empresa_basics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Almacén General
  INSERT INTO public.almacenes (empresa_id, nombre)
  VALUES (NEW.id, 'Almacén General');

  -- Tarifa General
  INSERT INTO public.tarifas (empresa_id, nombre, tipo, activa)
  VALUES (NEW.id, 'Tarifa General', 'general', true);

  -- Unidad básica: Pieza
  INSERT INTO public.unidades (empresa_id, nombre, abreviatura)
  VALUES (NEW.id, 'Pieza', 'pza');

  -- Lista de precios General
  INSERT INTO public.listas (empresa_id, nombre)
  VALUES (NEW.id, 'Lista General');

  -- Zona por defecto
  INSERT INTO public.zonas (empresa_id, nombre)
  VALUES (NEW.id, 'Zona General');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_empresa_basics
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_empresa_basics();
