-- ============================================================================
-- POLÍTICA DE COBRO — Fase 1 (v2): el saldo se actualiza EN VIVO al editar la
-- cantidad a entregar, no solo al marcar "entregado".
-- ----------------------------------------------------------------------------
-- SOLO pedidos con politica_cobro='entregado'. Se recalcula cada línea del
-- pedido a lo entregado (Σ cantidad_entregada en entregas no canceladas/no
-- entregadas) escalando los montos REALES de la línea por unidad — así respeta
-- descuentos, redondeo e impuestos, y es re-editable (el por-unidad es
-- invariante). Recalcula el saldo con fn_recalc_venta_saldo.
--
-- Se dispara en DOS lugares:
--   • entregas AFTER UPDATE OF status  → al cerrar/cancelar/etc.
--   • entrega_lineas AFTER UPDATE OF cantidad_entregada → EN VIVO al editar.
--
-- Guardas: solo tipo 'pedido', no facturado/cancelado/saldo inicial ni líneas
-- con CFDI. Idempotente (si la cantidad no cambia, no toca la línea).
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
BEGIN
  -- Identificar el pedido según la tabla que disparó.
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
  IF EXISTS (
    SELECT 1 FROM public.venta_lineas
    WHERE venta_id = v_venta.id
      AND (COALESCE(facturado,false) = true OR factura_cfdi_id IS NOT NULL)
  ) THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT id, producto_id, precio_unitario, iva_pct, ieps_pct,
           cantidad, subtotal, iva_monto, ieps_monto
    FROM public.venta_lineas WHERE venta_id = v_venta.id
  LOOP
    SELECT COALESCE(SUM(el.cantidad_entregada),0) INTO v_entregado
    FROM public.entrega_lineas el
    JOIN public.entregas e ON e.id = el.entrega_id
    WHERE e.pedido_id = v_venta.id
      AND e.status::text NOT IN ('cancelado','no_entregado')
      AND el.producto_id = v_linea.producto_id;

    IF v_linea.cantidad IS NOT DISTINCT FROM v_entregado THEN
      CONTINUE;  -- sin cambio (idempotente)
    END IF;

    IF v_linea.cantidad > 0 THEN
      -- Escalar los montos reales por unidad (respeta descuento/redondeo/impuestos).
      v_sub  := ROUND(COALESCE(v_linea.subtotal,0)   / v_linea.cantidad * v_entregado, 2);
      v_iva  := ROUND(COALESCE(v_linea.iva_monto,0)  / v_linea.cantidad * v_entregado, 2);
      v_ieps := ROUND(COALESCE(v_linea.ieps_monto,0) / v_linea.cantidad * v_entregado, 2);
    ELSE
      -- Línea en 0 (rechazo total previo): reconstruir desde el precio unitario.
      v_sub  := ROUND(COALESCE(v_linea.precio_unitario,0) * v_entregado, 2);
      v_iva  := ROUND(v_sub * COALESCE(v_linea.iva_pct,0)/100.0, 2);
      v_ieps := ROUND(v_sub * COALESCE(v_linea.ieps_pct,0)/100.0, 2);
    END IF;
    v_tot := v_sub + v_iva + v_ieps;

    UPDATE public.venta_lineas SET
      cantidad = v_entregado, subtotal = v_sub,
      iva_monto = v_iva, ieps_monto = v_ieps, total = v_tot
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
FOR EACH ROW EXECUTE FUNCTION public.ajustar_pedido_por_entregado();

DROP TRIGGER IF EXISTS trg_ajustar_pedido_por_entregado_lineas ON public.entrega_lineas;
CREATE TRIGGER trg_ajustar_pedido_por_entregado_lineas
AFTER UPDATE OF cantidad_entregada ON public.entrega_lineas
FOR EACH ROW EXECUTE FUNCTION public.ajustar_pedido_por_entregado();
