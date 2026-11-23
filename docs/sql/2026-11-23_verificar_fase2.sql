-- Verificación de la migración 20261123030000_fase2_no_perder_ventas.sql (fase 2 «NO PERDER VENTAS»).
-- Correr DESPUÉS de aplicarla. Es UN solo bloque DO que termina con RAISE EXCEPTION: todo lo
-- que crea (carga de prueba, ventas, cobros, inventario) se deshace al final.
--
-- Usa datos existentes: un usuario activo (no super admin) de una empresa A con cliente y
-- producto, y una empresa B distinta con cliente y producto. Simula a cada usuario como
-- PostgREST (request.jwt.claims + SET LOCAL ROLE authenticated).
--
-- Lee los NOTICE: una línea por prueba «ok | fallo · prueba · esperado → obtenido». La última
-- línea (ERROR) es el resumen: «FIN verificación fase 2: N ok, M fallas (todo se deshizo)».
--
-- psql: psql "$DB_URL" -f docs/sql/2026-11-23_verificar_fase2.sql

DO $v$
DECLARE
  ua uuid; ea uuid; pa uuid; alm uuid;   -- usuario, empresa, perfil y almacén de A
  ub uuid; eb uuid;                      -- usuario y empresa B
  ca uuid; cb uuid;                      -- clientes
  prod uuid; prodb uuid;                 -- productos
  carga_a uuid; cl_a uuid; carga_b uuid; -- carga de prueba de A (y de B)
  v1 uuid := gen_random_uuid();
  v2 uuid := gen_random_uuid();
  v4 uuid := gen_random_uuid();
  hoy date := current_date;
  p1 jsonb; p2 jsonb; p4 jsonb;
  res jsonb;
  stock0 numeric; stock1 numeric; vend0 numeric; carg0 numeric; dev0 numeric;
  n_ok int := 0; n_fail int := 0;
  cas record;
  estado text; det text;
  n int; x numeric;
BEGIN
  -- ── Datos ────────────────────────────────────────────────────────────────────────
  SELECT p.user_id, p.empresa_id, p.id, p.almacen_id INTO ua, ea, pa, alm
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL AND p.empresa_id IS NOT NULL AND p.estado = 'activo' AND p.archivado_en IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = p.user_id)
    AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.empresa_id = p.empresa_id)
    AND EXISTS (SELECT 1 FROM public.productos pr WHERE pr.empresa_id = p.empresa_id)
    AND EXISTS (SELECT 1 FROM public.almacenes a WHERE a.empresa_id = p.empresa_id)
  ORDER BY p.created_at
  LIMIT 1;
  SELECT p.user_id, p.empresa_id INTO ub, eb
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL AND p.empresa_id IS DISTINCT FROM ea AND p.estado = 'activo' AND p.archivado_en IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = p.user_id)
    AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.empresa_id = p.empresa_id)
    AND EXISTS (SELECT 1 FROM public.productos pr WHERE pr.empresa_id = p.empresa_id)
  ORDER BY p.created_at
  LIMIT 1;
  IF ua IS NULL OR ub IS NULL THEN
    RAISE EXCEPTION 'FIN verificación fase 2: sin datos (se necesitan 2 empresas con usuario activo, cliente y producto)';
  END IF;
  IF alm IS NULL THEN
    SELECT id INTO alm FROM public.almacenes WHERE empresa_id = ea ORDER BY created_at LIMIT 1;
  END IF;
  SELECT id INTO ca FROM public.clientes WHERE empresa_id = ea ORDER BY created_at LIMIT 1;
  SELECT id INTO cb FROM public.clientes WHERE empresa_id = eb ORDER BY created_at LIMIT 1;
  SELECT id INTO prod FROM public.productos WHERE empresa_id = ea
    ORDER BY (COALESCE(maneja_lote, false)) ASC, (COALESCE(es_combo, false)) ASC, created_at LIMIT 1;
  SELECT id INTO prodb FROM public.productos WHERE empresa_id = eb ORDER BY created_at LIMIT 1;

  -- Carga de prueba (en ruta) con 10 piezas del producto; existencia +20 en el almacén.
  INSERT INTO public.cargas (empresa_id, vendedor_id, status, almacen_id, notas)
  VALUES (ea, pa, 'en_ruta', alm, 'verificación fase 2') RETURNING id INTO carga_a;
  INSERT INTO public.carga_lineas (carga_id, producto_id, cantidad_cargada) VALUES (carga_a, prod, 10) RETURNING id INTO cl_a;
  INSERT INTO public.cargas (empresa_id, status, notas) VALUES (eb, 'en_ruta', 'verificación fase 2') RETURNING id INTO carga_b;
  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (ea, alm, prod, 20)
  ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad = public.stock_almacen.cantidad + 20;
  SELECT cantidad INTO stock0 FROM public.stock_almacen WHERE almacen_id = alm AND producto_id = prod;
  SELECT cantidad_vendida, cantidad_cargada, cantidad_devuelta INTO vend0, carg0, dev0 FROM public.carga_lineas WHERE id = cl_a;

  -- Venta 1: 3 piezas a $10 (subtotal 30, sin impuestos), contado, cobro de 30, con carga.
  p1 := jsonb_build_object(
    'venta', jsonb_build_object('id', v1, 'empresa_id', ea, 'cliente_id', ca, 'tipo', 'venta_directa',
      'vendedor_id', pa, 'condicion_pago', 'contado', 'entrega_inmediata', true, 'status', 'confirmado',
      'almacen_id', alm, 'subtotal', 30, 'iva_total', 0, 'ieps_total', 0, 'descuento_total', 0,
      'total', 30, 'saldo_pendiente', 30, 'fecha', hoy),
    'lineas', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'producto_id', prod, 'descripcion', 'verif',
      'cantidad', 3, 'precio_unitario', 10, 'subtotal', 30, 'iva_pct', 0, 'iva_monto', 0, 'ieps_pct', 0, 'ieps_monto', 0,
      'descuento_pct', 0, 'total', 30)),
    'lineas_lotes', '[]'::jsonb, 'promociones', '[]'::jsonb,
    'cobros', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cliente_id', ca, 'monto', 30,
      'metodo_pago', 'efectivo', 'fecha', hoy,
      'aplicaciones', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'venta_id', v1, 'monto_aplicado', 30)))),
    'carga', jsonb_build_object('carga_id', carga_a, 'lineas', jsonb_build_array(jsonb_build_object('producto_id', prod, 'cantidad', 3))));
  -- Venta 2: 2 piezas, crédito, sin cobro ni carga (la carga va por la RPC aparte, camino actual).
  p2 := jsonb_set(jsonb_set(jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(v2)), '{venta,condicion_pago}', '"credito"'),
          '{cobros}', '[]'::jsonb), '{carga}', 'null'::jsonb);
  p2 := jsonb_set(p2, '{lineas}', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'producto_id', prod,
          'descripcion', 'verif', 'cantidad', 2, 'precio_unitario', 10, 'subtotal', 20, 'iva_pct', 0, 'iva_monto', 0,
          'ieps_pct', 0, 'ieps_monto', 0, 'descuento_pct', 0, 'total', 20)));
  p2 := jsonb_set(jsonb_set(p2, '{venta,total}', '20'), '{venta,subtotal}', '20');
  -- Venta 4: contado 30 + abono de 25 a la venta 2 (que solo debe 20): el abono excede, la
  -- venta 4 debe guardarse igual y el abono quedar en «aplicaciones_rechazadas».
  p4 := jsonb_set(jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(v4)), '{carga}', 'null'::jsonb),
          '{cobros}', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cliente_id', ca, 'monto', 55,
            'metodo_pago', 'efectivo', 'fecha', hoy, 'aplicaciones', jsonb_build_array(
              jsonb_build_object('id', gen_random_uuid(), 'venta_id', v4, 'monto_aplicado', 30),
              jsonb_build_object('id', gen_random_uuid(), 'venta_id', v2, 'monto_aplicado', 25)))));
  p4 := jsonb_set(p4, '{lineas,0,id}', to_jsonb(gen_random_uuid()));

  -- ── Casos que se ejecutan como un usuario (prueba, uid, rol, sql, esperado) ──────────
  FOR cas IN
    SELECT * FROM (VALUES
      (1,  'venta nueva (A)',                         ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', p1), 'OK'),
      (2,  'venta repetida (A) no duplica',           ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', p1), 'OK'),
      (3,  'venta 2 crédito (A)',                     ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', p2), 'OK'),
      (4,  'carga por delta venta 2 (A)',             ua, 'authenticated', format('SELECT public.fn_ruta_carga_sumar_vendido(%L, %L, %L::jsonb)', v2, carga_a, jsonb_build_array(jsonb_build_object('producto_id', prod, 'cantidad', 2))), 'OK'),
      (5,  'carga venta 2 repetida (A) no suma',      ua, 'authenticated', format('SELECT public.fn_ruta_carga_sumar_vendido(%L, %L, %L::jsonb)', v2, carga_a, jsonb_build_array(jsonb_build_object('producto_id', prod, 'cantidad', 2))), 'OK'),
      (6,  'A registra venta en empresa B',           ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(gen_random_uuid())), '{venta,empresa_id}', to_jsonb(eb))), '42501'),
      (7,  'A vende a cliente de B',                  ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', jsonb_set(jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(gen_random_uuid())), '{venta,cliente_id}', to_jsonb(cb)), '{cobros}', '[]')), '42501'),
      (8,  'A vende producto de B',                   ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', jsonb_set(jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(gen_random_uuid())), '{lineas,0,producto_id}', to_jsonb(prodb)), '{cobros}', '[]')), '42501'),
      (9,  'A suma a carga de B',                     ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', jsonb_set(jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(gen_random_uuid())), '{carga,carga_id}', to_jsonb(carga_b)), '{cobros}', '[]')), '42501'),
      (10, 'B reenvía venta 1 de A',                  ub, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', p1), '42501'),
      (11, 'B suma a carga de A',                     ub, 'authenticated', format('SELECT public.fn_ruta_carga_sumar_vendido(%L, %L, %L::jsonb)', v1, carga_a, jsonb_build_array(jsonb_build_object('producto_id', prod, 'cantidad', 99))), '42501'),
      (12, 'anon no puede',                           NULL::uuid, 'anon', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', p1), '42501'),
      (13, 'abono a venta que aún no sube → espera',  ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(gen_random_uuid())), '{cobros,0,aplicaciones,0,venta_id}', to_jsonb(gen_random_uuid()))), '23503'),
      (14, 'carga de venta que aún no sube → espera', ua, 'authenticated', format('SELECT public.fn_ruta_carga_sumar_vendido(%L, %L, %L::jsonb)', gen_random_uuid(), carga_a, jsonb_build_array(jsonb_build_object('producto_id', prod, 'cantidad', 1))), '23503'),
      (15, 'venta sin renglones',                     ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', jsonb_set(jsonb_set(p1, '{venta,id}', to_jsonb(gen_random_uuid())), '{lineas}', '[]')), '22023'),
      (16, 'A no puede llamar helpers internos',      ua, 'authenticated', format('SELECT public._ruta_carga_sumar_vendido(%L, %L, %L, %L::jsonb)', ea, v1, carga_a, '[]'), '42501'),
      (17, 'abono que excede saldo de otra nota: la venta se guarda', ua, 'authenticated', format('SELECT public.fn_ruta_registrar_venta(%L::jsonb)', p4), 'OK'),
      (18, 'A registra un descarte de su empresa',    ua, 'authenticated', format($q$INSERT INTO public.sync_descartes (id, empresa_id, user_id, tabla, operacion, motivo, descartado_at) VALUES (gen_random_uuid(), %L, %L, 'ventas', 'insert', 'verificación', now()) RETURNING jsonb_build_object('id', id)$q$, ea, ua), 'OK'),
      (19, 'A registra un descarte en empresa B',     ua, 'authenticated', format($q$INSERT INTO public.sync_descartes (id, empresa_id, user_id, tabla, operacion, motivo, descartado_at) VALUES (gen_random_uuid(), %L, %L, 'ventas', 'insert', 'verificación', now())$q$, eb, ua), '42501'),
      (20, 'A no puede borrar descartes',             ua, 'authenticated', 'DELETE FROM public.sync_descartes RETURNING jsonb_build_object(''id'', id)', '42501'),
      (21, 'A no escribe la bitácora de carga directo', ua, 'authenticated', format($q$UPDATE public.carga_vendido_ventas SET cantidad = 999 WHERE carga_id = %L RETURNING jsonb_build_object('id', id)$q$, carga_a), '42501')
    ) t(n, prueba, uid, rol, q, esperado)
    ORDER BY n
  LOOP
    estado := 'OK'; det := NULL; res := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims',
        CASE WHEN cas.uid IS NULL THEN json_build_object('role', cas.rol)::text
             ELSE json_build_object('sub', cas.uid, 'role', cas.rol)::text END, true);
      PERFORM set_config('request.jwt.claim.sub', COALESCE(cas.uid::text, ''), true);
      PERFORM set_config('request.jwt.claim.role', cas.rol, true);
      EXECUTE format('SET LOCAL ROLE %I', cas.rol);
      EXECUTE cas.q INTO res;
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN
      estado := SQLSTATE; det := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
    IF cas.n = 2 AND estado = 'OK' AND COALESCE((res->>'duplicada')::boolean, false) IS NOT TRUE THEN
      estado := 'OK pero duplicada=false';
    END IF;
    IF cas.n = 17 AND estado = 'OK' AND COALESCE(jsonb_array_length(res->'aplicaciones_rechazadas'), 0) <> 1 THEN
      estado := 'OK pero sin abono rechazado';
    END IF;
    IF estado = cas.esperado THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
    RAISE NOTICE '% · %. % · esperado % → obtenido % %', CASE WHEN estado = cas.esperado THEN 'ok   ' ELSE 'FALLO' END,
      cas.n, cas.prueba, cas.esperado, estado, COALESCE(' (' || det || ')', '');
  END LOOP;

  -- ── Comprobaciones de datos (como administrador de la BD) ─────────────────────────
  -- Venta 1 una sola vez, con 1 renglón, 1 cobro, saldo 0.
  SELECT count(*) INTO n FROM public.ventas WHERE id = v1;
  IF n = 1 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · venta 1 existe una vez · esperado 1 → %', CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLO' END, n;
  SELECT count(*) INTO n FROM public.venta_lineas WHERE venta_id = v1;
  IF n = 1 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · renglones de venta 1 sin duplicar · esperado 1 → %', CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLO' END, n;
  SELECT count(*) INTO n FROM public.cobro_aplicaciones WHERE venta_id = v1;
  IF n = 1 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · cobro de venta 1 sin duplicar · esperado 1 → %', CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLO' END, n;
  SELECT saldo_pendiente INTO x FROM public.ventas WHERE id = v1;
  IF x = 0 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · saldo venta 1 pagada · esperado 0 → %', CASE WHEN x = 0 THEN 'ok   ' ELSE 'FALLO' END, x;
  SELECT user_id::text INTO det FROM public.cobros c JOIN public.cobro_aplicaciones ap ON ap.cobro_id = c.id WHERE ap.venta_id = v1 LIMIT 1;
  IF det = ua::text THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · cobro a nombre de la sesión · esperado % → %', CASE WHEN det = ua::text THEN 'ok   ' ELSE 'FALLO' END, ua, det;
  SELECT saldo_pendiente INTO x FROM public.ventas WHERE id = v4;
  IF x = 0 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · venta 4 pagada aunque su abono a otra nota se rechazó · esperado 0 → %', CASE WHEN x = 0 THEN 'ok   ' ELSE 'FALLO' END, x;
  SELECT saldo_pendiente INTO x FROM public.ventas WHERE id = v2;
  IF x = 20 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · saldo venta 2 crédito · esperado 20 → %', CASE WHEN x = 20 THEN 'ok   ' ELSE 'FALLO' END, x;
  -- Inventario por delta (fn_sync_venta_inventario): salen 3 + 2, una sola vez.
  SELECT COALESCE(sum(CASE WHEN tipo = 'salida' THEN -cantidad ELSE cantidad END), 0) INTO x
  FROM public.movimientos_inventario WHERE referencia_id IN (v1, v2) AND producto_id = prod;
  -- (la venta 4 no cuenta aquí: se revisa la existencia total abajo con -8)
  IF x = -5 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · movimientos de inventario ventas 1+2 · esperado -5 → %', CASE WHEN x = -5 THEN 'ok   ' ELSE 'FALLO' END, x;
  SELECT cantidad INTO stock1 FROM public.stock_almacen WHERE almacen_id = alm AND producto_id = prod;
  IF stock1 = stock0 - 8 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · existencia del almacén (ventas 1, 2 y 4) · esperado % → %', CASE WHEN stock1 = stock0 - 8 THEN 'ok   ' ELSE 'FALLO' END, stock0 - 8, stock1;

  -- Carga: recarga del admin y devolución DESPUÉS de las ventas no se pisan.
  UPDATE public.carga_lineas SET cantidad_cargada = cantidad_cargada + 5, cantidad_devuelta = cantidad_devuelta + 1 WHERE id = cl_a;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', ua::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    -- reenvío tardío de la misma venta 1 (cola vieja): no debe volver a sumar ni pisar la recarga
    PERFORM public.fn_ruta_registrar_venta(p1);
    PERFORM public.fn_ruta_carga_sumar_vendido(v1, carga_a, jsonb_build_array(jsonb_build_object('producto_id', prod, 'cantidad', 3)));
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    n_fail := n_fail + 1;
    RAISE NOTICE 'FALLO · reenvío tardío · %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  SELECT cantidad_vendida INTO x FROM public.carga_lineas WHERE id = cl_a;
  IF x = vend0 + 5 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · carga vendida por delta (3 + 2, reenvíos no suman) · esperado % → %', CASE WHEN x = vend0 + 5 THEN 'ok   ' ELSE 'FALLO' END, vend0 + 5, x;
  SELECT cantidad_cargada INTO x FROM public.carga_lineas WHERE id = cl_a;
  IF x = carg0 + 5 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · recarga del admin se conserva · esperado % → %', CASE WHEN x = carg0 + 5 THEN 'ok   ' ELSE 'FALLO' END, carg0 + 5, x;
  SELECT cantidad_devuelta INTO x FROM public.carga_lineas WHERE id = cl_a;
  IF x = dev0 + 1 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · devuelto del servidor se conserva · esperado % → %', CASE WHEN x = dev0 + 1 THEN 'ok   ' ELSE 'FALLO' END, dev0 + 1, x;
  SELECT count(*) INTO n FROM public.carga_vendido_ventas WHERE carga_id = carga_a;
  IF n = 2 THEN n_ok := n_ok + 1; ELSE n_fail := n_fail + 1; END IF;
  RAISE NOTICE '% · bitácora de carga (venta 1 y 2) · esperado 2 → %', CASE WHEN n = 2 THEN 'ok   ' ELSE 'FALLO' END, n;

  RAISE EXCEPTION 'FIN verificación fase 2: % ok, % fallas (todo se deshizo)', n_ok, n_fail;
END
$v$;
