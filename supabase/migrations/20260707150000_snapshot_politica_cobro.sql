-- ============================================================================
-- POLÍTICA DE COBRO — Fase 0, Paso 2: SNAPSHOT por pedido.
-- ----------------------------------------------------------------------------
-- Al crear un pedido, si no trae política explícita, hereda la de su empresa y
-- la CONGELA. Así, si mañana la empresa cambia de política, los pedidos viejos
-- conservan la suya (correcto contablemente).
--
-- 100% seguro: BEFORE INSERT, solo rellena politica_cobro cuando viene NULL.
-- No toca ninguna otra columna, ni pedidos existentes. Ningún cobro cambia
-- (nadie lee esta columna para cobrar todavía; eso es la Fase 1).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.snapshot_politica_cobro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.politica_cobro IS NULL THEN
    SELECT e.politica_cobro INTO NEW.politica_cobro
    FROM public.empresas e
    WHERE e.id = NEW.empresa_id;

    IF NEW.politica_cobro IS NULL THEN
      NEW.politica_cobro := 'pedido';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_snapshot_politica_cobro ON public.ventas;
CREATE TRIGGER trg_snapshot_politica_cobro
BEFORE INSERT ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_politica_cobro();
