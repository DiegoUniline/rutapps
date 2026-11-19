-- F1b (D-020): una venta cancelada no adeuda nada. fn_venta_cobrable lo usan solo
-- fn_recalc_venta_saldo y recalc_venta_saldo_on_total_change.
CREATE OR REPLACE FUNCTION public.fn_venta_cobrable(v_venta ventas)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p_venta_id     uuid := v_venta.id;
  v_cobrable     numeric;
  v_orig_base    numeric;
  v_deliv_base   numeric;
  v_es_entregado boolean;
BEGIN
  IF v_venta.status::text = 'cancelado' THEN
    RETURN 0;
  END IF;

  IF v_venta.cerrado_at IS NOT NULL THEN
    v_cobrable := COALESCE(v_venta.total_efectivo, 0);
  ELSE
    v_es_entregado :=
          v_venta.tipo::text = 'pedido'
      AND v_venta.politica_cobro IS NOT DISTINCT FROM 'entregado'
      -- Un pedido de CONTADO adeuda el total: no se reduce por lo entregado.
      AND COALESCE(v_venta.condicion_pago::text, '') <> 'contado'
      AND COALESCE(v_venta.es_saldo_inicial, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.venta_lineas
        WHERE venta_id = p_venta_id
          AND (COALESCE(facturado, false) = true OR factura_cfdi_id IS NOT NULL)
      );

    IF v_es_entregado THEN
      SELECT COALESCE(SUM(base), 0), COALESCE(SUM(base * ratio), 0)
        INTO v_orig_base, v_deliv_base
      FROM (
        SELECT
          (COALESCE(vl.subtotal,0) + COALESCE(vl.iva_monto,0) + COALESCE(vl.ieps_monto,0)) AS base,
          CASE WHEN vl.cantidad > 0
               THEN LEAST(COALESCE(ent.entregado, 0), vl.cantidad) / vl.cantidad
               ELSE 0 END AS ratio
        FROM public.venta_lineas vl
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(el.cantidad_entregada), 0) AS entregado
          FROM public.entrega_lineas el
          JOIN public.entregas e ON e.id = el.entrega_id
          WHERE e.pedido_id = p_venta_id
            AND e.status::text NOT IN ('cancelado','no_entregado')
            AND el.producto_id = vl.producto_id
        ) ent ON true
        WHERE vl.venta_id = p_venta_id
      ) q;

      IF COALESCE(v_orig_base, 0) > 0 THEN
        v_cobrable := ROUND(COALESCE(v_venta.total, 0) * (v_deliv_base / v_orig_base), 2);
      ELSE
        v_cobrable := 0;
      END IF;
    ELSE
      v_cobrable := COALESCE(v_venta.total, 0);
    END IF;
  END IF;

  RETURN v_cobrable;
END;
$function$;
