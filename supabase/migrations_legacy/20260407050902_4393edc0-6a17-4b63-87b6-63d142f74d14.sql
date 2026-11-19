-- Migration 6: Add recalc_venta_saldo trigger on cobro_aplicaciones + backfill
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

  UPDATE public.ventas
  SET saldo_pendiente = GREATEST(0, COALESCE(v_total, 0) - v_pagado)
  WHERE id = v_venta_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recalc_venta_saldo ON cobro_aplicaciones;
CREATE TRIGGER trg_recalc_venta_saldo
  AFTER INSERT OR UPDATE OR DELETE ON cobro_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION recalc_venta_saldo();

-- Backfill all existing sales
UPDATE public.ventas v
SET saldo_pendiente = GREATEST(0,
  v.total - COALESCE((
    SELECT SUM(ca.monto_aplicado)
    FROM public.cobro_aplicaciones ca
    JOIN public.cobros c ON c.id = ca.cobro_id
    WHERE ca.venta_id = v.id AND c.status <> 'cancelado'
  ), 0)
)
WHERE v.status NOT IN ('cancelado', 'borrador')
  AND v.total > 0;