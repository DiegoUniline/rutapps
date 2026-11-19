
CREATE OR REPLACE FUNCTION public.fill_venta_linea_desglose()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cant numeric := COALESCE(NEW.cantidad, 0);
  v_sub  numeric := COALESCE(NEW.subtotal, 0);
  v_iva  numeric := COALESCE(NEW.iva_monto, 0);
  v_ieps numeric := COALESCE(NEW.ieps_monto, 0);
  v_lista numeric;
  v_desc_man numeric;
BEGIN
  -- Solo completa campos informativos vacíos. Nunca toca dinero, totales ni saldos.
  IF NEW.precio_lista_unitario IS NULL THEN
    NEW.precio_lista_unitario := COALESCE(NEW.precio_unitario_sin_redondeo, NEW.precio_unitario);
  END IF;
  v_lista := COALESCE(NEW.precio_lista_unitario, NEW.precio_unitario, 0);

  IF NEW.descuento_promocion_monto IS NULL THEN
    NEW.descuento_promocion_monto := 0;
  END IF;

  IF NEW.importe_bruto IS NULL THEN
    NEW.importe_bruto := ROUND(v_lista * v_cant, 2);
  END IF;

  IF NEW.descuento_manual_monto IS NULL THEN
    v_desc_man := GREATEST(
      ROUND(COALESCE(NEW.importe_bruto, 0) - v_sub - COALESCE(NEW.descuento_promocion_monto, 0), 2),
      0
    );
    NEW.descuento_manual_monto := v_desc_man;
  END IF;

  IF NEW.base_descuento_manual IS NULL THEN
    NEW.base_descuento_manual := ROUND(COALESCE(NEW.importe_bruto, 0) - COALESCE(NEW.descuento_promocion_monto, 0), 2);
  END IF;

  IF NEW.descuento_total_monto IS NULL THEN
    NEW.descuento_total_monto := ROUND(COALESCE(NEW.descuento_promocion_monto, 0) + COALESCE(NEW.descuento_manual_monto, 0), 2);
  END IF;

  IF NEW.base_ieps IS NULL THEN
    NEW.base_ieps := v_sub;
  END IF;

  IF NEW.base_iva IS NULL THEN
    NEW.base_iva := ROUND(v_sub + v_ieps, 2);
  END IF;

  IF NEW.impuestos_totales IS NULL THEN
    NEW.impuestos_totales := ROUND(v_iva + v_ieps, 2);
  END IF;

  IF NEW.descuento_manual IS NULL THEN
    NEW.descuento_manual := COALESCE(NEW.descuento_manual_monto, 0) > 0;
  END IF;

  IF NEW.cantidad_bonificada IS NULL THEN
    NEW.cantidad_bonificada := 0;
  END IF;

  IF NEW.es_bonificacion IS NULL THEN
    NEW.es_bonificacion := (v_sub = 0 AND v_cant > 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_venta_linea_desglose ON public.venta_lineas;
CREATE TRIGGER trg_fill_venta_linea_desglose
BEFORE INSERT OR UPDATE ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.fill_venta_linea_desglose();
