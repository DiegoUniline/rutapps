CREATE OR REPLACE FUNCTION public.fn_recalc_venta_saldo(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta        public.ventas%ROWTYPE;
  v_cobros       numeric;
  v_cobrable     numeric;
  v_orig_base    numeric;
  v_deliv_base   numeric;
  v_es_entregado boolean;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id
    AND COALESCE(c.status, 'activo') <> 'cancelado';

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

  UPDATE public.ventas
  SET saldo_pendiente = GREATEST(0, v_cobrable - COALESCE(v_cobros, 0))
  WHERE id = p_venta_id;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.ventas
     WHERE tipo::text = 'pedido'
       AND condicion_pago::text = 'contado'
       AND cerrado_at IS NULL
       AND status::text NOT IN ('cancelado','borrador')
  LOOP
    PERFORM public.fn_recalc_venta_saldo(r.id);
  END LOOP;
END $$;