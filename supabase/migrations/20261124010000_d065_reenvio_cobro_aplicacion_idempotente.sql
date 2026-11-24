-- D-065 · Reenvío idempotente de cobro_aplicaciones.
-- El celular sube cada aplicación con upsert(onConflict id, ignoreDuplicates). Las validaciones
-- BEFORE INSERT contaban la propia fila ya guardada como «ya aplicado» y rechazaban el reenvío con
-- «excede el saldo pendiente» antes de llegar al ON CONFLICT DO NOTHING. Resultado: fallidos que se
-- reintentaban sin fin (≈3,800 errores/día) aunque el pago ya estaba en el servidor.
-- Cambio: si ya existe una fila con el mismo id, la validación no aplica (el INSERT lo ignora el
-- ON CONFLICT o falla por llave primaria, como siempre). Nada más cambia.

CREATE OR REPLACE FUNCTION public.fn_validate_cobro_aplicacion_no_excede_saldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_aplicado numeric;
  v_folio text;
BEGIN
  -- Reenvío de una aplicación ya guardada: no es un pago nuevo.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.cobro_aplicaciones WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_validate_cobro_no_sobreaplicado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_monto_cobro numeric;
  v_aplicado numeric;
BEGIN
  -- Reenvío de una aplicación ya guardada: no es un pago nuevo.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.cobro_aplicaciones WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

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
$function$;
