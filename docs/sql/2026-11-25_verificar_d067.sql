-- D-067 · Verificar «el saldo nace al generar la entrega» SIN dejar nada (termina con RAISE: todo se deshace).
-- Correr DESPUÉS del contenido de la migración 20261125010000 en la misma transacción (ensayo) o después de aplicarla.
-- Esperado: «D-067 OK (4/4)».
DO $v$
DECLARE
  v_ok int := 0; v_log text := ''; v_ped uuid; v_ent uuid; v_total numeric; v_cob numeric; v_s numeric; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  -- Pedido de contado «a lo entregado», sin pagos, con UNA entrega cargada que lleva todo lo pedido.
  SELECT v.id, e.id, v.total INTO v_ped, v_ent, v_total
  FROM public.ventas v JOIN public.entregas e ON e.pedido_id = v.id
  WHERE v.tipo::text = 'pedido' AND v.politica_cobro = 'entregado' AND v.status::text = 'confirmado' AND v.cerrado_at IS NULL
    AND e.status::text = 'cargado'
    AND (SELECT count(*) FROM public.entregas x WHERE x.pedido_id = v.id) = 1
    AND NOT EXISTS (SELECT 1 FROM public.cobro_aplicaciones ca WHERE ca.venta_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.entrega_lineas el WHERE el.entrega_id = e.id AND el.cantidad_entregada < el.cantidad_pedida)
    AND NOT EXISTS (SELECT 1 FROM public.venta_lineas vl WHERE vl.venta_id = v.id AND (COALESCE(vl.facturado,false) OR vl.factura_cfdi_id IS NOT NULL))
  ORDER BY v.created_at DESC LIMIT 1;
  IF v_ped IS NULL THEN RAISE EXCEPTION 'D-067: no hay pedido de prueba'; END IF;

  -- 1. Entrega cargada → el pedido ya debe su total.
  PERFORM public.fn_recalc_venta_saldo(v_ped);
  SELECT saldo_pendiente INTO v_s FROM public.ventas WHERE id = v_ped;
  IF abs(v_s - v_total) < 0.01 THEN v_ok := v_ok + 1; v_log := v_log || format('1 cargada debe %s ✓ ', v_s);
  ELSE v_log := v_log || format('1 ✗ saldo %s total %s ', v_s, v_total); END IF;

  -- 2. Entrega cancelada → ya no debe.
  UPDATE public.entregas SET status = 'cancelado' WHERE id = v_ent;
  SELECT saldo_pendiente INTO v_s FROM public.ventas WHERE id = v_ped;
  IF v_s = 0 THEN v_ok := v_ok + 1; v_log := v_log || '2 cancelada debe 0 ✓ ';
  ELSE v_log := v_log || format('2 ✗ saldo %s ', v_s); END IF;

  -- 3. Pedidos con entregas y ninguna pendiente: el saldo no cambia con la regla nueva (muestra de 500).
  --    (Los pedidos aún sin entrega no cuentan: se guardan con saldo = total y se recalculan al generar la entrega.)
  SELECT count(*) INTO v_n FROM (
    SELECT v.id, v.saldo_pendiente,
           GREATEST(0, public.fn_venta_cobrable(v) - COALESCE((SELECT sum(ca.monto_aplicado) FROM public.cobro_aplicaciones ca
             JOIN public.cobros c ON c.id = ca.cobro_id WHERE ca.venta_id = v.id AND COALESCE(c.status,'activo') <> 'cancelado'), 0)) AS nuevo
    FROM public.ventas v
    WHERE v.tipo::text = 'pedido' AND v.politica_cobro = 'entregado' AND v.status::text <> 'cancelado'
      AND EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = v.id)
      AND NOT EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = v.id AND e.status::text NOT IN ('hecho','cancelado','no_entregado'))
    ORDER BY v.updated_at DESC LIMIT 500) q
  WHERE abs(q.saldo_pendiente - q.nuevo) > 0.01;
  IF v_n = 0 THEN v_ok := v_ok + 1; v_log := v_log || '3 sin entregas pendientes sin cambio ✓ ';
  ELSE v_log := v_log || format('3 ✗ %s cambian ', v_n); END IF;

  -- 4. Triggers de borrado presentes.
  SELECT count(*) INTO v_n FROM pg_trigger WHERE tgname IN ('trg_recalc_pedido_entrega_borrada', 'trg_recalc_pedido_entrega_linea_borrada');
  IF v_n = 2 THEN v_ok := v_ok + 1; v_log := v_log || '4 triggers de borrado ✓ ';
  ELSE v_log := v_log || format('4 ✗ triggers %s ', v_n); END IF;

  RAISE EXCEPTION 'D-067 %/4: % — todo se deshizo', v_ok, v_log;
END
$v$;
