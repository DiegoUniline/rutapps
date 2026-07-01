
DO $$
DECLARE
  eid uuid := '6d849e12-6437-4b24-917d-a89cc9b2fa88';
  alm uuid := 'ccc730a0-07a5-41ce-83ef-3eb8cccfd9f8';
  cli uuid := '40df6e5e-81cc-48a5-9b14-2b3def70691e';
  uid uuid := '387501a7-d172-4310-9e83-1a7f9fc37cac';
  prof uuid := 'f71fec41-33ac-409b-94b7-b30f502ef807';
  p1 uuid := 'ed76e778-f37a-4810-9bcf-08255acfe79d';
  p2 uuid := '262d61f0-ad54-4465-9536-0124c5c4f160';
  venta uuid; venta2 uuid; cobro uuid;
  s1 numeric; s2 numeric; saldo numeric; tot numeric;
BEGIN
  -- 1) Cargar stock inicial
  INSERT INTO stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
    VALUES (eid, alm, p1, 100), (eid, alm, p2, 50)
    ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad = EXCLUDED.cantidad;
  INSERT INTO ajustes_inventario(empresa_id,producto_id,almacen_id,cantidad_anterior,cantidad_nueva,diferencia,motivo,user_id)
    VALUES (eid,p1,alm,0,100,100,'TEST-VD carga',uid),(eid,p2,alm,0,50,50,'TEST-VD carga',uid);
  RAISE NOTICE 'STEP 1 -- Stock inicial cargado (p1=100, p2=50)';

  -- 2) VENTA DIRECTA (contado, entrega inmediata)
  INSERT INTO ventas(empresa_id, tipo, status, cliente_id, vendedor_id, almacen_id, condicion_pago, fecha, entrega_inmediata, notas)
    VALUES (eid,'venta_directa','borrador',cli,prof,alm,'contado',current_date,true,'TEST-VD contado')
    RETURNING id INTO venta;
  INSERT INTO venta_lineas(venta_id, producto_id, cantidad, precio_unitario)
    VALUES (venta, p1, 10, 25), (venta, p2, 5, 38);
  SELECT cantidad INTO s1 FROM stock_almacen WHERE almacen_id=alm AND producto_id=p1;
  SELECT cantidad INTO s2 FROM stock_almacen WHERE almacen_id=alm AND producto_id=p2;
  SELECT total, saldo_pendiente INTO tot, saldo FROM ventas WHERE id=venta;
  RAISE NOTICE 'STEP 2 -- Venta directa creada. Stock p1=% (esp 90), p2=% (esp 45). Total=%, Saldo=%', s1,s2,tot,saldo;
  IF s1<>90 OR s2<>45 THEN RAISE EXCEPTION 'FAIL descuento inmediato: p1=% p2=%', s1,s2; END IF;

  -- 3) Marcar entregado
  UPDATE ventas SET status='entregado' WHERE id=venta;
  SELECT cantidad INTO s1 FROM stock_almacen WHERE almacen_id=alm AND producto_id=p1;
  RAISE NOTICE 'STEP 3 -- Entregado sin doble descuento. Stock p1=% (esp 90)', s1;
  IF s1<>90 THEN RAISE EXCEPTION 'FAIL doble descuento al entregar'; END IF;

  -- 4) COBRO completo
  INSERT INTO cobros(empresa_id, cliente_id, monto, metodo_pago, fecha, user_id, notas)
    VALUES (eid, cli, tot, 'efectivo', current_date, uid, 'TEST-VD cobro')
    RETURNING id INTO cobro;
  INSERT INTO cobro_aplicaciones(cobro_id, venta_id, monto_aplicado) VALUES (cobro, venta, tot);
  SELECT saldo_pendiente INTO saldo FROM ventas WHERE id=venta;
  RAISE NOTICE 'STEP 4 -- Cobro aplicado. Saldo=% (esp 0)', saldo;
  IF saldo <> 0 THEN RAISE EXCEPTION 'FAIL saldo post cobro: %', saldo; END IF;

  -- 5) Cancelar cobro
  UPDATE cobros SET status='cancelado' WHERE id=cobro;
  SELECT saldo_pendiente INTO saldo FROM ventas WHERE id=venta;
  RAISE NOTICE 'STEP 5 -- Cobro cancelado. Saldo recalculado=% (esp %)', saldo, tot;
  IF saldo <> tot THEN RAISE EXCEPTION 'FAIL restore saldo tras cancelar cobro'; END IF;

  -- 6) Segunda venta directa para probar cancelación
  INSERT INTO ventas(empresa_id, tipo, status, cliente_id, vendedor_id, almacen_id, condicion_pago, fecha, entrega_inmediata, notas)
    VALUES (eid,'venta_directa','borrador',cli,prof,alm,'contado',current_date,true,'TEST-VD para cancelar')
    RETURNING id INTO venta2;
  INSERT INTO venta_lineas(venta_id, producto_id, cantidad, precio_unitario) VALUES (venta2, p1, 20, 25);
  SELECT cantidad INTO s1 FROM stock_almacen WHERE almacen_id=alm AND producto_id=p1;
  RAISE NOTICE 'STEP 6 -- Venta2 creada. Stock p1=% (esp 70)', s1;
  IF s1<>70 THEN RAISE EXCEPTION 'FAIL descuento venta2'; END IF;

  UPDATE ventas SET status='entregado' WHERE id=venta2;

  -- 7) Cancelar venta2 -> restaura stock
  UPDATE ventas SET status='cancelado' WHERE id=venta2;
  SELECT cantidad INTO s1 FROM stock_almacen WHERE almacen_id=alm AND producto_id=p1;
  RAISE NOTICE 'STEP 7 -- Venta2 cancelada. Stock p1=% (esp 90)', s1;
  IF s1<>90 THEN RAISE EXCEPTION 'FAIL restore stock cancelación venta2 (got %)', s1; END IF;

  -- 8) Stock insuficiente debe fallar
  BEGIN
    INSERT INTO ventas(empresa_id, tipo, status, cliente_id, vendedor_id, almacen_id, condicion_pago, fecha, entrega_inmediata, notas)
      VALUES (eid,'venta_directa','borrador',cli,prof,alm,'contado',current_date,true,'TEST-VD stock insuf')
      RETURNING id INTO venta2;
    INSERT INTO venta_lineas(venta_id, producto_id, cantidad, precio_unitario) VALUES (venta2, p2, 9999, 38);
    RAISE EXCEPTION 'FAIL: debió rechazar por stock insuficiente';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'STEP 8 -- Rechazo correcto de stock insuficiente: %', SQLERRM;
  END;

  -- 9) Cleanup
  UPDATE ventas SET status='cancelado' WHERE id IN (venta, venta2) AND status <> 'cancelado';
  DELETE FROM cobro_aplicaciones WHERE cobro_id=cobro;
  DELETE FROM cobros WHERE id=cobro;
  DELETE FROM venta_lineas WHERE venta_id IN (venta, venta2);
  DELETE FROM ventas WHERE id IN (venta, venta2);
  DELETE FROM stock_almacen WHERE almacen_id=alm AND producto_id IN (p1,p2);
  DELETE FROM ajustes_inventario WHERE motivo LIKE 'TEST-VD%';
  RAISE NOTICE 'STEP 9 -- Cleanup completo. Empresa Demo queda en cero como estaba.';

  RAISE NOTICE '==== TODAS LAS PRUEBAS DE VENTA DIRECTA PASARON ====';
END $$;
