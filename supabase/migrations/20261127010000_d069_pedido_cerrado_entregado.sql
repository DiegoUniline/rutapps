-- D-069 (2026-11-27): un pedido «cerrado a lo entregado» queda como ENTREGADO. cerrar_pedido_parcial ponía cerrado_at
-- pero dejaba el estado en Confirmado (desde D-034 ya no hay otro camino que lo promueva: fn_sync_status_pedido se salta
-- los cerrados). Tampico PED-11679, PED-12610, PED-12621 y PED-12669 quedaron cerrados pero «Confirmado» y no contaban
-- como venta entregada en reportes/dashboard. El inventario no cambia: los pedidos con entregas no mueven stock por estado
-- (fn_sync_venta_inventario sale antes), el stock ya salió con sus entregas.

CREATE OR REPLACE FUNCTION public.cerrar_pedido_parcial(p_venta_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_excedente text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta      public.ventas%ROWTYPE;
  v_orig_base  numeric;
  v_deliv_base numeric;
  v_cobrable   numeric;
  v_cobros     numeric;
  v_saldo      numeric;
  v_snapshot   jsonb;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(v_venta.empresa_id);

  IF v_venta.tipo::text <> 'pedido' THEN
    RAISE EXCEPTION 'Solo se pueden cerrar pedidos'; END IF;
  IF v_venta.politica_cobro IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Solo aplica a pedidos con política de cobro por entregado'; END IF;
  IF v_venta.cerrado_at IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'; END IF;
  IF v_venta.status::text IN ('cancelado','facturado') THEN
    RAISE EXCEPTION 'No se puede cerrar un pedido cancelado o facturado'; END IF;
  IF COALESCE(v_venta.es_saldo_inicial,false) THEN
    RAISE EXCEPTION 'No aplica a saldos iniciales'; END IF;

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

  IF COALESCE(v_deliv_base, 0) <= 0 THEN
    RAISE EXCEPTION 'No hay nada entregado: cancela el pedido en vez de cerrarlo';
  END IF;

  v_cobrable := CASE WHEN COALESCE(v_orig_base,0) > 0
                     THEN ROUND(COALESCE(v_venta.total,0) * (v_deliv_base / v_orig_base), 2)
                     ELSE 0 END;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';

  v_saldo := GREATEST(0, v_cobrable - v_cobros);

  v_snapshot := jsonb_build_object(
    'pedido_total',    COALESCE(v_venta.total,0),
    'total_efectivo',  v_cobrable,
    'cobros',          v_cobros,
    'saldo',           v_saldo,
    'base_original',   v_orig_base,
    'base_entregada',  v_deliv_base,
    'lineas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'linea_id',    vl.id,
               'producto_id', vl.producto_id,
               'pedido',      vl.cantidad,
               'entregado',   COALESCE((
                  SELECT SUM(el.cantidad_entregada)
                  FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
                  WHERE e.pedido_id = p_venta_id
                    AND e.status::text NOT IN ('cancelado','no_entregado')
                    AND el.producto_id = vl.producto_id), 0),
               'subtotal_orig', vl.subtotal,
               'iva_orig',      vl.iva_monto,
               'ieps_orig',     vl.ieps_monto,
               'total_orig',    vl.total
             )), '[]'::jsonb)
      FROM public.venta_lineas vl WHERE vl.venta_id = p_venta_id
    )
  );

  -- UPDATE sin LATERAL: el ratio se calcula inline usando vl (target) y ent (FROM).
  UPDATE public.venta_lineas vl
  SET
    cantidad   = LEAST(COALESCE(ent.entregado, 0), vl.cantidad),
    subtotal   = ROUND(COALESCE(vl.subtotal,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    iva_monto  = ROUND(COALESCE(vl.iva_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    ieps_monto = ROUND(COALESCE(vl.ieps_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    total      = ROUND(COALESCE(vl.total,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2)
  FROM (
    SELECT vl2.id AS linea_id,
           COALESCE((SELECT SUM(el.cantidad_entregada)
                       FROM public.entrega_lineas el
                       JOIN public.entregas e ON e.id = el.entrega_id
                      WHERE e.pedido_id = p_venta_id
                        AND e.status::text NOT IN ('cancelado','no_entregado')
                        AND el.producto_id = vl2.producto_id), 0) AS entregado
    FROM public.venta_lineas vl2
    WHERE vl2.venta_id = p_venta_id
  ) ent
  WHERE vl.id = ent.linea_id AND vl.venta_id = p_venta_id;

  UPDATE public.ventas
  SET status           = CASE WHEN status::text = 'confirmado' THEN 'entregado'::status_venta ELSE status END,  -- D-069
      cerrado_at       = now(),
      cerrado_por      = COALESCE(auth.uid(), p_user_id),
      total_efectivo   = v_cobrable,
      cerrado_snapshot = v_snapshot
  WHERE id = p_venta_id;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
  PERFORM public._resolver_excedente_venta(p_venta_id, p_excedente, auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_pedido_parcial(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa((SELECT v.empresa_id FROM public.ventas v WHERE v.id = p_venta_id));

  UPDATE public.ventas
  SET cerrado_at = NULL, cerrado_por = NULL, total_efectivo = NULL, cerrado_snapshot = NULL
  WHERE id = p_venta_id AND cerrado_at IS NOT NULL;

  -- D-069: al reabrir, el estado vuelve a salir de las entregas (Entregado / Confirmado) y se recalcula el saldo.
  PERFORM public.fn_sync_status_pedido(p_venta_id);
END;
$function$;

-- Pedidos ya cerrados que quedaron en Confirmado.
UPDATE public.ventas SET status = 'entregado'::status_venta
 WHERE tipo::text = 'pedido' AND cerrado_at IS NOT NULL AND status::text = 'confirmado';
