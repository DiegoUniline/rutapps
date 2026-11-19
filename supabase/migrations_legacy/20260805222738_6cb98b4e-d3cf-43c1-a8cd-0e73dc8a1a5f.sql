CREATE OR REPLACE FUNCTION public.__test_sync_venta_edicion()
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
  v_pa uuid; v_pb uuid; v_vid uuid := gen_random_uuid(); v_lid uuid;
  ini_a numeric; ini_b numeric; out jsonb := '[]'::jsonb;
BEGIN
  SELECT s.producto_id INTO v_pa FROM stock_almacen s JOIN productos p ON p.id=s.producto_id
   WHERE s.almacen_id=v_alm AND s.cantidad>100 AND NOT coalesce(p.maneja_lote,false) ORDER BY s.cantidad DESC LIMIT 1;
  SELECT s.producto_id INTO v_pb FROM stock_almacen s JOIN productos p ON p.id=s.producto_id
   WHERE s.almacen_id=v_alm AND s.cantidad>100 AND NOT coalesce(p.maneja_lote,false) AND s.producto_id<>v_pa ORDER BY s.cantidad DESC LIMIT 1;
  SELECT cantidad INTO ini_a FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa;
  SELECT cantidad INTO ini_b FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb;

  INSERT INTO ventas (id,empresa_id,cliente_id,vendedor_id,almacen_id,tipo,status,entrega_inmediata,fecha,condicion_pago,subtotal,total)
  VALUES (v_vid,v_emp,v_cli,v_ven,v_alm,'venta_directa','entregado',true,CURRENT_DATE,'contado',0,0);
  INSERT INTO venta_lineas (venta_id,empresa_id,producto_id,cantidad,precio_unitario,subtotal,total)
  VALUES (v_vid,v_emp,v_pa,10,100,1000,1000) RETURNING id INTO v_lid;
  out := out || jsonb_build_object('paso','1 venta 10 pzas (esp A -10)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a);

  UPDATE venta_lineas SET cantidad=4 WHERE id=v_lid;
  out := out || jsonb_build_object('paso','2 editar 10->4 (esp A -4)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a);

  UPDATE venta_lineas SET producto_id=v_pb WHERE id=v_lid;
  out := out || jsonb_build_object('paso','3 sustituir A->B (esp A 0, B -4)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a,'deltaB',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb)-ini_b);

  UPDATE ventas SET status='borrador' WHERE id=v_vid;
  out := out || jsonb_build_object('paso','4 a borrador (esp 0,0)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a,'deltaB',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb)-ini_b);

  INSERT INTO venta_lineas (venta_id,empresa_id,producto_id,cantidad,precio_unitario,subtotal,total)
  VALUES (v_vid,v_emp,v_pa,3,100,300,300);
  out := out || jsonb_build_object('paso','5 linea nueva en borrador (esp A 0)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a);

  UPDATE ventas SET status='entregado' WHERE id=v_vid;
  out := out || jsonb_build_object('paso','6 re-confirmar (esp A -3, B -4)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a,'deltaB',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb)-ini_b);

  UPDATE ventas SET status='entregado' WHERE id=v_vid;
  UPDATE ventas SET status='entregado' WHERE id=v_vid;
  out := out || jsonb_build_object('paso','7 idempotencia x2 (esp A -3, B -4)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a,'deltaB',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb)-ini_b);

  DELETE FROM venta_lineas WHERE id=v_lid;
  out := out || jsonb_build_object('paso','8 borrar linea B (esp B 0)','deltaB',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb)-ini_b);

  UPDATE ventas SET status='cancelado' WHERE id=v_vid;
  out := out || jsonb_build_object('paso','9 cancelar (esp 0,0)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a,'deltaB',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb)-ini_b);

  out := out || jsonb_build_object(
    'paso','movimientos',
    'movs',(SELECT jsonb_agg(jsonb_build_object('t',tipo,'ref',referencia_tipo,'cant',cantidad) ORDER BY created_at)
              FROM movimientos_inventario WHERE referencia_id=v_vid),
    'historial_ajustes',(SELECT count(*) FROM venta_historial WHERE venta_id=v_vid AND accion='inventario_ajustado'),
    'saldo_venta',(SELECT jsonb_build_object('total',total,'saldo',saldo_pendiente) FROM ventas WHERE id=v_vid));

  DELETE FROM venta_lineas WHERE venta_id=v_vid;
  DELETE FROM movimientos_inventario WHERE referencia_id=v_vid;
  DELETE FROM venta_historial WHERE venta_id=v_vid;
  DELETE FROM ventas WHERE id=v_vid;

  out := out || jsonb_build_object('paso','10 limpieza (esp 0,0)','deltaA',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pa)-ini_a,'deltaB',
    (SELECT cantidad FROM stock_almacen WHERE almacen_id=v_alm AND producto_id=v_pb)-ini_b);
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.__test_sync_venta_edicion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.__test_sync_venta_edicion() TO service_role, sandbox_exec;