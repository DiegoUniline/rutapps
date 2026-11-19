
CREATE OR REPLACE FUNCTION public.recalc_venta_saldo_on_total_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pagado numeric;
BEGIN
  IF NEW.total IS DISTINCT FROM OLD.total THEN
    SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
    FROM public.cobro_aplicaciones ca
    JOIN public.cobros c ON c.id = ca.cobro_id
    WHERE ca.venta_id = NEW.id
      AND c.status <> 'cancelado';

    NEW.saldo_pendiente := GREATEST(0, COALESCE(NEW.total, 0) - v_pagado);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_venta_saldo_on_total_change ON public.ventas;
CREATE TRIGGER trg_recalc_venta_saldo_on_total_change
BEFORE UPDATE OF total ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.recalc_venta_saldo_on_total_change();
