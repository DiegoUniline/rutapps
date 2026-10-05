CREATE OR REPLACE FUNCTION public.recalc_venta_saldo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id uuid;
  v_total numeric;
  v_pagado numeric;
BEGIN
  v_venta_id := COALESCE(NEW.venta_id, OLD.venta_id);
  SELECT CASE WHEN cerrado_at IS NOT NULL THEN COALESCE(total_efectivo, total) ELSE total END
    INTO v_total FROM public.ventas WHERE id = v_venta_id;
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = v_venta_id AND c.status <> 'cancelado';
  UPDATE public.ventas SET saldo_pendiente = COALESCE(v_total, 0) - v_pagado WHERE id = v_venta_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_saldos_on_cobro_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cobro_id uuid;
  v_venta_id uuid;
  v_total numeric;
  v_pagado numeric;
BEGIN
  v_cobro_id := COALESCE(NEW.id, OLD.id);
  FOR v_venta_id IN
    SELECT DISTINCT ca.venta_id FROM public.cobro_aplicaciones ca
    WHERE ca.cobro_id = v_cobro_id AND ca.venta_id IS NOT NULL
  LOOP
    SELECT CASE WHEN cerrado_at IS NOT NULL THEN COALESCE(total_efectivo, total) ELSE total END
      INTO v_total FROM public.ventas WHERE id = v_venta_id;
    SELECT COALESCE(SUM(ca2.monto_aplicado), 0) INTO v_pagado
    FROM public.cobro_aplicaciones ca2 JOIN public.cobros c ON c.id = ca2.cobro_id
    WHERE ca2.venta_id = v_venta_id AND c.status <> 'cancelado';
    UPDATE public.ventas SET saldo_pendiente = COALESCE(v_total, 0) - v_pagado WHERE id = v_venta_id;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_venta_saldo_on_total_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pagado numeric;
BEGIN
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = NEW.id AND c.status <> 'cancelado';
  IF NEW.cerrado_at IS NOT NULL THEN
    NEW.saldo_pendiente := GREATEST(0, COALESCE(NEW.total_efectivo, NEW.total, 0) - v_pagado);
  ELSE
    NEW.saldo_pendiente := COALESCE(NEW.total, 0) - v_pagado;
  END IF;
  RETURN NEW;
END;
$function$;