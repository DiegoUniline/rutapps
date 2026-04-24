
-- Trigger 1: validar transiciones de status en entregas
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
  -- Solo validar cuando cambia el status
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Pasar a 'cargado': requiere vendedor_ruta_id y todas las líneas hechas con almacen_origen_id
  IF NEW.status = 'cargado' THEN
    IF NEW.vendedor_ruta_id IS NULL AND NEW.vendedor_id IS NULL THEN
      RAISE EXCEPTION 'No se puede cargar la entrega %: falta asignar vendedor de ruta.',
        COALESCE(NEW.folio, NEW.id::text);
    END IF;

    SELECT COUNT(*) FILTER (WHERE hecho AND almacen_origen_id IS NULL),
           COUNT(*) FILTER (WHERE hecho)
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

    -- Verificar que el vendedor de ruta tenga almacén asignado
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id)
        AND almacen_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'No se puede cargar la entrega %: el vendedor de ruta no tiene almacén asignado en su perfil.',
        COALESCE(NEW.folio, NEW.id::text);
    END IF;
  END IF;

  -- Pasar a 'hecho' (validar): debe venir de 'cargado'
  IF NEW.status = 'hecho' AND OLD.status NOT IN ('cargado', 'en_ruta') THEN
    RAISE EXCEPTION 'No se puede validar la entrega %: primero debe estar cargada (estado actual: %).',
      COALESCE(NEW.folio, NEW.id::text), OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_entrega_status ON public.entregas;
CREATE TRIGGER trg_validate_entrega_status
  BEFORE UPDATE ON public.entregas
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_entrega_status_transition();

-- Trigger 2: bloquear inserción de líneas en entregas ya procesadas
CREATE OR REPLACE FUNCTION public.validate_entrega_linea_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_folio text;
BEGIN
  SELECT status::text, folio INTO v_status, v_folio
  FROM public.entregas WHERE id = NEW.entrega_id;

  IF v_status IN ('surtido', 'asignado', 'cargado', 'en_ruta', 'hecho', 'cancelado') THEN
    RAISE EXCEPTION 'No se pueden agregar líneas a la entrega %: ya está en estado "%".',
      COALESCE(v_folio, NEW.entrega_id::text), v_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_entrega_linea_insert ON public.entrega_lineas;
CREATE TRIGGER trg_validate_entrega_linea_insert
  BEFORE INSERT ON public.entrega_lineas
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_entrega_linea_insert();
