-- La fecha programada (`fecha`) y la fecha real (`fecha_entrega`) representan
-- conceptos distintos. Este trigger garantiza que cualquier flujo que cierre
-- una entrega conserve el instante real, incluso si el cliente es antiguo u
-- opera sin conexión y luego sincroniza.

CREATE OR REPLACE FUNCTION public.ensure_entrega_completion_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'hecho'::public.status_entrega THEN
    IF TG_OP = 'INSERT' AND NEW.fecha_entrega IS NULL THEN
      NEW.fecha_entrega := now();
    ELSIF TG_OP = 'UPDATE'
      AND OLD.status IS DISTINCT FROM 'hecho'::public.status_entrega
      AND (NEW.fecha_entrega IS NULL OR NEW.fecha_entrega IS NOT DISTINCT FROM OLD.fecha_entrega)
    THEN
      NEW.fecha_entrega := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_entrega_completion_timestamp ON public.entregas;
CREATE TRIGGER trg_ensure_entrega_completion_timestamp
BEFORE INSERT OR UPDATE OF status ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.ensure_entrega_completion_timestamp();

-- Recuperación segura: validado_at sí es evidencia de cuándo se cerró.
-- No usamos `fecha`, porque solo indica cuándo estaba programada la entrega.
UPDATE public.entregas
SET fecha_entrega = validado_at
WHERE status = 'hecho'::public.status_entrega
  AND fecha_entrega IS NULL
  AND validado_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entregas_empresa_fecha_entrega_hecho
  ON public.entregas (empresa_id, fecha_entrega DESC)
  WHERE status = 'hecho'::public.status_entrega;

CREATE INDEX IF NOT EXISTS idx_entregas_empresa_fecha_pendiente
  ON public.entregas (empresa_id, fecha)
  WHERE status NOT IN (
    'hecho'::public.status_entrega,
    'cancelado'::public.status_entrega,
    'no_entregado'::public.status_entrega
  );
