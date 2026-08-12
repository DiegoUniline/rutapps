CREATE OR REPLACE FUNCTION public.fn_fill_venta_linea_comision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid; v_tarifa uuid; v_cliente uuid; v_pct numeric;
BEGIN
  v_pct := NEW.comision_pct;

  -- Solo resolver desde la lista de precios si la línea viene sin porcentaje
  IF v_pct IS NULL THEN
    SELECT v.empresa_id, v.tarifa_id, v.cliente_id INTO v_empresa, v_tarifa, v_cliente
    FROM ventas v WHERE v.id = NEW.venta_id;
    v_pct := public.resolver_comision_pct_linea(v_empresa, v_tarifa, v_cliente, NEW.producto_id);
  END IF;

  NEW.comision_pct := v_pct;
  NEW.comision_monto := CASE WHEN v_pct IS NULL THEN NULL
    ELSE ROUND(COALESCE(NEW.subtotal, 0) * v_pct / 100.0, 2) END;
  RETURN NEW;
END; $function$;