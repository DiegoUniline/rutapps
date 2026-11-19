
CREATE OR REPLACE FUNCTION public.fn_recalc_venta_saldo(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;
  UPDATE public.ventas v
  SET saldo_pendiente = GREATEST(0, COALESCE(v.total,0) - COALESCE((
    SELECT SUM(ca.monto_aplicado)
    FROM public.cobro_aplicaciones ca
    JOIN public.cobros c ON c.id = ca.cobro_id
    WHERE ca.venta_id = p_venta_id
      AND COALESCE(c.status, 'activo') <> 'cancelado'
  ), 0))
  WHERE v.id = p_venta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cobro_aplicaciones_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recalc_venta_saldo(OLD.venta_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.fn_recalc_venta_saldo(NEW.venta_id);
    IF OLD.venta_id IS DISTINCT FROM NEW.venta_id THEN
      PERFORM public.fn_recalc_venta_saldo(OLD.venta_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.fn_recalc_venta_saldo(NEW.venta_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_cobro_aplicaciones_recalc ON public.cobro_aplicaciones;
CREATE TRIGGER trg_cobro_aplicaciones_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.cobro_aplicaciones
FOR EACH ROW EXECUTE FUNCTION public.tg_cobro_aplicaciones_recalc();

CREATE OR REPLACE FUNCTION public.tg_cobros_status_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'activo') IS DISTINCT FROM COALESCE(NEW.status,'activo') THEN
    FOR r IN SELECT DISTINCT venta_id FROM public.cobro_aplicaciones WHERE cobro_id = NEW.id LOOP
      PERFORM public.fn_recalc_venta_saldo(r.venta_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cobros_status_recalc ON public.cobros;
CREATE TRIGGER trg_cobros_status_recalc
AFTER UPDATE OF status ON public.cobros
FOR EACH ROW EXECUTE FUNCTION public.tg_cobros_status_recalc();

-- Backfill: recalcular todas las ventas con cobros aplicados
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT ca.venta_id FROM public.cobro_aplicaciones ca WHERE ca.venta_id IS NOT NULL LOOP
    PERFORM public.fn_recalc_venta_saldo(r.venta_id);
  END LOOP;
END $$;
