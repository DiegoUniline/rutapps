-- D-062 · Verificar fn_convertir_pedido_a_venta SIN dejar nada en la BD.
-- Crea, dentro de UNA transacción, un almacén, producto, cliente y pedidos de prueba en la empresa
-- más antigua que tenga dueño (y usa la segunda para «otra empresa»), ejecuta los casos y termina
-- SIEMPRE con RAISE EXCEPTION: todo se deshace (no toca pedidos reales; folios, stock e historial
-- vuelven a como estaban). Correr completo en el SQL editor con un rol que pueda fijar
-- request.jwt.claims (postgres). Resultado esperado: «D-062 OK (n/n): …».
-- (2026-11-23) Los datos de prueba se crean sin sesión: con sesión, next_folio/fn_assert_empresa exige
-- que la empresa sea la de get_my_empresa_id() del usuario simulado. Verificado en prod: 7/7.
DO $verificar$
DECLARE
  v_a uuid; v_owner_a uuid; v_b uuid; v_owner_b uuid; v_sin_permiso uuid;
  v_alm uuid; v_alm_b uuid; v_prod uuid; v_cli uuid;
  v_ped uuid; v_ped2 uuid; v_ped3 uuid; v_ped4 uuid;
  v_r jsonb; v_stock numeric; v_movs int; v_msg text; v_ok int := 0; v_total int := 0;
  v_log text := '';
BEGIN
  -- Empresa A = la que el sistema asigna a su dueño (get_my_empresa_id), para pasar fn_assert_empresa.
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
  IF v_a IS NULL OR v_b IS NULL OR v_a = v_b THEN RAISE EXCEPTION 'D-062: se necesitan dos empresas con dueño'; END IF;
  -- Datos de prueba sin sesión (conexión directa); la sesión se simula solo para llamar la función.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.almacenes(empresa_id, nombre) VALUES (v_a, 'ZZ D-062 prueba') RETURNING id INTO v_alm;
  INSERT INTO public.almacenes(empresa_id, nombre) VALUES (v_b, 'ZZ D-062 prueba B') RETURNING id INTO v_alm_b;
  INSERT INTO public.productos(empresa_id, nombre, codigo) VALUES (v_a, 'ZZ D-062 producto', 'ZZD062') RETURNING id INTO v_prod;
  INSERT INTO public.clientes(empresa_id, nombre) VALUES (v_a, 'ZZ D-062 cliente') RETURNING id INTO v_cli;
  INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad) VALUES (v_a, v_alm, v_prod, 10);

  -- Pedido 1: confirmado, sin entregas, 3 piezas a $100.
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id, condicion_pago)
  VALUES (v_a, 'pedido', 'confirmado', v_cli, v_alm, 'credito') RETURNING id INTO v_ped;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total)
  VALUES (v_ped, v_a, v_prod, 3, 100, 300, 300);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;

  -- Caso 1: convierte y descuenta exactamente una vez.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_total := v_total + 1;
  v_r := public.fn_convertir_pedido_a_venta(v_ped, v_alm);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;  -- dispara los triggers DEFERRED
  SELECT cantidad INTO v_stock FROM public.stock_almacen WHERE almacen_id = v_alm AND producto_id = v_prod;
  SELECT count(*) INTO v_movs FROM public.movimientos_inventario WHERE referencia_id = v_ped;
  IF v_stock = 7 AND v_movs = 1
     AND EXISTS (SELECT 1 FROM public.ventas WHERE id = v_ped AND tipo = 'venta_directa' AND status = 'confirmado'
                   AND entrega_inmediata AND almacen_id = v_alm AND saldo_pendiente = total AND total > 0)
     AND (SELECT count(*) FROM public.venta_historial WHERE venta_id = v_ped AND accion = 'convertido_a_venta_directa') = 1 THEN
    v_ok := v_ok + 1; v_log := v_log || '1 convierte ✓ ';
  ELSE v_log := v_log || format('1 convierte ✗ (stock %s, movs %s, r %s) ', v_stock, v_movs, v_r); END IF;

  -- Caso 2: repetir no duplica.
  v_total := v_total + 1;
  v_r := public.fn_convertir_pedido_a_venta(v_ped, v_alm);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  SELECT cantidad INTO v_stock FROM public.stock_almacen WHERE almacen_id = v_alm AND producto_id = v_prod;
  SELECT count(*) INTO v_movs FROM public.movimientos_inventario WHERE referencia_id = v_ped;
  IF v_stock = 7 AND v_movs = 1 AND (v_r->>'ya_convertido')::boolean THEN
    v_ok := v_ok + 1; v_log := v_log || '2 repetir ✓ ';
  ELSE v_log := v_log || format('2 repetir ✗ (stock %s, movs %s) ', v_stock, v_movs); END IF;

  -- Caso 3: pedido con entrega activa → error y nada cambia.
  v_total := v_total + 1;
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id)
  VALUES (v_a, 'pedido', 'confirmado', v_cli, v_alm) RETURNING id INTO v_ped2;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total)
  VALUES (v_ped2, v_a, v_prod, 2, 100, 200, 200);
  INSERT INTO public.entregas(empresa_id, pedido_id, cliente_id, almacen_id, status) VALUES (v_a, v_ped2, v_cli, v_alm, 'borrador');
  BEGIN
    PERFORM public.fn_convertir_pedido_a_venta(v_ped2, v_alm);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  IF v_msg LIKE 'Este pedido tiene entregas; termínalo desde Entregas%'
     AND EXISTS (SELECT 1 FROM public.ventas WHERE id = v_ped2 AND tipo = 'pedido') THEN
    v_ok := v_ok + 1; v_log := v_log || '3 con entregas ✓ ';
  ELSE v_log := v_log || format('3 con entregas ✗ (%s) ', v_msg); END IF;

  -- Caso 4: borrador con entrega CANCELADA → se confirma y descuenta.
  v_total := v_total + 1;
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id)
  VALUES (v_a, 'pedido', 'borrador', v_cli, NULL) RETURNING id INTO v_ped3;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total)
  VALUES (v_ped3, v_a, v_prod, 1, 100, 100, 100);
  INSERT INTO public.entregas(empresa_id, pedido_id, cliente_id, almacen_id, status) VALUES (v_a, v_ped3, v_cli, v_alm, 'cancelado');
  v_r := public.fn_convertir_pedido_a_venta(v_ped3, v_alm);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  SELECT cantidad INTO v_stock FROM public.stock_almacen WHERE almacen_id = v_alm AND producto_id = v_prod;
  IF v_stock = 6 AND v_r->>'status' = 'confirmado' THEN
    v_ok := v_ok + 1; v_log := v_log || '4 borrador ✓ ';
  ELSE v_log := v_log || format('4 borrador ✗ (stock %s, r %s) ', v_stock, v_r); END IF;

  -- Caso 5: almacén de otra empresa → error.
  v_total := v_total + 1;
  INSERT INTO public.ventas(empresa_id, tipo, status, cliente_id, almacen_id)
  VALUES (v_a, 'pedido', 'confirmado', v_cli, v_alm) RETURNING id INTO v_ped4;
  INSERT INTO public.venta_lineas(venta_id, empresa_id, producto_id, cantidad, precio_unitario, subtotal, total)
  VALUES (v_ped4, v_a, v_prod, 1, 100, 100, 100);
  BEGIN
    PERFORM public.fn_convertir_pedido_a_venta(v_ped4, v_alm_b);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  IF v_msg = 'El almacén no pertenece a la empresa' THEN
    v_ok := v_ok + 1; v_log := v_log || '5 almacén otra empresa ✓ ';
  ELSE v_log := v_log || format('5 almacén otra empresa ✗ (%s) ', v_msg); END IF;

  -- Caso 6: usuario de otra empresa → 42501.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.fn_convertir_pedido_a_venta(v_ped4, v_alm);
    v_msg := 'sin error';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  IF v_msg = '42501 Sin acceso a esa empresa' THEN
    v_ok := v_ok + 1; v_log := v_log || '6 otra empresa ✓ ';
  ELSE v_log := v_log || format('6 otra empresa ✗ (%s) ', v_msg); END IF;

  -- Caso 7 (si existe en A un usuario con roles y sin ventas·editar): sin permiso → 42501.
  SELECT p.user_id INTO v_sin_permiso FROM public.profiles p
   WHERE p.empresa_id = v_a AND p.user_id IS NOT NULL AND p.user_id <> v_owner_a
     AND NOT public.is_super_admin(p.user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.role_permisos rp ON rp.role_id = ur.role_id
                      WHERE ur.user_id = p.user_id AND rp.modulo = 'ventas' AND rp.accion = 'editar' AND rp.permitido)
   LIMIT 1;
  IF v_sin_permiso IS NOT NULL THEN
    v_total := v_total + 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sin_permiso, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.fn_convertir_pedido_a_venta(v_ped4, v_alm);
      v_msg := 'sin error';
    EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
    END;
    IF v_msg = '42501 No tienes permiso para convertir pedidos en venta' THEN
      v_ok := v_ok + 1; v_log := v_log || '7 sin permiso ✓ ';
    ELSE v_log := v_log || format('7 sin permiso ✗ (%s) ', v_msg); END IF;
  END IF;

  -- Siempre deshace todo.
  RAISE EXCEPTION 'D-062 %(%/%): %', CASE WHEN v_ok = v_total THEN 'OK ' ELSE 'FALLA ' END, v_ok, v_total, v_log;
END
$verificar$;
