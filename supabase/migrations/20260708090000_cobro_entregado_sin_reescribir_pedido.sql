-- ============================================================================
-- COBRO POR ENTREGADO · No reescribir el pedido; cobrar el prorrateo entregado
--
-- Problema: ajustar_pedido_por_entregado REESCRIBÍA venta_lineas (cantidad/
-- subtotal/impuestos/total) a lo entregado. Así, un pedido de 10 que entregó 5
-- "se convertía" en un pedido de 5 y se perdía lo original. Cancelar/reponer
-- entregas mutaba el pedido.
--
-- Correcto (lo que pidió el usuario):
--   • El pedido NO se toca: venta_lineas.cantidad = lo que el cliente pidió.
--   • ventas.total = total del pedido original (con su descuento de encabezado,
--     que ya lo garantiza normalize_venta_total_descuento).
--   • El SALDO cobrable se calcula aparte, prorrateando por lo efectivamente
--     entregado (Σ entrega_lineas de entregas no canceladas/no entregadas):
--
--       ratio_linea    = LEAST(entregado, cantidad) / cantidad
--       base_original  = Σ (subtotal+iva+ieps) por línea
--       base_entregada = Σ (subtotal+iva+ieps) * ratio_linea
--       total_cobrable = ventas.total * (base_entregada / base_original)
--       saldo          = MAX(0, total_cobrable − Σ cobros aplicados)
--
--   Resultado: pedido de 10, entrego 5 → cobro 5 (saldo a la mitad); el pedido
--   sigue en 10; si luego entrego las otras 5 → el saldo vuelve a subir solo.
--
-- ALCANCE: SOLO pedidos con politica_cobro='entregado'. Ventas directas (no son
-- 'pedido' y no generan entregas) y pedidos de contado/crédito normal NO cambian:
-- para ellos el cobrable sigue siendo ventas.total completo.
--
-- HISTÓRICO: no se toca. Los pedidos que el trigger viejo ya reescribió quedan
-- como están (su saldo ya era correcto). El cambio aplica de aquí en adelante.
-- ============================================================================

-- 1) Saldo cobrable: prorrateo por entregado SOLO para pedidos 'entregado'.
CREATE OR REPLACE FUNCTION public.fn_recalc_venta_saldo(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta       public.ventas%ROWTYPE;
  v_cobros      numeric;
  v_cobrable    numeric;
  v_orig_base   numeric;
  v_deliv_base  numeric;
  v_es_entregado boolean;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Cobros activos aplicados a la venta.
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id
    AND COALESCE(c.status, 'activo') <> 'cancelado';

  -- ¿Cobra por lo entregado? Solo pedidos con política 'entregado', no saldo
  -- inicial y SIN factura (facturado = se cobra completo, no por entregado).
  v_es_entregado :=
        v_venta.tipo::text = 'pedido'
    AND v_venta.politica_cobro IS NOT DISTINCT FROM 'entregado'
    AND COALESCE(v_venta.es_saldo_inicial, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.venta_lineas
      WHERE venta_id = p_venta_id
        AND (COALESCE(facturado, false) = true OR factura_cfdi_id IS NOT NULL)
    );

  IF v_es_entregado THEN
    -- Base original (gross por línea) y base entregada (prorrateo por entregado).
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
    -- Comportamiento normal: se debe el total completo.
    v_cobrable := COALESCE(v_venta.total, 0);
  END IF;

  UPDATE public.ventas
  SET saldo_pendiente = GREATEST(0, v_cobrable - COALESCE(v_cobros, 0))
  WHERE id = p_venta_id;
END;
$$;

-- 2) Al entregar/cancelar: NO reescribir el pedido; solo recalcular el saldo.
CREATE OR REPLACE FUNCTION public.ajustar_pedido_por_entregado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'entrega_lineas' THEN
    SELECT e.pedido_id INTO v_pedido_id FROM public.entregas e WHERE e.id = NEW.entrega_id;
  ELSE
    v_pedido_id := NEW.pedido_id;
  END IF;
  IF v_pedido_id IS NULL THEN RETURN NEW; END IF;

  -- El saldo cobrable se recalcula desde lo entregado (fn_recalc_venta_saldo
  -- decide si prorratea o cobra completo). El pedido queda intacto.
  PERFORM public.fn_recalc_venta_saldo(v_pedido_id);
  RETURN NEW;
END;
$function$;

-- Triggers (se mantienen: al cerrar/cancelar entrega y al editar en vivo).
DROP TRIGGER IF EXISTS trg_ajustar_pedido_por_entregado ON public.entregas;
CREATE TRIGGER trg_ajustar_pedido_por_entregado
AFTER UPDATE OF status ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.ajustar_pedido_por_entregado();

DROP TRIGGER IF EXISTS trg_ajustar_pedido_por_entregado_lineas ON public.entrega_lineas;
CREATE TRIGGER trg_ajustar_pedido_por_entregado_lineas
AFTER INSERT OR UPDATE OF cantidad_entregada ON public.entrega_lineas
FOR EACH ROW EXECUTE FUNCTION public.ajustar_pedido_por_entregado();
