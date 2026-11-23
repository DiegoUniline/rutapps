-- Verificación de la migración 20261123020000_seguridad_fase1.sql (seguridad fase 1).
-- Correr DESPUÉS de aplicarla. Solo prueba: todo ocurre dentro de BEGIN … ROLLBACK
-- (los cobros/ventas de prueba que se crean desaparecen al final).
--
-- Usa datos existentes: elige una empresa A con un usuario (no super admin), una empresa B
-- distinta y un super admin sin empresa forzada. Simula cada usuario con
-- set_config('request.jwt.claims', …) + SET LOCAL ROLE authenticated, igual que PostgREST.
--
-- Resultado: una fila por prueba con esperado / obtenido / ok. Todas deben salir ok = true
-- (o «sin datos» cuando no hay registros para esa prueba).
--
-- psql: psql "$DB_URL" -f docs/sql/2026-11-23_verificar_seguridad_fase1.sql

BEGIN;

CREATE TEMP TABLE _r (
  n serial,
  prueba text,
  esperado text,
  obtenido text,
  detalle text
) ON COMMIT DROP;

-- Ejecuta p_sql como el usuario/rol indicado y anota el SQLSTATE (o OK).
CREATE FUNCTION pg_temp.probar(p_prueba text, p_uid uuid, p_rol text, p_sql text, p_esperado text)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  v_estado text := 'OK';
  v_det text := NULL;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      CASE WHEN p_uid IS NULL THEN json_build_object('role', p_rol)::text
           ELSE json_build_object('sub', p_uid, 'role', p_rol)::text END, true);
    PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
    PERFORM set_config('request.jwt.claim.role', p_rol, true);
    EXECUTE format('SET LOCAL ROLE %I', p_rol);
    EXECUTE p_sql;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_estado := SQLSTATE;
    v_det := SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO _r (prueba, esperado, obtenido, detalle) VALUES (p_prueba, p_esperado, v_estado, v_det);
END
$f$;

DO $v$
DECLARE
  ua uuid; ea uuid;   -- usuario y empresa A
  ub uuid; eb uuid;   -- usuario y empresa B
  us uuid;            -- super admin sin empresa forzada
  ca uuid; cb uuid;   -- clientes
  va uuid; vb uuid;   -- ventas
  lb uuid; enb uuid;  -- renglón y entrega de B (si hay)
  n_auth int;
  hoy date := current_date;
BEGIN
  SELECT p.user_id, p.empresa_id INTO ua, ea
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = p.user_id)
    AND NOT public.is_sandbox_empresa(p.empresa_id)
    AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.empresa_id = p.empresa_id)
    AND EXISTS (SELECT 1 FROM public.ventas v WHERE v.empresa_id = p.empresa_id)
  ORDER BY p.created_at
  LIMIT 1;

  SELECT p.user_id, p.empresa_id INTO ub, eb
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL AND p.empresa_id IS DISTINCT FROM ea
    AND NOT EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = p.user_id)
    AND NOT public.is_sandbox_empresa(p.empresa_id)
    AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.empresa_id = p.empresa_id)
    AND EXISTS (SELECT 1 FROM public.ventas v WHERE v.empresa_id = p.empresa_id)
  ORDER BY p.created_at
  LIMIT 1;

  SELECT s.user_id INTO us
  FROM public.super_admins s JOIN public.profiles p ON p.user_id = s.user_id
  WHERE p.super_admin_override_empresa_id IS NULL
  LIMIT 1;

  IF ua IS NULL OR ub IS NULL THEN
    INSERT INTO _r (prueba, esperado, obtenido) VALUES ('datos de prueba (2 empresas)', 'OK', 'sin datos');
    RETURN;
  END IF;

  SELECT id INTO ca FROM public.clientes WHERE empresa_id = ea LIMIT 1;
  SELECT id INTO cb FROM public.clientes WHERE empresa_id = eb LIMIT 1;
  SELECT id INTO va FROM public.ventas WHERE empresa_id = ea LIMIT 1;
  SELECT id INTO vb FROM public.ventas WHERE empresa_id = eb LIMIT 1;
  SELECT el.id, e.id INTO lb, enb FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
  WHERE e.empresa_id = eb LIMIT 1;

  -- aplicar_cobro (11 parámetros)
  PERFORM pg_temp.probar('aplicar_cobro: A cobra en empresa B', ua, 'authenticated',
    format($s$SELECT public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, '[]'::jsonb, NULL::uuid, NULL::text, 'verif', %L)$s$, eb, cb, hoy, ub), '42501');
  PERFORM pg_temp.probar('aplicar_cobro: A cobra en su empresa', ua, 'authenticated',
    format($s$SELECT public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, '[]'::jsonb, NULL::uuid, NULL::text, 'verif', %L)$s$, ea, ca, hoy, ua), 'OK');
  PERFORM pg_temp.probar('aplicar_cobro: A suplanta p_user_id (se guarda A)', ua, 'authenticated',
    format($s$DO $x$ DECLARE v uuid; BEGIN
       v := public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, '[]'::jsonb, NULL::uuid, NULL::text, 'verif', %L);
       IF (SELECT user_id FROM public.cobros WHERE id = v) IS DISTINCT FROM %L::uuid THEN RAISE EXCEPTION 'user_id suplantado' USING ERRCODE = 'P0001'; END IF;
     END $x$$s$, ea, ca, hoy, ub, ua), 'OK');
  PERFORM pg_temp.probar('aplicar_cobro: A aplica a venta de B', ua, 'authenticated',
    format($s$SELECT public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, jsonb_build_array(jsonb_build_object('venta_id', %L::text, 'monto_aplicado', 1)), NULL::uuid, NULL::text, 'verif', NULL)$s$, ea, ca, hoy, vb), '42501');
  PERFORM pg_temp.probar('aplicar_cobro: A usa cliente de B', ua, 'authenticated',
    format($s$SELECT public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, '[]'::jsonb, NULL::uuid, NULL::text, 'verif', NULL)$s$, ea, cb, hoy), '42501');
  PERFORM pg_temp.probar('aplicar_cobro (9 parámetros): A en empresa B', ua, 'authenticated',
    format($s$SELECT public.aplicar_cobro(%L::uuid, %L::uuid, 1::numeric, 'efectivo'::text, 'verif'::text, %L::date, '[]'::jsonb, 'verif'::text, %L::uuid)$s$, eb, cb, hoy, ub), '42501');
  IF us IS NOT NULL THEN
    PERFORM pg_temp.probar('aplicar_cobro: super admin en empresa B', us, 'authenticated',
      format($s$SELECT public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, '[]'::jsonb, NULL::uuid, NULL::text, 'verif', NULL)$s$, eb, cb, hoy), 'OK');
  ELSE
    INSERT INTO _r (prueba, esperado, obtenido) VALUES ('aplicar_cobro: super admin en empresa B', 'OK', 'sin datos');
  END IF;
  PERFORM pg_temp.probar('aplicar_cobro: service_role (backend) en empresa B', NULL, 'service_role',
    format($s$SELECT public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, '[]'::jsonb, NULL::uuid, NULL::text, 'verif', %L)$s$, eb, cb, hoy, ub), 'OK');
  PERFORM pg_temp.probar('aplicar_cobro: anon', NULL, 'anon',
    format($s$SELECT public.aplicar_cobro(%L, %L, 1, 'efectivo', 'verif', %L, '[]'::jsonb, NULL::uuid, NULL::text, 'verif', NULL)$s$, eb, cb, hoy), '42501');

  -- registrar_saldo_inicial
  PERFORM pg_temp.probar('registrar_saldo_inicial: A en empresa B', ua, 'authenticated',
    format($s$SELECT public.registrar_saldo_inicial(%L, %L, 1)$s$, eb, cb), '42501');
  PERFORM pg_temp.probar('registrar_saldo_inicial: A con cliente de B en su empresa', ua, 'authenticated',
    format($s$SELECT public.registrar_saldo_inicial(%L, %L, 1)$s$, ea, cb), '42501');
  PERFORM pg_temp.probar('registrar_saldo_inicial: A en su empresa', ua, 'authenticated',
    format($s$SELECT public.registrar_saldo_inicial(%L, %L, 1)$s$, ea, ca), 'OK');
  IF us IS NOT NULL THEN
    PERFORM pg_temp.probar('registrar_saldo_inicial: super admin en empresa B', us, 'authenticated',
      format($s$SELECT public.registrar_saldo_inicial(%L, %L, 1)$s$, eb, cb), 'OK');
  END IF;

  -- lecturas por empresa
  PERFORM pg_temp.probar('saldo_clientes_a_la_fecha: A lee empresa B', ua, 'authenticated',
    format($s$SELECT count(*) FROM public.saldo_clientes_a_la_fecha(%L, %L)$s$, eb, hoy), '42501');
  PERFORM pg_temp.probar('saldo_clientes_a_la_fecha: A lee su empresa', ua, 'authenticated',
    format($s$SELECT count(*) FROM public.saldo_clientes_a_la_fecha(%L, %L)$s$, ea, hoy), 'OK');
  PERFORM pg_temp.probar('next_folio: A en empresa B', ua, 'authenticated',
    format($s$SELECT public.next_folio('VTA', %L)$s$, eb), '42501');
  PERFORM pg_temp.probar('next_folio: A en su empresa', ua, 'authenticated',
    format($s$SELECT public.next_folio('VTA', %L)$s$, ea), 'OK');
  PERFORM pg_temp.probar('get_sandbox_usage: A en empresa B', ua, 'authenticated',
    format($s$SELECT * FROM public.get_sandbox_usage(%L)$s$, eb), '42501');
  PERFORM pg_temp.probar('get_optimization_quota: A en empresa B', ua, 'authenticated',
    format($s$SELECT * FROM public.get_optimization_quota(%L)$s$, eb), '42501');

  -- por registro (d)
  PERFORM pg_temp.probar('reabrir_pedido_parcial: A sobre venta de B', ua, 'authenticated',
    format($s$SELECT public.reabrir_pedido_parcial(%L)$s$, vb), '42501');
  PERFORM pg_temp.probar('cerrar_pedido_parcial: A sobre venta de B', ua, 'authenticated',
    format($s$SELECT public.cerrar_pedido_parcial(%L, NULL, NULL)$s$, vb), '42501');
  PERFORM pg_temp.probar('surtir_linea_entrega: A con su empresa y renglón inexistente', ua, 'authenticated',
    format($s$SELECT public.surtir_linea_entrega(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid(), %L, %L)$s$, ea, ua), '42501');
  IF lb IS NOT NULL THEN
    PERFORM pg_temp.probar('surtir_linea_entrega: A con su empresa y renglón de B', ua, 'authenticated',
      format($s$SELECT public.surtir_linea_entrega(%L, gen_random_uuid(), gen_random_uuid(), 1, %L, %L, %L)$s$, lb, enb, ea, ua), '42501');
    PERFORM pg_temp.probar('revertir_surtido_linea: A con su empresa y renglón de B', ua, 'authenticated',
      format($s$SELECT public.revertir_surtido_linea(%L, %L, %L)$s$, lb, enb, ea), '42501');
  ELSE
    INSERT INTO _r (prueba, esperado, obtenido) VALUES ('surtir/revertir con renglón de B', '42501', 'sin datos');
  END IF;

  -- PIN (c)
  PERFORM pg_temp.probar('verify_admin_pin: A prueba PIN de B', ua, 'authenticated',
    format($s$SELECT public.verify_admin_pin(%L, '0000')$s$, ub), '42501');
  PERFORM pg_temp.probar('verify_admin_pin: A prueba su PIN', ua, 'authenticated',
    format($s$SELECT public.verify_admin_pin(%L, '0000')$s$, ua), 'OK');
  PERFORM pg_temp.probar('has_admin_pin: A consulta a B', ua, 'authenticated',
    format($s$SELECT public.has_admin_pin(%L)$s$, ub), '42501');

  -- (a) internas: sin EXECUTE para authenticated
  PERFORM pg_temp.probar('interna fn_recalc_venta_saldo: authenticated', ua, 'authenticated',
    format($s$SELECT public.fn_recalc_venta_saldo(%L)$s$, va), '42501');
  PERFORM pg_temp.probar('interna wa_clientes_saldos: authenticated', ua, 'authenticated',
    format($s$SELECT count(*) FROM public.wa_clientes_saldos(%L)$s$, eb), '42501');
  PERFORM pg_temp.probar('interna deduct_timbre: authenticated', ua, 'authenticated',
    format($s$SELECT public.deduct_timbre(%L, gen_random_uuid(), %L)$s$, eb, ua), '42501');
  PERFORM pg_temp.probar('helper fn_assert_empresa: authenticated directo', ua, 'authenticated',
    format($s$SELECT public.fn_assert_empresa(%L)$s$, ea), '42501');
  PERFORM pg_temp.probar('interna wa_clientes_saldos: service_role', NULL, 'service_role',
    format($s$SELECT count(*) FROM public.wa_clientes_saldos(%L)$s$, eb), 'OK');

  SELECT count(*) INTO n_auth
  FROM unnest(ARRAY[
    'public._aj_regresar_a_bodega(public.entregas,uuid,uuid,numeric,uuid,uuid,uuid)','public._aplica_stock_lote(uuid,uuid,uuid,uuid,numeric)',
    'public._aplicar_delta_compra_edicion(uuid,uuid,uuid,uuid,numeric,uuid,text,text)','public._descarga_es_propia(uuid,uuid,uuid)',
    'public._inotif_cliente_nombre(uuid)','public._mover_stock_entre_almacenes(uuid,uuid,numeric,uuid,uuid,text,uuid,uuid,date,text)',
    'public.aplicar_partner_referido(uuid,text,text)','public.apply_carga_kardex(uuid)','public.calc_audit_stock_teorico(uuid)',
    'public.check_stock_lote_paridad(uuid)','public.cleanup_old_vendedor_historial()','public.cleanup_stale_vendedor_ubicaciones()',
    'public.cobro_tiene_rep_vigente(uuid)','public.confirm_timbre_reserve(uuid,uuid)','public.count_active_users(uuid)',
    'public.deduct_timbre(uuid,uuid,uuid)','public.desactivar_cupones_partner_fuera_limite(uuid)','public.ensure_almacen_mermas(uuid)',
    'public.ensure_empresa_admin_role(uuid)','public.fn_disponible_almacen(uuid,uuid)','public.fn_doc_mueve_stock(uuid,uuid)',
    'public.fn_factor_neto_compra(uuid)','public.fn_log_solicitud_traspaso(uuid,uuid,text,jsonb)','public.fn_netear_linea_promo(uuid)',
    'public.fn_pedido_entregado_completo(uuid)','public.fn_puede_cancelar_devolucion(uuid,uuid,uuid)','public.fn_puede_descargas(uuid,uuid,text)',
    'public.fn_recalc_venta_header(uuid)','public.fn_recalc_venta_saldo(uuid)','public.fn_reevaluar_promos_venta(uuid)',
    'public.fn_refresh_logistica_pedido_resumen(uuid)','public.fn_sync_apartado_linea(uuid)','public.fn_sync_status_pedido(uuid)',
    'public.fn_sync_venta_inventario(uuid)','public.fn_total_efectivo_cerrado(uuid,numeric)','public.fn_venta_cobrable(public.ventas)',
    'public.fn_venta_tiene_promocion(uuid)','public.generar_bonos_partner(uuid)','public.generate_empresa_licencia()',
    'public.generate_folio(uuid,text)','public.get_partner_active_empresas(uuid)','public.is_empresa_admin(uuid,uuid)',
    'public.is_sandbox_empresa(uuid)','public.limpiar_consumo_datos_antiguo()','public.log_venta_historial(uuid,uuid,text,jsonb)',
    'public.puede_configurar_facturacion(uuid,uuid)','public.puede_facturar(uuid,uuid,text)','public.purge_internal_notifications()',
    'public.purge_old_gps_history()','public.recalc_producto_costo(uuid)','public.recalc_venta_totales(uuid)',
    'public.recalcular_nivel_partner(uuid)','public.recibir_linea_compra(uuid,numeric,uuid,uuid,uuid,text,uuid)',
    'public.reconciliar_saldos_cliente(uuid)','public.reconciliar_saldos_empresa(uuid)','public.release_timbre(uuid,text)',
    'public.repair_missing_entrega_carga()','public.reserve_timbre(uuid,uuid)','public.resolver_comision_pct_linea(uuid,uuid,uuid,uuid)',
    'public.stock_almacen_at_eod(uuid,date)','public.tiene_cobertura_vigente(uuid)','public.wa_clientes_saldos(uuid,text,boolean,integer)'
  ]) s
  WHERE has_function_privilege('authenticated', s::regprocedure, 'execute')
     OR has_function_privilege('anon', s::regprocedure, 'execute');
  INSERT INTO _r (prueba, esperado, obtenido)
  VALUES ('62 funciones internas sin EXECUTE para anon/authenticated', '0', n_auth::text);

  -- tabla de respaldo
  INSERT INTO _r (prueba, esperado, obtenido)
  SELECT 'cliente_orden_ruta_dia_respaldo: RLS activo y sin SELECT para anon/authenticated', 'true',
         (c.relrowsecurity AND NOT has_table_privilege('anon', c.oid, 'select')
                           AND NOT has_table_privilege('authenticated', c.oid, 'select'))::text
  FROM pg_class c WHERE c.oid = 'public.cliente_orden_ruta_dia_respaldo'::regclass;
  PERFORM pg_temp.probar('cliente_orden_ruta_dia_respaldo: anon lee', NULL, 'anon',
    'SELECT count(*) FROM public.cliente_orden_ruta_dia_respaldo', '42501');
END
$v$;

SELECT n, prueba, esperado, obtenido,
       (obtenido = esperado OR obtenido = 'sin datos') AS ok,
       detalle
FROM _r ORDER BY n;

ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- REVERTIR (solo con «CONFIRMO revertir seguridad fase 1»):
--   psql "$DB_URL" -f docs/sql/2026-11-23_revertir_seguridad_fase1.sql
-- Restaura los 22 cuerpos originales (md5 de producción del 2026-11-23), devuelve EXECUTE a
-- authenticated en las 62 internas y quita permisos/RLS nuevos de la tabla de respaldo NO
-- (eso se deja: volver a exponerla requiere decisión aparte).
-- ════════════════════════════════════════════════════════════════════════════════════════
