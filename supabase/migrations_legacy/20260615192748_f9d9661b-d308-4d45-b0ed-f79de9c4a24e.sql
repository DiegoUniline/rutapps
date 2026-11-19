
-- Recalc saldos of all ventas linked to a cobro when its status changes (cancelado <-> activo) or when cobro is deleted
CREATE OR REPLACE FUNCTION public.recalc_saldos_on_cobro_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cobro_id uuid;
  v_venta_id uuid;
  v_total numeric;
  v_pagado numeric;
BEGIN
  v_cobro_id := COALESCE(NEW.id, OLD.id);

  FOR v_venta_id IN
    SELECT DISTINCT ca.venta_id
    FROM public.cobro_aplicaciones ca
    WHERE ca.cobro_id = v_cobro_id
      AND ca.venta_id IS NOT NULL
  LOOP
    SELECT total INTO v_total FROM public.ventas WHERE id = v_venta_id;
    SELECT COALESCE(SUM(ca2.monto_aplicado), 0) INTO v_pagado
    FROM public.cobro_aplicaciones ca2
    JOIN public.cobros c ON c.id = ca2.cobro_id
    WHERE ca2.venta_id = v_venta_id
      AND c.status <> 'cancelado';
    UPDATE public.ventas SET saldo_pendiente = COALESCE(v_total, 0) - v_pagado WHERE id = v_venta_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recalc_saldos_on_cobro_status ON public.cobros;
CREATE TRIGGER trg_recalc_saldos_on_cobro_status
AFTER UPDATE OF status ON public.cobros
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.recalc_saldos_on_cobro_change();
