CREATE OR REPLACE FUNCTION public.__test_sync_venta_lotes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid := '6d849e12-6437-4b24-917d-a89cc9b2fa88';
  v_alm uuid := 'ccc730a0-07a5-41ce-83ef-3eb8cccfd9f8';
  v_cli uuid := '1ab00665-a08d-4ab1-941e-16f61afd206b';
  v_ven uuid := 'f71fec41-33ac-409b-94b7-b30f502ef807';
  v_p uuid; v_l1 uuid; v_l2 uuid; v_vid uuid := gen_random_uuid(); v_lid uuid;
  ini numeric; ini1 numeric; ini2 numeric; out jsonb := '[]'::jsonb;
  v_pid uuid := gen_random_uuid();
BEGIN
  SELECT sl.producto_id INTO v_p
    FROM stock_lotes sl JOIN productos p ON p.id=sl.producto_id
   WHERE p.empresa_id=v_emp AND sl.almacen_id=v_alm AND sl.cantidad>=20
   GROUP BY sl.producto_id HAVING count(*)>=2 LIMIT 1;
  IF v_p IS NULL THEN RETURN jsonb_build_object('error','sin producto con 2 lotes'); END IF;

  SELECT sl.lote_id INTO v_l1 FROM stock_lotes sl JOIN lotes lo ON lo.id=sl.lote_id
   WHERE sl.almacen_id=v_alm AND sl.producto_id=v_p AND sl.cantidad>=10
   ORDER BY lo.fecha_caducidad ASC NULLS LAST, lo.created_at ASC LIMIT 1;
  SELECT sl.lote_id INTO v_l2 FROM stock_lotes sl JOIN lotes lo ON lo.id=sl.lote_id
   WHERE sl.almacen_id=v_alm AND sl.producto_id=v_p AND sl.cantidad>=10 AND sl.lote_id<>v_l1
   ORDER BY lo.fecha_caducidad ASC NULLS LAST, lo.created_at ASC LIMIT 1;

  SELECT cantidad INTO ini FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p;
  SELECT cantidad INTO ini1 FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1;
  SELECT cantidad INTO ini2 FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2;

  -- A) venta directa con lote explícito
  INSERT INTO ventas (id,empresa_id,cliente_id,vendedor_id,almacen_id,tipo,status,entrega_inmediata,fecha,condicion_pago,subtotal,total)
  VALUES (v_vid,v_emp,v_cli,v_ven,v_alm,'venta_directa','entregado',true,CURRENT_DATE,'contado',0,0);
  INSERT INTO venta_lineas (venta_id,empresa_id,producto_id,cantidad,precio_unitario,subtotal,total,lote_id)
  VALUES (v_vid,v_emp,v_p,6,100,600,600,v_l1) RETURNING id INTO v_lid;
  out := out || jsonb_build_object('paso','L1 venta 6 del lote1 (esp tot -6, l1 -6)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini,
    'l1',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1)-ini1,
    'l2',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2)-ini2);

  -- B) cambiar de lote1 a lote2
  UPDATE venta_lineas SET lote_id=v_l2 WHERE id=v_lid;
  out := out || jsonb_build_object('paso','L2 cambiar a lote2 (esp tot -6, l1 0, l2 -6)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini,
    'l1',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1)-ini1,
    'l2',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2)-ini2);

  -- C) subir cantidad
  UPDATE venta_lineas SET cantidad=9 WHERE id=v_lid;
  out := out || jsonb_build_object('paso','L3 subir a 9 (esp tot -9, l2 -9)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini,
    'l1',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1)-ini1,
    'l2',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2)-ini2);

  -- D) borrador y de vuelta
  UPDATE ventas SET status='borrador' WHERE id=v_vid;
  out := out || jsonb_build_object('paso','L4 borrador (esp 0,0,0)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini,
    'l1',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1)-ini1,
    'l2',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2)-ini2);
  UPDATE ventas SET status='entregado' WHERE id=v_vid;
  out := out || jsonb_build_object('paso','L5 re-confirmar (esp tot -9, l2 -9)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini,
    'l1',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1)-ini1,
    'l2',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2)-ini2);

  DELETE FROM venta_lineas WHERE venta_id=v_vid;
  DELETE FROM movimientos_inventario WHERE referencia_id=v_vid;
  DELETE FROM venta_historial WHERE venta_id=v_vid;
  DELETE FROM ventas WHERE id=v_vid;
  out := out || jsonb_build_object('paso','L6 limpieza (esp 0,0,0)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini,
    'l1',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1)-ini1,
    'l2',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2)-ini2);

  -- E) PEDIDO entregado sin flujo de entregas: borrador y re-entrega
  INSERT INTO ventas (id,empresa_id,cliente_id,vendedor_id,almacen_id,tipo,status,fecha,condicion_pago,subtotal,total)
  VALUES (v_pid,v_emp,v_cli,v_ven,v_alm,'pedido','borrador',CURRENT_DATE,'contado',0,0);
  INSERT INTO venta_lineas (venta_id,empresa_id,producto_id,cantidad,precio_unitario,subtotal,total)
  VALUES (v_pid,v_emp,v_p,5,100,500,500);
  out := out || jsonb_build_object('paso','P1 pedido borrador (esp 0)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini);
  UPDATE ventas SET status='entregado' WHERE id=v_pid;
  out := out || jsonb_build_object('paso','P2 pedido entregado (esp -5)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini);
  UPDATE ventas SET status='borrador' WHERE id=v_pid;
  out := out || jsonb_build_object('paso','P3 pedido a borrador (esp 0)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini);
  UPDATE ventas SET status='entregado' WHERE id=v_pid;
  out := out || jsonb_build_object('paso','P4 pedido re-entregado (esp -5, sin doble)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini);

  DELETE FROM venta_lineas WHERE venta_id=v_pid;
  DELETE FROM movimientos_inventario WHERE referencia_id=v_pid;
  DELETE FROM venta_historial WHERE venta_id=v_pid;
  DELETE FROM ventas WHERE id=v_pid;
  out := out || jsonb_build_object('paso','P5 limpieza (esp 0)',
    'tot',(SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_p)-ini,
    'l1',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l1)-ini1,
    'l2',(SELECT cantidad FROM stock_lotes WHERE almacen_id=v_alm AND lote_id=v_l2)-ini2);
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.__test_sync_venta_lotes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.__test_sync_venta_lotes() TO service_role, sandbox_exec;