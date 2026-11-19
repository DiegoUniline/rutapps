-- Fix: trigger debe ignorar líneas no surtidas (cantidad_entregada=0) al exigir almacén origen.
-- Antes contaba cualquier línea con hecho=true sin almacén, lo que bloqueaba entregas con líneas marcadas como "no surtida".
CREATE OR REPLACE FUNCTION public.validate_entrega_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lineas_sin_origen int;
  v_lineas_hechas int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cargado' THEN
    IF NEW.vendedor_ruta_id IS NULL AND NEW.vendedor_id IS NULL THEN
      RAISE EXCEPTION 'No se puede cargar la entrega %: falta asignar vendedor de ruta.',
        COALESCE(NEW.folio, NEW.id::text);
    END IF;

    -- Solo contar líneas realmente surtidas (cantidad_entregada > 0)
    SELECT COUNT(*) FILTER (WHERE hecho AND cantidad_entregada > 0 AND almacen_origen_id IS NULL),
           COUNT(*) FILTER (WHERE hecho AND cantidad_entregada > 0)
    INTO v_lineas_sin_origen, v_lineas_hechas
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id;

    IF v_lineas_hechas = 0 THEN
      RAISE EXCEPTION 'No se puede cargar la entrega %: no hay líneas surtidas.',
        COALESCE(NEW.folio, NEW.id::text);
    END IF;

    IF v_lineas_sin_origen > 0 THEN
      RAISE EXCEPTION 'No se puede cargar la entrega %: hay % línea(s) surtida(s) sin almacén origen.',
        COALESCE(NEW.folio, NEW.id::text), v_lineas_sin_origen;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id)
        AND almacen_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'No se puede cargar la entrega %: el vendedor de ruta no tiene almacén asignado en su perfil.',
        COALESCE(NEW.folio, NEW.id::text);
    END IF;
  END IF;

  IF NEW.status = 'hecho' AND OLD.status NOT IN ('cargado', 'en_ruta') THEN
    RAISE EXCEPTION 'No se puede validar la entrega %: primero debe estar cargada (estado actual: %).',
      COALESCE(NEW.folio, NEW.id::text), OLD.status;
  END IF;

  RETURN NEW;
END;
$$;