-- D-063 · Verificar editar_venta (fecha de entrega y almacén editables) SIN dejar nada en la BD.
-- Crea, dentro de UNA transacción, almacenes, productos, lotes, cliente y ventas de prueba en la empresa
-- que el sistema asigna a su dueño (get_my_empresa_id) y usa una segunda empresa para «otra empresa»;
-- ejecuta los casos y termina SIEMPRE con RAISE EXCEPTION: todo se deshace (no toca ventas reales;
-- folios, stock, kardex e historial vuelven a como estaban). Correr completo en el SQL editor con un
-- rol que pueda fijar request.jwt.claims (postgres). Resultado esperado: «D-063 OK (n/n): …».
-- Los datos de prueba se crean SIN sesión; la sesión del dueño se simula solo para llamar la RPC.
DO $verificar$
DECLARE
  v_a uuid; v_owner_a uuid; v_b uuid; v_owner_b uuid;
  v_a1 uuid; v_a2 uuid; v_inact uuid; v_alm_b uuid; v_prod uuid; v_plote uuid; v_pfefo uuid; v_cli uuid;
  v_lote uuid; v_lote_solo1 uuid; v_fa uuid; v_fb uuid;
  v_vd uuid; v_vl uuid; v_vl2 uuid; v_vf uuid; v_ped uuid; v_ped2 uuid;
  v_s1 numeric; v_s2 numeric; v_l1 numeric; v_l2 numeric; v_movs int; v_movs2 int; v_neto numeric;
  v_msg text; v_ok int := 0; v_total int := 0; v_log text := '';
BEGIN
  -- Empresa A = la de get_my_empresa_id() de su dueño; empresa B = otra con dueño.
  FOR v_owner_a IN SELECT e.owner_user_id FROM public.empresas e WHERE e.owner_user_id IS NOT NULL
                    AND NOT public.is_super_admin(e.owner_user_id) ORDER BY e.created_at LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
    v_a := public.get_my_empresa_id();
    EXIT WHEN v_a IS NOT NULL;
  END LOOP;
  FOR v_owner_b IN SELECT e.owner_user_id FROM public.empresas e WHERE e.owner_user_id IS NOT NULL
                    AND NOT public.is_super_admin(e.owner_user_id) AND e.owner_user_id <> v_owner_a ORDER BY e.created_at LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
    v_b := public.get_my_empresa_id();
    EXIT WHEN v_b IS NOT NULL AND v_b <> v_a;
  END LOOP;
  IF v_a IS NULL OR v_b IS NULL OR v_a = v_b THEN RAISE EXCEPTION 'D-063: se necesitan dos empresas con dueño'; END IF;

  -- Datos de prueba sin sesión.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.almacenes(empresa_id, nombre) VALUES (v_a, 'ZZ D-063 uno') RETURNING id INTO v_a1;
  INSERT INTO public.almacenes(empresa_id, nombre) VALUES (v_a, 'ZZ D-063 dos') RETURNING id INTO v_a2;
  INSERT INTO public.almacenes(empresa_id, nombre, activo) VALUES (v_a, 'ZZ D-063 inactivo', false) RETURNING id INTO v_inact;
  INSERT INTO public.almacenes(empresa_id, nombre) VALUES (v_b, 'ZZ D-063 otra empresa') RETURNING id INTO v_alm_b;
  INSERT INTO public.productos(empresa_id, nombre, codigo) VALUES (v_a, 'ZZ D-063 producto', 'ZZD063') RETURNING id INTO v_prod;
  INSERT INTO public.productos(empresa_id, nombre, codigo, maneja_lote) VALUES (v_a, 'ZZ D-063 con lote', 'ZZD063L', true) RETURNING id INTO v_plote;
  INSERT INTO public.clientes(empresa_id, nombre) VALUES (v_a, 'ZZ D-063 cliente') RETURNING id INTO v_cli;
  INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
  VALUES (v_a, v_a1, v_prod, 10), (v_a, v_a2, v_prod, 10), (v_a, v_a1, v_plote, 10), (v_a, v_a2, v_plote, 5);
  INSERT INTO public.lotes(empresa_id, producto_id, codigo) VALUES (v_a, v_plote, 'ZZL1') RETURNING id INTO v_lote;
  INSERT INTO public.lotes(empresa_id, producto_id, codigo) VALUES (v_a, v_plote, 'ZZL2') RETURNING id INTO v_lote_solo1;
  INSERT INTO public.stock_lotes(empresa_id, almacen_id, producto_id, lote_id, cantidad)
  VALUES (v_a, v_a1, v_plote, v_lote, 5), (v_a, v_a2, v_plote, v_lote, 5), (v_a, v_a1, v_plote, v_lote_solo1, 5);
  -- Producto con lote vendido SIN lote elegido (FEFO): lote FA solo en «uno», FB solo en «dos».
  INSERT INTO public.productos(empresa_id, nombre, codigo, maneja_lote) VALUES (v_a, 'ZZ D-063 FEFO', 'ZZD063F', true) RETURNING id INTO v_pfefo;
  INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad) VALUES (v_a, v_a1, v_pfefo, 5), (v_a, v_a2, v_pfefo, 5);
  INSERT INTO public.lotes(empresa_id, producto_id, codigo) VALUES (v_a, v_pfefo, 'ZZFA') RETURNING id INTO v_fa;
  INSERT INTO public.lotes(empresa_id, producto_id, codigo) VALUES (v_a, v_pfefo, 'ZZFB') RETURNING id INTO v_fb;
  INSERT INTO public.stock_lotes(empresa_id, almacen_id, producto_id, lote_id, cantidad)
  VALUES (v_a, v_a1, v_pfefo, v_fa, 5), (v_a, v_a2, v_pfefo, v_fb, 5);

  -- Venta directa con entrega inmediata (aplica inventario): 3 piezas desde «uno».
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id, entrega_inmediata, condicion_pago)
  VALUES (v_a, 'venta_directa', 'confirmado', v_cli, v_a1, true, 'credito') RETURNING id INTO v_vd;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total, almacen_id)
  VALUES (v_vd, v_a, v_prod, 3, 100, 300, 300, v_a1);
  -- Venta directa con lote ZZL1 (existe en ambos almacenes): 2 piezas desde «uno».
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id, entrega_inmediata, condicion_pago)
  VALUES (v_a, 'venta_directa', 'confirmado', v_cli, v_a1, true, 'credito') RETURNING id INTO v_vl;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total, almacen_id, lote_id)
  VALUES (v_vl, v_a, v_plote, 2, 100, 200, 200, v_a1, v_lote);
  -- Venta directa con lote ZZL2 (solo en «uno»).
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id, entrega_inmediata, condicion_pago)
  VALUES (v_a, 'venta_directa', 'confirmado', v_cli, v_a1, true, 'credito') RETURNING id INTO v_vl2;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total, almacen_id, lote_id)
  VALUES (v_vl2, v_a, v_plote, 1, 100, 100, 100, v_a1, v_lote_solo1);
  -- Venta directa FEFO: 2 piezas desde «uno» (salen del lote FA).
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id, entrega_inmediata, condicion_pago)
  VALUES (v_a, 'venta_directa', 'confirmado', v_cli, v_a1, true, 'credito') RETURNING id INTO v_vf;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total, almacen_id)
  VALUES (v_vf, v_a, v_pfefo, 2, 100, 200, 200, v_a1);
  -- Pedido confirmado sin entregas (no aplica inventario) y pedido con entrega activa.
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id, fecha_entrega, condicion_pago)
  VALUES (v_a, 'pedido', 'confirmado', v_cli, v_a1, DATE '2026-12-01', 'credito') RETURNING id INTO v_ped;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total, almacen_id)
  VALUES (v_ped, v_a, v_prod, 4, 100, 400, 400, v_a1);
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id, fecha_entrega, condicion_pago)
  VALUES (v_a, 'pedido', 'confirmado', v_cli, v_a1, DATE '2026-12-01', 'credito') RETURNING id INTO v_ped2;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total, almacen_id)
  VALUES (v_ped2, v_a, v_prod, 1, 100, 100, 100, v_a1);
  INSERT INTO public.entregas(empresa_id, pedido_id, cliente_id, almacen_id, status) VALUES (v_a, v_ped2, v_cli, v_a1, 'borrador');
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;  -- aplica el inventario de las ventas directas

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  -- Caso 1: fecha de entrega del pedido cambia; vacía no la borra.
  v_total := v_total + 1;
  PERFORM public.editar_venta(v_ped, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped),
                              NULL, jsonb_build_object('fecha_entrega', '2026-12-15'), NULL);
  PERFORM public.editar_venta(v_ped, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped),
                              NULL, jsonb_build_object('fecha_entrega', ''), NULL);
  IF (SELECT fecha_entrega FROM public.ventas WHERE id = v_ped) = DATE '2026-12-15'
     AND (SELECT count(*) FROM public.venta_historial WHERE venta_id = v_ped AND accion = 'fecha_entrega_cambiada') = 1 THEN
    v_ok := v_ok + 1; v_log := v_log || '1 fecha entrega ✓ ';
  ELSE v_log := v_log || format('1 fecha entrega ✗ (%s) ', (SELECT fecha_entrega FROM public.ventas WHERE id = v_ped)); END IF;

  -- Caso 2: cambiar almacén de venta aplicada: regresa 3 a «uno» y salen 3 de «dos».
  v_total := v_total + 1;
  PERFORM public.editar_venta(v_vd, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_vd),
                              NULL, jsonb_build_object('almacen_id', v_a2), NULL);
  SELECT cantidad INTO v_s1 FROM public.stock_almacen WHERE almacen_id = v_a1 AND producto_id = v_prod;
  SELECT cantidad INTO v_s2 FROM public.stock_almacen WHERE almacen_id = v_a2 AND producto_id = v_prod;
  SELECT count(*), SUM(CASE WHEN tipo::text = 'salida' THEN cantidad ELSE -cantidad END)
    INTO v_movs, v_neto FROM public.movimientos_inventario WHERE referencia_id = v_vd;
  IF v_s1 = 10 AND v_s2 = 7 AND v_neto = 3
     AND (SELECT almacen_id FROM public.ventas WHERE id = v_vd) = v_a2
     AND NOT EXISTS (SELECT 1 FROM public.venta_lineas WHERE venta_id = v_vd AND almacen_id IS DISTINCT FROM v_a2)
     AND (SELECT count(*) FROM public.venta_historial WHERE venta_id = v_vd AND accion = 'almacen_cambiado') = 1 THEN
    v_ok := v_ok + 1; v_log := v_log || '2 cambia almacén ✓ ';
  ELSE v_log := v_log || format('2 cambia almacén ✗ (uno %s, dos %s, neto %s) ', v_s1, v_s2, v_neto); END IF;

  -- Caso 3: repetir con el mismo almacén no mueve nada.
  v_total := v_total + 1;
  PERFORM public.editar_venta(v_vd, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_vd),
                              NULL, jsonb_build_object('almacen_id', v_a2), NULL);
  SELECT count(*) INTO v_movs2 FROM public.movimientos_inventario WHERE referencia_id = v_vd;
  SELECT cantidad INTO v_s1 FROM public.stock_almacen WHERE almacen_id = v_a1 AND producto_id = v_prod;
  SELECT cantidad INTO v_s2 FROM public.stock_almacen WHERE almacen_id = v_a2 AND producto_id = v_prod;
  IF v_movs2 = v_movs AND v_s1 = 10 AND v_s2 = 7 THEN
    v_ok := v_ok + 1; v_log := v_log || '3 repetir ✓ ';
  ELSE v_log := v_log || format('3 repetir ✗ (movs %s→%s, uno %s, dos %s) ', v_movs, v_movs2, v_s1, v_s2); END IF;

  -- Caso 4: regresar al almacén original deja todo como al inicio.
  v_total := v_total + 1;
  PERFORM public.editar_venta(v_vd, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_vd),
                              NULL, jsonb_build_object('almacen_id', v_a1), NULL);
  SELECT cantidad INTO v_s1 FROM public.stock_almacen WHERE almacen_id = v_a1 AND producto_id = v_prod;
  SELECT cantidad INTO v_s2 FROM public.stock_almacen WHERE almacen_id = v_a2 AND producto_id = v_prod;
  IF v_s1 = 7 AND v_s2 = 10 THEN
    v_ok := v_ok + 1; v_log := v_log || '4 ida y vuelta ✓ ';
  ELSE v_log := v_log || format('4 ida y vuelta ✗ (uno %s, dos %s) ', v_s1, v_s2); END IF;

  -- Caso 5: con lote que existe en el nuevo almacén: stock y stock por lote se mueven.
  v_total := v_total + 1;
  PERFORM public.editar_venta(v_vl, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_vl),
                              NULL, jsonb_build_object('almacen_id', v_a2), NULL);
  SELECT cantidad INTO v_s1 FROM public.stock_almacen WHERE almacen_id = v_a1 AND producto_id = v_plote;
  SELECT cantidad INTO v_s2 FROM public.stock_almacen WHERE almacen_id = v_a2 AND producto_id = v_plote;
  SELECT cantidad INTO v_l1 FROM public.stock_lotes WHERE almacen_id = v_a1 AND lote_id = v_lote;
  SELECT cantidad INTO v_l2 FROM public.stock_lotes WHERE almacen_id = v_a2 AND lote_id = v_lote;
  -- v_vl2 (lote ZZL2, 1 pieza) sigue en «uno»: stock_almacen «uno» = 10 − 1.
  IF v_s1 = 9 AND v_s2 = 3 AND v_l1 = 5 AND v_l2 = 3 THEN
    v_ok := v_ok + 1; v_log := v_log || '5 lote ✓ ';
  ELSE v_log := v_log || format('5 lote ✗ (uno %s, dos %s, lote uno %s, lote dos %s) ', v_s1, v_s2, v_l1, v_l2); END IF;

  -- Caso 6: lote sin existencia en el nuevo almacén → error claro y nada cambia.
  v_total := v_total + 1;
  BEGIN
    PERFORM public.editar_venta(v_vl2, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_vl2),
                                NULL, jsonb_build_object('almacen_id', v_a2), NULL);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  IF v_msg LIKE 'El lote ZZL2 de «ZZ D-063 con lote» no tiene existencia en el almacén «ZZ D-063 dos»%'
     AND (SELECT almacen_id FROM public.ventas WHERE id = v_vl2) = v_a1 THEN
    v_ok := v_ok + 1; v_log := v_log || '6 lote de otro almacén ✓ ';
  ELSE v_log := v_log || format('6 lote de otro almacén ✗ (%s) ', v_msg); END IF;

  -- Caso 7: pedido con entrega activa → no cambia almacén, pero sí la fecha de entrega.
  v_total := v_total + 1;
  BEGIN
    PERFORM public.editar_venta(v_ped2, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped2),
                                NULL, jsonb_build_object('almacen_id', v_a2), NULL);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  PERFORM public.editar_venta(v_ped2, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped2),
                              NULL, jsonb_build_object('fecha_entrega', '2026-12-20', 'almacen_id', v_a1), NULL);
  IF v_msg LIKE 'El pedido ya tiene entregas: el almacén no se puede cambiar%'
     AND (SELECT almacen_id FROM public.ventas WHERE id = v_ped2) = v_a1
     AND (SELECT fecha_entrega FROM public.ventas WHERE id = v_ped2) = DATE '2026-12-20' THEN
    v_ok := v_ok + 1; v_log := v_log || '7 con entregas ✓ ';
  ELSE v_log := v_log || format('7 con entregas ✗ (%s) ', v_msg); END IF;

  -- Caso 8: almacén de otra empresa → 42501.
  v_total := v_total + 1;
  BEGIN
    PERFORM public.editar_venta(v_ped, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped),
                                NULL, jsonb_build_object('almacen_id', v_alm_b), NULL);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  IF v_msg = '42501 El almacén no pertenece a esta empresa.' THEN
    v_ok := v_ok + 1; v_log := v_log || '8 almacén otra empresa ✓ ';
  ELSE v_log := v_log || format('8 almacén otra empresa ✗ (%s) ', v_msg); END IF;

  -- Caso 9: almacén inactivo → error.
  v_total := v_total + 1;
  BEGIN
    PERFORM public.editar_venta(v_ped, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped),
                                NULL, jsonb_build_object('almacen_id', v_inact), NULL);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  IF v_msg = 'El almacén «ZZ D-063 inactivo» está inactivo.' THEN
    v_ok := v_ok + 1; v_log := v_log || '9 inactivo ✓ ';
  ELSE v_log := v_log || format('9 inactivo ✗ (%s) ', v_msg); END IF;

  -- Caso 10: pedido sin entregas (no aplicado): cambia almacén y renglones, sin mover stock.
  v_total := v_total + 1;
  PERFORM public.editar_venta(v_ped, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped),
                              NULL, jsonb_build_object('almacen_id', v_a2), NULL);
  SELECT cantidad INTO v_s1 FROM public.stock_almacen WHERE almacen_id = v_a1 AND producto_id = v_prod;
  SELECT cantidad INTO v_s2 FROM public.stock_almacen WHERE almacen_id = v_a2 AND producto_id = v_prod;
  IF (SELECT almacen_id FROM public.ventas WHERE id = v_ped) = v_a2
     AND NOT EXISTS (SELECT 1 FROM public.venta_lineas WHERE venta_id = v_ped AND almacen_id IS DISTINCT FROM v_a2)
     AND NOT EXISTS (SELECT 1 FROM public.movimientos_inventario WHERE referencia_id = v_ped)
     AND v_s1 = 7 AND v_s2 = 10 THEN
    v_ok := v_ok + 1; v_log := v_log || '10 pedido sin aplicar ✓ ';
  ELSE v_log := v_log || format('10 pedido sin aplicar ✗ (uno %s, dos %s) ', v_s1, v_s2); END IF;

  -- Caso 11: FEFO: regresa al lote FA de «uno» y sale del lote FB de «dos».
  v_total := v_total + 1;
  PERFORM public.editar_venta(v_vf, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_vf),
                              NULL, jsonb_build_object('almacen_id', v_a2), NULL);
  SELECT cantidad INTO v_s1 FROM public.stock_almacen WHERE almacen_id = v_a1 AND producto_id = v_pfefo;
  SELECT cantidad INTO v_s2 FROM public.stock_almacen WHERE almacen_id = v_a2 AND producto_id = v_pfefo;
  SELECT cantidad INTO v_l1 FROM public.stock_lotes WHERE almacen_id = v_a1 AND lote_id = v_fa;
  SELECT cantidad INTO v_l2 FROM public.stock_lotes WHERE almacen_id = v_a2 AND lote_id = v_fb;
  IF v_s1 = 5 AND v_s2 = 3 AND v_l1 = 5 AND v_l2 = 3 THEN
    v_ok := v_ok + 1; v_log := v_log || '11 FEFO ✓ ';
  ELSE v_log := v_log || format('11 FEFO ✗ (uno %s, dos %s, FA %s, FB %s) ', v_s1, v_s2, v_l1, v_l2); END IF;

  -- Caso 12: usuario de otra empresa → 42501.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.editar_venta(v_ped, (SELECT jsonb_agg(jsonb_build_object('id', id)) FROM public.venta_lineas WHERE venta_id = v_ped),
                                NULL, jsonb_build_object('almacen_id', v_a1), NULL);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  IF v_msg = '42501 Sin acceso a esta venta' THEN
    v_ok := v_ok + 1; v_log := v_log || '12 otra empresa ✓ ';
  ELSE v_log := v_log || format('12 otra empresa ✗ (%s) ', v_msg); END IF;

  -- Siempre deshace todo.
  RAISE EXCEPTION 'D-063 %(%/%): %', CASE WHEN v_ok = v_total THEN 'OK ' ELSE 'FALLA ' END, v_ok, v_total, v_log;
END
$verificar$;
