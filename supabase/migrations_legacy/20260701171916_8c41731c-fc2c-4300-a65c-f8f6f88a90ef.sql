
DO $$
DECLARE
  v_empresa uuid := '6d849e12-6437-4b24-917d-a89cc9b2fa88';
  v_almacen uuid := 'ccc730a0-07a5-41ce-83ef-3eb8cccfd9f8';
  v_cliente uuid := '40df6e5e-81cc-48a5-9b14-2b3def70691e';
  v_user    uuid := 'f71fec41-33ac-409b-94b7-b30f502ef807';
  v_prod_a  uuid := 'e4de0d82-f323-467a-b84b-58e4202967a6';
  v_prod_b  uuid := '2b92f0a3-4c15-4f4a-b0a9-3d45db688b99';
  v_batch   uuid := gen_random_uuid();
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_cobro uuid;
  a numeric; b numeric; s numeric; t numeric;
BEGIN
  RAISE NOTICE '=== TEST VENTA DIRECTA - Mi Empresa Demo (permanente) ===';

  -- 1) Stock inicial
  INSERT INTO ajustes_inventario(empresa_id, producto_id, almacen_id, cantidad_anterior, cantidad_nueva, diferencia, motivo, user_id, fecha, batch_id)
  VALUES
    (v_empresa, v_prod_a, v_almacen, 0, 100, 100, 'Carga test venta directa', v_user, current_date, v_batch),
    (v_empresa, v_prod_b, v_almacen, 0,  50,  50, 'Carga test venta directa', v_user, current_date, v_batch);

  INSERT INTO stock_almacen(empresa_id, producto_id, almacen_id, cantidad)
  VALUES (v_empresa, v_prod_a, v_almacen, 100), (v_empresa, v_prod_b, v_almacen, 50)
  ON CONFLICT (producto_id, almacen_id) DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad;

  SELECT cantidad INTO a FROM stock_almacen WHERE producto_id=v_prod_a AND almacen_id=v_almacen;
  SELECT cantidad INTO b FROM stock_almacen WHERE producto_id=v_prod_b AND almacen_id=v_almacen;
  RAISE NOTICE '[1] Stock inicial: A=% B=%', a, b;

  -- 2) Venta directa #1 entrega inmediata
  INSERT INTO ventas(empresa_id, folio, tipo, status, cliente_id, vendedor_id, almacen_id, fecha, entrega_inmediata, subtotal, iva_total, total, saldo_pendiente, condicion_pago, origen)
  VALUES (v_empresa, 'TEST-VD-V01', 'venta_directa', 'borrador', v_cliente, v_user, v_almacen, now(), true, 0,0,0,0, 'credito', 'panel')
  RETURNING id INTO v_v1;

  INSERT INTO venta_lineas(venta_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, iva_pct, iva_monto, total, almacen_id)
  VALUES
    (v_v1, v_prod_a, 'Aceite 123 1L', 10, 45, 450, 16, 72, 522, v_almacen),
    (v_v1, v_prod_b, 'Aceite Capullo', 5, 30, 150, 16, 24, 174, v_almacen);

  UPDATE ventas SET subtotal=600, iva_total=96, total=696, saldo_pendiente=696, status='confirmado' WHERE id=v_v1;

  SELECT cantidad INTO a FROM stock_almacen WHERE producto_id=v_prod_a AND almacen_id=v_almacen;
  SELECT cantidad INTO b FROM stock_almacen WHERE producto_id=v_prod_b AND almacen_id=v_almacen;
  RAISE NOTICE '[2] V01 confirmada. Stock A=% (esp 90), B=% (esp 45)', a, b;

  UPDATE ventas SET status='entregado' WHERE id=v_v1;
  SELECT cantidad INTO a FROM stock_almacen WHERE producto_id=v_prod_a AND almacen_id=v_almacen;
  RAISE NOTICE '[3] V01 entregado. Stock A=% (esp 90 sin doble descuento)', a;

  -- 4) Cobro
  INSERT INTO cobros(empresa_id, cliente_id, monto, fecha, metodo_pago, user_id, notas, status)
  VALUES (v_empresa, v_cliente, 696, now(), 'efectivo', v_user, 'Test cobro V01', 'aplicado')
  RETURNING id INTO v_cobro;
  INSERT INTO cobro_aplicaciones(cobro_id, venta_id, monto_aplicado) VALUES (v_cobro, v_v1, 696);

  SELECT saldo_pendiente INTO s FROM ventas WHERE id=v_v1;
  RAISE NOTICE '[4] Cobro aplicado. Saldo V01=% (esp 0)', s;

  -- 5) Venta directa #2 -> cancelar
  INSERT INTO ventas(empresa_id, folio, tipo, status, cliente_id, vendedor_id, almacen_id, fecha, entrega_inmediata, subtotal, iva_total, total, saldo_pendiente, condicion_pago, origen)
  VALUES (v_empresa, 'TEST-VD-V02', 'venta_directa', 'borrador', v_cliente, v_user, v_almacen, now(), true, 0,0,0,0, 'contado', 'panel')
  RETURNING id INTO v_v2;

  INSERT INTO venta_lineas(venta_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, iva_pct, iva_monto, total, almacen_id)
  VALUES (v_v2, v_prod_a, 'Aceite 123 1L', 20, 45, 900, 16, 144, 1044, v_almacen);

  UPDATE ventas SET subtotal=900, iva_total=144, total=1044, saldo_pendiente=1044, status='confirmado' WHERE id=v_v2;
  SELECT cantidad INTO a FROM stock_almacen WHERE producto_id=v_prod_a AND almacen_id=v_almacen;
  RAISE NOTICE '[5a] V02 confirmada. Stock A=% (esp 70)', a;

  UPDATE ventas SET status='cancelado' WHERE id=v_v2;
  SELECT cantidad INTO a FROM stock_almacen WHERE producto_id=v_prod_a AND almacen_id=v_almacen;
  RAISE NOTICE '[5b] V02 cancelada. Stock A=% (esp 90 restaurado)', a;

  -- 6) Venta directa #3 contado con pago inmediato
  INSERT INTO ventas(empresa_id, folio, tipo, status, cliente_id, vendedor_id, almacen_id, fecha, entrega_inmediata, subtotal, iva_total, total, saldo_pendiente, condicion_pago, origen)
  VALUES (v_empresa, 'TEST-VD-V03', 'venta_directa', 'confirmado', v_cliente, v_user, v_almacen, now(), true, 0,0,0,0, 'contado', 'panel')
  RETURNING id INTO v_v3;

  INSERT INTO venta_lineas(venta_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, iva_pct, iva_monto, total, almacen_id)
  VALUES (v_v3, v_prod_b, 'Aceite Capullo', 10, 30, 300, 16, 48, 348, v_almacen);

  UPDATE ventas SET subtotal=300, iva_total=48, total=348, saldo_pendiente=348, status='entregado' WHERE id=v_v3;

  INSERT INTO cobros(empresa_id, cliente_id, monto, fecha, metodo_pago, user_id, status)
  VALUES (v_empresa, v_cliente, 348, now(), 'efectivo', v_user, 'aplicado')
  RETURNING id INTO v_cobro;
  INSERT INTO cobro_aplicaciones(cobro_id, venta_id, monto_aplicado) VALUES (v_cobro, v_v3, 348);

  SELECT cantidad INTO b FROM stock_almacen WHERE producto_id=v_prod_b AND almacen_id=v_almacen;
  SELECT saldo_pendiente INTO s FROM ventas WHERE id=v_v3;
  RAISE NOTICE '[6] V03 contado. Stock B=% (esp 35), Saldo=% (esp 0)', b, s;

  SELECT SUM(total) INTO t FROM ventas WHERE empresa_id=v_empresa AND folio LIKE 'TEST-VD-%' AND status <> 'cancelado';
  RAISE NOTICE '=== TOTAL vendido (activas): $% ===', t;
END $$;
