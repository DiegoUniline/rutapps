
CREATE OR REPLACE FUNCTION public.recalc_venta_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id uuid;
  v_total numeric;
  v_pagado numeric;
BEGIN
  v_venta_id := COALESCE(NEW.venta_id, OLD.venta_id);

  SELECT total INTO v_total FROM public.ventas WHERE id = v_venta_id;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = v_venta_id
    AND c.status <> 'cancelado';

  -- Allow negative saldo when client overpaid (saldo a favor)
  UPDATE public.ventas
  SET saldo_pendiente = COALESCE(v_total, 0) - v_pagado
  WHERE id = v_venta_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- New trigger function for when the venta total itself changes
CREATE OR REPLACE FUNCTION public.recalc_venta_saldo_on_total_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pagado numeric;
BEGIN
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = NEW.id
    AND c.status <> 'cancelado';

  NEW.saldo_pendiente := COALESCE(NEW.total, 0) - v_pagado;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recalc_venta_saldo_on_total ON public.ventas;
CREATE TRIGGER trg_recalc_venta_saldo_on_total
BEFORE UPDATE OF total ON public.ventas
FOR EACH ROW
WHEN (OLD.total IS DISTINCT FROM NEW.total)
EXECUTE FUNCTION public.recalc_venta_saldo_on_total_change();
