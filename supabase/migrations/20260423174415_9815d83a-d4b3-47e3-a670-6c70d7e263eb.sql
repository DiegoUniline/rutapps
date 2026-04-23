ALTER TABLE public.ruta_sesiones ALTER COLUMN vehiculo_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.ruta_sesion_validate_and_sync_km()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_km_actual NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vehiculo_id IS NOT NULL THEN
      SELECT km_actual INTO v_km_actual FROM public.vehiculos WHERE id = NEW.vehiculo_id;
      IF v_km_actual IS NOT NULL AND NEW.km_inicio IS NOT NULL AND NEW.km_inicio < v_km_actual THEN
        RAISE EXCEPTION 'KM inicial (%) no puede ser menor al último KM registrado del vehículo (%)', NEW.km_inicio, v_km_actual;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cerrada' AND OLD.status <> 'cerrada' THEN
      IF NEW.vehiculo_id IS NOT NULL THEN
        IF NEW.km_fin IS NULL THEN
          RAISE EXCEPTION 'Para cerrar la jornada se requiere KM final';
        END IF;
        IF NEW.km_inicio IS NOT NULL AND NEW.km_fin < NEW.km_inicio THEN
          RAISE EXCEPTION 'KM final (%) no puede ser menor al KM inicial (%)', NEW.km_fin, NEW.km_inicio;
        END IF;
        UPDATE public.vehiculos SET km_actual = NEW.km_fin, updated_at = now() WHERE id = NEW.vehiculo_id;
      END IF;
      IF NEW.fin_at IS NULL THEN
        NEW.fin_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;