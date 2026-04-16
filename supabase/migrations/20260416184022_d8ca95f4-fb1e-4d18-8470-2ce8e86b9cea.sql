CREATE OR REPLACE FUNCTION public.inherit_entrega_orden_from_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dia text;
  v_orden integer;
BEGIN
  -- Skip if orden_entrega already set manually
  IF NEW.orden_entrega IS NOT NULL AND NEW.orden_entrega > 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NULL THEN RETURN NEW; END IF;

  -- Day of week from fecha_entrega (or fecha) in Spanish
  v_dia := CASE EXTRACT(DOW FROM COALESCE(NEW.fecha_entrega, NEW.fecha))
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Lunes'
    WHEN 2 THEN 'Martes'
    WHEN 3 THEN 'Miércoles'
    WHEN 4 THEN 'Jueves'
    WHEN 5 THEN 'Viernes'
    WHEN 6 THEN 'Sábado'
  END;

  -- 1) Try exact match: día + vendedor
  SELECT orden INTO v_orden
  FROM public.cliente_orden_ruta
  WHERE cliente_id = NEW.cliente_id
    AND dia = v_dia
    AND vendedor_id = NEW.vendedor_id
  LIMIT 1;

  -- 2) Fallback: día sin vendedor específico
  IF v_orden IS NULL THEN
    SELECT orden INTO v_orden
    FROM public.cliente_orden_ruta
    WHERE cliente_id = NEW.cliente_id
      AND dia = v_dia
      AND vendedor_id IS NULL
    LIMIT 1;
  END IF;

  -- 3) Fallback: vendedor sin día
  IF v_orden IS NULL AND NEW.vendedor_id IS NOT NULL THEN
    SELECT orden INTO v_orden
    FROM public.cliente_orden_ruta
    WHERE cliente_id = NEW.cliente_id
      AND vendedor_id = NEW.vendedor_id
      AND dia IS NULL
    LIMIT 1;
  END IF;

  -- 4) Fallback: cualquier orden del cliente
  IF v_orden IS NULL THEN
    SELECT orden INTO v_orden
    FROM public.cliente_orden_ruta
    WHERE cliente_id = NEW.cliente_id
    ORDER BY orden ASC
    LIMIT 1;
  END IF;

  IF v_orden IS NOT NULL THEN
    NEW.orden_entrega := v_orden;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_entrega_orden ON public.entregas;
CREATE TRIGGER trg_inherit_entrega_orden
  BEFORE INSERT OR UPDATE OF cliente_id, vendedor_id, fecha_entrega, fecha
  ON public.entregas
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_entrega_orden_from_cliente();