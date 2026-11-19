-- ============================================================================
-- Fase 1 (fix): al ajustar el pedido a lo entregado, escalar TAMBIÉN el
-- descuento de encabezado (descuento_total / descuento_extra) proporcionalmente.
--
-- Bug: el trigger escalaba las líneas pero dejaba descuento_total completo, así
-- que en una entrega parcial el descuento (calculado para el pedido entero) se
-- comía la entrega chica. Ej: 10 de 50 piezas → base 459.40, pero restaba los
-- 229.90 de descuento del pedido completo → total 229.50 (mal). Ahora escala el
-- descuento por la razón entregado/pedido → 45.98 → total 413.42.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ajustar_pedido_por_entregado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido_id uuid;
  v_venta     public.ventas%ROWTYPE;
  v_linea     record;
  v_entregado numeric;
  v_sub numeric; v_iva numeric; v_ieps numeric; v_tot numeric;
  v_cambio boolean := false;
  v_old_base numeric;
  v_new_base numeric;
  v_ratio numeric;
BEGIN
  IF TG_TABLE_NAME = 'entrega_lineas' THEN
    SELECT e.pedido_id INTO v_pedido_id FROM public.entregas e WHERE e.id = NEW.entrega_id;
  ELSE
    v_pedido_id := NEW.pedido_id;
  END IF;
  IF v_pedido_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = v_pedido_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_venta.politica_cobro IS DISTINCT FROM 'entregado' THEN RETURN NEW; END IF;
  IF v_venta.tipo::text <> 'pedido' THEN RETURN NEW; END IF;
  IF v_venta.status::text IN ('facturado','cancelado') THEN RETURN NEW; END IF;
  IF COALESCE(v_venta.es_saldo_inicial,false) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.venta_lineas WHERE venta_id=v_venta.id
             AND (COALESCE(facturado,false)=true OR factura_cfdi_id IS NOT NULL)) THEN RETURN NEW; END IF;

  -- Base (subtotal+iva+ieps) ANTES de ajustar, para la razón del descuento.
  SELECT COALESCE(SUM(COALESCE(subtotal,0)+COALESCE(iva_monto,0)+COALESCE(ieps_monto,0)),0)
    INTO v_old_base FROM public.venta_lineas WHERE venta_id = v_venta.id;

  FOR v_linea IN
    SELECT id, producto_id, precio_unitario, iva_pct, ieps_pct, cantidad, subtotal, iva_monto, ieps_monto
    FROM public.venta_lineas WHERE venta_id = v_venta.id
  LOOP
    SELECT COALESCE(SUM(el.cantidad_entregada),0) INTO v_entregado
    FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
    WHERE e.pedido_id = v_venta.id AND e.status::text NOT IN ('cancelado','no_entregado')
      AND el.producto_id = v_linea.producto_id;

    IF v_linea.cantidad IS NOT DISTINCT FROM v_entregado THEN CONTINUE; END IF;

    IF v_linea.cantidad > 0 THEN
      v_sub  := ROUND(COALESCE(v_linea.subtotal,0)   / v_linea.cantidad * v_entregado, 2);
      v_iva  := ROUND(COALESCE(v_linea.iva_monto,0)  / v_linea.cantidad * v_entregado, 2);
      v_ieps := ROUND(COALESCE(v_linea.ieps_monto,0) / v_linea.cantidad * v_entregado, 2);
    ELSE
      v_sub  := ROUND(COALESCE(v_linea.precio_unitario,0) * v_entregado, 2);
      v_iva  := ROUND(v_sub * COALESCE(v_linea.iva_pct,0)/100.0, 2);
      v_ieps := ROUND(v_sub * COALESCE(v_linea.ieps_pct,0)/100.0, 2);
    END IF;
    v_tot := v_sub + v_iva + v_ieps;

    UPDATE public.venta_lineas SET cantidad=v_entregado, subtotal=v_sub,
      iva_monto=v_iva, ieps_monto=v_ieps, total=v_tot WHERE id = v_linea.id;
    v_cambio := true;
  END LOOP;

  IF v_cambio THEN
    -- Escalar el descuento de encabezado por la misma razón que bajó la base.
    SELECT COALESCE(SUM(COALESCE(subtotal,0)+COALESCE(iva_monto,0)+COALESCE(ieps_monto,0)),0)
      INTO v_new_base FROM public.venta_lineas WHERE venta_id = v_venta.id;

    IF v_old_base > 0 THEN
      v_ratio := v_new_base / v_old_base;
      UPDATE public.ventas SET
        descuento_total = ROUND(COALESCE(descuento_total,0) * v_ratio, 2),
        descuento_extra = CASE
          WHEN COALESCE(descuento_extra_tipo,'porcentaje') = 'porcentaje' THEN descuento_extra
          ELSE ROUND(COALESCE(descuento_extra,0) * v_ratio, 2)
        END
      WHERE id = v_venta.id;
    END IF;

    PERFORM public.fn_recalc_venta_saldo(v_venta.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Recrear (y reactivar) los triggers.
DROP TRIGGER IF EXISTS trg_ajustar_pedido_por_entregado ON public.entregas;
CREATE TRIGGER trg_ajustar_pedido_por_entregado
AFTER UPDATE OF status ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.ajustar_pedido_por_entregado();

DROP TRIGGER IF EXISTS trg_ajustar_pedido_por_entregado_lineas ON public.entrega_lineas;
CREATE TRIGGER trg_ajustar_pedido_por_entregado_lineas
AFTER UPDATE OF cantidad_entregada ON public.entrega_lineas
FOR EACH ROW EXECUTE FUNCTION public.ajustar_pedido_por_entregado();
