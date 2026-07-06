-- ============================================================================
-- Punto 1: motivo por línea en la entrega (arregla la función "quitar producto"
--          del móvil, que escribía motivo_no_entrega en entrega_lineas — columna
--          que no existía; solo estaba en el header 'entregas').
-- ----------------------------------------------------------------------------
ALTER TABLE public.entrega_lineas
  ADD COLUMN IF NOT EXISTS motivo_no_entrega text;

-- ============================================================================
-- Punto 2: al cerrar las entregas de un PEDIDO, la venta se ajusta a lo que
--          REALMENTE se entregó. Lo no entregado (rechazado por el cliente) deja
--          de contar en el total y en el saldo. (Opción B: la venta se ajusta
--          sola, vía trigger.)
--
-- Cómo funciona:
--   • Se dispara cuando una entrega pasa a un estado TERMINAL (hecho/no_entregado
--     /cancelado).
--   • Solo procede cuando TODAS las entregas del pedido ya están resueltas (para
--     soportar pedidos partidos en varias entregas) y hay al menos una 'hecho'.
--   • Por cada línea del pedido: entregado = Σ cantidad_entregada de las entregas
--     'hecho'. Si se entregó menos de lo pedido, se prorratea la línea
--     (subtotal/iva/ieps/total) por la razón entregado/pedido y se baja la
--     cantidad. Los triggers de venta_lineas recalculan ventas.total; luego
--     fn_recalc_venta_saldo recalcula el saldo (= total − pagos aplicados).
--   • Idempotente: si ya se ajustó, entregado == cantidad y no vuelve a tocar.
--
-- Guardas (para que NO falle ni corrompa contabilidad):
--   • Solo tipo='pedido'.
--   • No toca ventas 'facturado' / 'cancelado' ni es_saldo_inicial.
--   • No toca si alguna línea ya tiene CFDI (facturado / factura_cfdi_id).
--   • Si NADA se entregó (ninguna entrega 'hecho'), no toca la venta: esa venta
--     se maneja cancelándola, no reduciéndola a cero desde aquí.
--
-- La cantidad ORIGINAL pedida queda preservada en entrega_lineas.cantidad_pedida.
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

  -- Solo pedidos; nunca ventas facturadas/canceladas ni saldo inicial.
  IF v_venta.tipo::text <> 'pedido' THEN RETURN NEW; END IF;
  IF v_venta.status::text IN ('facturado','cancelado') THEN RETURN NEW; END IF;
  IF COALESCE(v_venta.es_saldo_inicial, false) THEN RETURN NEW; END IF;

  -- No tocar si alguna línea ya se facturó (CFDI): no se puede reducir en silencio.
  IF EXISTS (
    SELECT 1 FROM public.venta_lineas
    WHERE venta_id = v_venta.id
      AND (COALESCE(facturado, false) = true OR factura_cfdi_id IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- Esperar a que TODAS las entregas del pedido estén resueltas.
  SELECT COUNT(*) INTO v_pendientes
  FROM public.entregas
  WHERE pedido_id = v_venta.id
    AND status::text NOT IN ('hecho','no_entregado','cancelado');
  IF v_pendientes > 0 THEN RETURN NEW; END IF;

  -- Debe haber al menos una entrega 'hecho' (entrega parcial real).
  SELECT EXISTS(
    SELECT 1 FROM public.entregas
    WHERE pedido_id = v_venta.id AND status = 'hecho'
  ) INTO v_hay_hecho;
  IF NOT v_hay_hecho THEN RETURN NEW; END IF;

  -- Ajustar cada línea del pedido a lo realmente entregado.
  FOR v_linea IN
    SELECT id, producto_id, cantidad, subtotal, iva_monto, ieps_monto, total
    FROM public.venta_lineas
    WHERE venta_id = v_venta.id
  LOOP
    IF v_linea.cantidad IS NULL OR v_linea.cantidad <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(el.cantidad_entregada), 0) INTO v_entregado
    FROM public.entrega_lineas el
    JOIN public.entregas e ON e.id = el.entrega_id
    WHERE e.pedido_id = v_venta.id
      AND e.status = 'hecho'
      AND el.producto_id = v_linea.producto_id;

    v_entregado := LEAST(v_entregado, v_linea.cantidad);

    -- Entregado completo => sin cambio (idempotente).
    IF v_entregado >= v_linea.cantidad THEN CONTINUE; END IF;

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

  -- Los triggers de venta_lineas ya recalcularon ventas.total. Recalcular el saldo.
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
