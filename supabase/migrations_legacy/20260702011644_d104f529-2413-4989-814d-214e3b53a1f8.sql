CREATE OR REPLACE FUNCTION public.normalize_venta_total_descuento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross numeric;
  v_correct_total numeric;
BEGIN
  v_gross := ROUND((COALESCE(NEW.subtotal, 0) + COALESCE(NEW.iva_total, 0) + COALESCE(NEW.ieps_total, 0))::numeric, 2);
  v_correct_total := ROUND(GREATEST(0, v_gross - COALESCE(NEW.descuento_total, 0))::numeric, 2);

  IF COALESCE(NEW.descuento_total, 0) > 0
     AND COALESCE(NEW.total, 0) > v_correct_total + 0.009 THEN
    NEW.total := v_correct_total;
  END IF;

  IF COALESCE(NEW.saldo_pendiente, 0) > COALESCE(NEW.total, 0) + 0.009 THEN
    NEW.saldo_pendiente := NEW.total;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_venta_total_descuento ON public.ventas;

CREATE TRIGGER trg_normalize_venta_total_descuento
BEFORE INSERT OR UPDATE OF subtotal, iva_total, ieps_total, descuento_total, total, saldo_pendiente
ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.normalize_venta_total_descuento();