
CREATE OR REPLACE FUNCTION public.fn_validate_cobro_aplicacion_no_excede_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_aplicado numeric;
  v_folio text;
BEGIN
  SELECT total, folio INTO v_total, v_folio FROM public.ventas WHERE id = NEW.venta_id;
  IF v_total IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_aplicado
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = NEW.venta_id
    AND COALESCE(c.status, 'activo') <> 'cancelado'
    AND (TG_OP = 'INSERT' OR ca.id <> NEW.id);

  IF (v_aplicado + COALESCE(NEW.monto_aplicado, 0)) > v_total + 0.01 THEN
    RAISE EXCEPTION 'El monto aplicado (%) excede el saldo pendiente de la venta % (total: %, ya aplicado: %)',
      NEW.monto_aplicado, COALESCE(v_folio, NEW.venta_id::text), v_total, v_aplicado
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cobro_aplicacion_no_excede_saldo ON public.cobro_aplicaciones;
CREATE TRIGGER trg_validate_cobro_aplicacion_no_excede_saldo
BEFORE INSERT OR UPDATE OF monto_aplicado, venta_id, cobro_id
ON public.cobro_aplicaciones
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_cobro_aplicacion_no_excede_saldo();
