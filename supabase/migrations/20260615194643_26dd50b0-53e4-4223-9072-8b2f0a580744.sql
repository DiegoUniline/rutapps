
-- ============================================================
-- FIX CRÍTICO: Integridad de ventas, totales, saldos y cobros
-- ============================================================

-- 1) Eliminar trigger duplicado en ventas (mismo fn registrado 2 veces)
DROP TRIGGER IF EXISTS trg_recalc_venta_saldo_on_total ON public.ventas;

-- 2) Función para recalcular totales de venta desde sus líneas
CREATE OR REPLACE FUNCTION public.recalc_venta_totales(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric := 0;
  v_iva numeric := 0;
  v_ieps numeric := 0;
  v_total_lineas numeric := 0;
  v_desc_extra numeric := 0;
  v_desc_extra_tipo text;
  v_total_final numeric := 0;
  v_es_saldo_inicial boolean;
BEGIN
  SELECT COALESCE(es_saldo_inicial,false),
         COALESCE(descuento_extra,0),
         COALESCE(descuento_extra_tipo,'monto')
    INTO v_es_saldo_inicial, v_desc_extra, v_desc_extra_tipo
  FROM public.ventas WHERE id = p_venta_id;

  -- Saldos iniciales: NO se recalculan desde líneas (no tienen)
  IF v_es_saldo_inicial THEN RETURN; END IF;

  SELECT COALESCE(SUM(subtotal),0),
         COALESCE(SUM(iva_monto),0),
         COALESCE(SUM(ieps_monto),0),
         COALESCE(SUM(total),0)
    INTO v_subtotal, v_iva, v_ieps, v_total_lineas
  FROM public.venta_lineas WHERE venta_id = p_venta_id;

  IF v_desc_extra_tipo = 'porcentaje' THEN
    v_total_final := ROUND((v_total_lineas * (1 - v_desc_extra/100.0))::numeric, 2);
  ELSE
    v_total_final := ROUND((v_total_lineas - v_desc_extra)::numeric, 2);
  END IF;

  UPDATE public.ventas
     SET subtotal = ROUND(v_subtotal::numeric,2),
         iva_total = ROUND(v_iva::numeric,2),
         ieps_total = ROUND(v_ieps::numeric,2),
         total = v_total_final
   WHERE id = p_venta_id;
END;
$$;

-- 3) Trigger sobre venta_lineas para recalcular totales (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION public.tg_venta_lineas_recalc_totales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_venta_totales(OLD.venta_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.recalc_venta_totales(NEW.venta_id);
    IF OLD.venta_id IS DISTINCT FROM NEW.venta_id THEN
      PERFORM public.recalc_venta_totales(OLD.venta_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.recalc_venta_totales(NEW.venta_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_venta_lineas_recalc_totales ON public.venta_lineas;
CREATE TRIGGER trg_venta_lineas_recalc_totales
AFTER INSERT OR UPDATE OR DELETE ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.tg_venta_lineas_recalc_totales();

-- 4) Validar que la suma de aplicaciones por cobro no exceda su monto
CREATE OR REPLACE FUNCTION public.fn_validate_cobro_no_sobreaplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monto_cobro numeric;
  v_aplicado numeric;
BEGIN
  SELECT monto INTO v_monto_cobro FROM public.cobros WHERE id = NEW.cobro_id;
  IF v_monto_cobro IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(monto_aplicado),0) INTO v_aplicado
  FROM public.cobro_aplicaciones
  WHERE cobro_id = NEW.cobro_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF (v_aplicado + COALESCE(NEW.monto_aplicado,0)) > v_monto_cobro + 0.01 THEN
    RAISE EXCEPTION 'El monto aplicado (% + %) excede el monto del cobro (%)',
      v_aplicado, NEW.monto_aplicado, v_monto_cobro
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cobro_no_sobreaplicado ON public.cobro_aplicaciones;
CREATE TRIGGER trg_validate_cobro_no_sobreaplicado
BEFORE INSERT OR UPDATE ON public.cobro_aplicaciones
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_cobro_no_sobreaplicado();

-- 5) Backfill: recalcular totales y saldos de TODAS las ventas no canceladas
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.ventas WHERE COALESCE(es_saldo_inicial,false) = false LOOP
    PERFORM public.recalc_venta_totales(r.id);
  END LOOP;

  -- Recalcular saldos directamente (sin disparar otros triggers innecesarios)
  UPDATE public.ventas v
     SET saldo_pendiente = COALESCE(v.total,0) - COALESCE((
       SELECT SUM(ca.monto_aplicado)
       FROM public.cobro_aplicaciones ca
       JOIN public.cobros c ON c.id = ca.cobro_id
       WHERE ca.venta_id = v.id AND c.status <> 'cancelado'
     ),0);
END$$;
