-- D-041: la comisión de cada renglón de venta sigue el modo de precio del producto.
--   · Producto con listas de precio → comisión de la regla de la lista (como antes).
--   · Producto de precio fijo        → comisión del producto (tiene_comision + tipo/pct_comision);
--                                       las reglas de lista NO aplican.
-- Antes siempre se tomaba la lista: la comisión de un producto de precio fijo nunca se cobraba y la
-- lista cobraba comisión aunque el producto fuera de precio fijo.
-- Solo afecta renglones nuevos o editados (las comisiones ya registradas no se recalculan).
CREATE OR REPLACE FUNCTION public.fn_fill_venta_linea_comision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid; v_tarifa uuid; v_cliente uuid; v_pct numeric; v_monto numeric;
  p record;
BEGIN
  v_pct := NEW.comision_pct;
  v_monto := NULL;

  -- Solo se resuelve si la línea viene sin porcentaje (respeta lo capturado a mano).
  IF v_pct IS NULL THEN
    SELECT usa_listas_precio, tiene_comision, tipo_comision, pct_comision INTO p
      FROM public.productos WHERE id = NEW.producto_id;
    IF COALESCE(p.usa_listas_precio, false) THEN
      SELECT v.empresa_id, v.tarifa_id, v.cliente_id INTO v_empresa, v_tarifa, v_cliente
        FROM public.ventas v WHERE v.id = NEW.venta_id;
      v_pct := public.resolver_comision_pct_linea(v_empresa, v_tarifa, v_cliente, NEW.producto_id);
    ELSIF COALESCE(p.tiene_comision, false) AND COALESCE(p.pct_comision, 0) > 0 THEN
      IF p.tipo_comision::text = 'monto_fijo' THEN
        v_monto := ROUND(COALESCE(NEW.cantidad, 0) * p.pct_comision, 2);
      ELSE
        v_pct := p.pct_comision;
      END IF;
    END IF;
  END IF;

  NEW.comision_pct := v_pct;
  NEW.comision_monto := CASE
    WHEN v_monto IS NOT NULL THEN v_monto
    WHEN v_pct IS NULL THEN NULL
    ELSE ROUND(COALESCE(NEW.subtotal, 0) * v_pct / 100.0, 2) END;
  RETURN NEW;
END;
$function$;
