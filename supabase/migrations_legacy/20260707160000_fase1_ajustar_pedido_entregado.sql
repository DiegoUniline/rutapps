-- ============================================================================
-- POLÍTICA DE COBRO — FASE 1: la venta se ajusta a lo ENTREGADO.
-- ----------------------------------------------------------------------------
-- SOLO actúa sobre pedidos cuya politica_cobro = 'entregado' (snapshot).
-- Todo lo demás (NULL = 'pedido', o 'pedido' explícito) NO se toca → los
-- pedidos existentes y los de empresas en modo 'pedido' quedan intactos.
--
-- Se dispara cuando una entrega llega a estado terminal. Procede solo cuando
-- TODAS las entregas del pedido están resueltas y hay al menos una 'hecho'.
-- Ajusta cada línea del pedido a lo realmente entregado (prorrateando
-- subtotal/iva/ieps/total) y recalcula el saldo con fn_recalc_venta_saldo.
--
-- Guardas: no toca facturado/cancelado, saldo inicial, ni líneas con CFDI.
-- Idempotente. La cantidad ORIGINAL pedida queda en entrega_lineas.cantidad_pedida.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ajustar_pedido_por_entregado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venta      public.ventas%ROWTYPE;
  v_linea      record;
  v_entregado  numeric;
  v_ratio      numeric;
  v_hay_hecho  boolean;
  v_pendientes int;
  v_cambio     boolean := false;
BEGIN
  IF NEW.pedido_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = NEW.pedido_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- >>> Candado principal: SOLO política 'entregado'. <<<
  IF v_venta.politica_cobro IS DISTINCT FROM 'entregado' THEN RETURN NEW; END IF;

  IF v_venta.tipo::text <> 'pedido' THEN RETURN NEW; END IF;
  IF v_venta.status::text IN ('facturado','cancelado') THEN RETURN NEW; END IF;
  IF COALESCE(v_venta.es_saldo_inicial, false) THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.venta_lineas
    WHERE venta_id = v_venta.id
      AND (COALESCE(facturado,false) = true OR factura_cfdi_id IS NOT NULL)
  ) THEN RETURN NEW; END IF;

  -- Esperar a que TODAS las entregas del pedido estén resueltas.
  SELECT COUNT(*) INTO v_pendientes
  FROM public.entregas
  WHERE pedido_id = v_venta.id
    AND status::text NOT IN ('hecho','no_entregado','cancelado');
  IF v_pendientes > 0 THEN RETURN NEW; END IF;

  -- Debe haber al menos una entrega 'hecho'.
  SELECT EXISTS(
    SELECT 1 FROM public.entregas WHERE pedido_id = v_venta.id AND status = 'hecho'
  ) INTO v_hay_hecho;
  IF NOT v_hay_hecho THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT id, producto_id, cantidad, subtotal, iva_monto, ieps_monto, total
    FROM public.venta_lineas WHERE venta_id = v_venta.id
  LOOP
    IF v_linea.cantidad IS NULL OR v_linea.cantidad <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(el.cantidad_entregada), 0) INTO v_entregado
    FROM public.entrega_lineas el
    JOIN public.entregas e ON e.id = el.entrega_id
    WHERE e.pedido_id = v_venta.id AND e.status = 'hecho'
      AND el.producto_id = v_linea.producto_id;

    v_entregado := LEAST(v_entregado, v_linea.cantidad);
    IF v_entregado >= v_linea.cantidad THEN CONTINUE; END IF;  -- entregado completo

    v_ratio := v_entregado / v_linea.cantidad;
    UPDATE public.venta_lineas SET
      cantidad   = v_entregado,
      subtotal   = ROUND(COALESCE(v_linea.subtotal,   0) * v_ratio, 2),
      iva_monto  = ROUND(COALESCE(v_linea.iva_monto,  0) * v_ratio, 2),
      ieps_monto = ROUND(COALESCE(v_linea.ieps_monto, 0) * v_ratio, 2),
      total      = ROUND(COALESCE(v_linea.total,      0) * v_ratio, 2)
    WHERE id = v_linea.id;
    v_cambio := true;
  END LOOP;

  IF v_cambio THEN
    PERFORM public.fn_recalc_venta_saldo(v_venta.id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ajustar_pedido_por_entregado ON public.entregas;
CREATE TRIGGER trg_ajustar_pedido_por_entregado
AFTER UPDATE OF status ON public.entregas
FOR EACH ROW
WHEN (NEW.status::text IN ('hecho','no_entregado','cancelado'))
EXECUTE FUNCTION public.ajustar_pedido_por_entregado();
