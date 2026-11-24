-- D-064 · Fase 4 «Monitoreo»: verificar app_errores, dispositivos_sync, alertas y RPC SIN dejar nada.
-- Todo corre en UNA transacción y termina SIEMPRE con RAISE EXCEPTION: lo creado se deshace
-- (incluido el super admin de prueba). Correr completo en el SQL editor con un rol que pueda
-- fijar request.jwt.claims y SET ROLE authenticated (postgres).
-- Resultado esperado: «D-064 OK (n/n): …». Si algún caso falla: «D-064 FALLA (k/n): …».
-- Los datos de prueba se crean sin sesión (set_config('request.jwt.claims','',true)); la sesión se
-- simula solo para llamar las RPC. La empresa A es get_my_empresa_id() de su dueño.
DO $verificar$
DECLARE
  v_a uuid; v_owner_a uuid; v_b uuid; v_owner_b uuid; v_user_a uuid; v_sa uuid := gen_random_uuid();
  v_ok int := 0; v_total int := 0; v_log text := ''; v_msg text; v_r boolean; v_n int;
  v_row record; v_j jsonb; v_t timestamptz;
BEGIN
  -- Empresas A y B con dueño (no super admin), como en verificar_d062.
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
  IF v_a IS NULL OR v_b IS NULL OR v_a = v_b THEN RAISE EXCEPTION 'D-064: se necesitan dos empresas con dueño'; END IF;
  -- Usuario de A que no es dueño ni Administrador (puede no existir: el caso se omite).
  SELECT p.user_id INTO v_user_a FROM public.profiles p
   WHERE p.empresa_id = v_a AND p.user_id <> v_owner_a AND NOT public.is_empresa_admin(p.user_id, v_a)
     AND p.super_admin_override_empresa_id IS NULL LIMIT 1;

  -- Sin sesión: super admin de prueba (se deshace) y datos limpios.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.super_admins (user_id, email) VALUES (v_sa, 'verificacion-d064@invalid');

  -- 1. Permisos: anon no ejecuta; authenticated no escribe directo; purga solo servidor.
  v_total := v_total + 1;
  IF NOT has_function_privilege('anon', 'public.registrar_error_app(text,text,jsonb,text,text,text,text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.registrar_error_app(text,text,jsonb,text,text,text,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.registrar_salud_dispositivo(text,text,integer,integer,timestamptz,text,text)', 'EXECUTE')
     AND NOT has_table_privilege('authenticated', 'public.app_errores', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.dispositivos_sync', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.dispositivos_sync', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.alertas_config', 'UPDATE')
     AND NOT has_table_privilege('anon', 'public.app_errores', 'SELECT')
     AND NOT has_function_privilege('authenticated', 'public.purgar_observabilidad()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.admin_salud_crons(integer)', 'EXECUTE') THEN
    v_ok := v_ok + 1; v_log := v_log || '1 permisos ✓ ';
  ELSE v_log := v_log || '1 permisos ✗ '; END IF;

  -- 2. registrar_error_app: empresa/usuario del servidor, ruta sin consulta ni ids, sin correo/teléfono.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_r := public.registrar_error_app('prueba.d064', 'Falló para juan@correo.com tel 33 1234 5678',
          '{"tabla":"ventas"}'::jsonb, 'v-prueba', '/ventas/0c5e1d2a-1111-2222-3333-444455556666?cliente=Juan#x', 'disp-d064', 'android');
  SELECT * INTO v_row FROM public.app_errores WHERE origen = 'prueba.d064' AND user_id = v_owner_a ORDER BY created_at DESC LIMIT 1;
  IF v_r AND v_row.empresa_id = v_a AND v_row.ruta = '/ventas/:id' AND v_row.mensaje NOT LIKE '%juan@%'
     AND v_row.mensaje LIKE '%[correo]%' AND v_row.mensaje LIKE '%[numero]%' AND v_row.detalle = '{"tabla":"ventas"}'::jsonb THEN
    v_ok := v_ok + 1; v_log := v_log || '2 registra limpio ✓ ';
  ELSE v_log := v_log || format('2 registra limpio ✗ (%s %s %s) ', v_r, v_row.ruta, v_row.mensaje); END IF;

  -- 3. Detalle grande o que no es objeto → se recorta.
  v_total := v_total + 1;
  v_r := public.registrar_error_app('prueba.d064.grande', 'x', jsonb_build_object('t', repeat('a', 6000)));
  SELECT detalle INTO v_j FROM public.app_errores WHERE origen = 'prueba.d064.grande' AND user_id = v_owner_a LIMIT 1;
  IF v_r AND v_j = '{"recortado": true}'::jsonb THEN
    v_ok := v_ok + 1; v_log := v_log || '3 detalle acotado ✓ ';
  ELSE v_log := v_log || format('3 detalle acotado ✗ (%s) ', v_j); END IF;

  -- 4. Límite por usuario: máx. 20 por minuto (ya van 2; 18 más pasan y la 21ª no).
  v_total := v_total + 1;
  v_n := 0;
  FOR i IN 1..19 LOOP
    IF public.registrar_error_app('prueba.d064.limite', 'error ' || i) THEN v_n := v_n + 1; END IF;
  END LOOP;
  IF v_n = 18 AND (SELECT count(*) FROM public.app_errores WHERE user_id = v_owner_a AND origen LIKE 'prueba.d064%') = 20 THEN
    v_ok := v_ok + 1; v_log := v_log || '4 límite ✓ ';
  ELSE v_log := v_log || format('4 límite ✗ (%s aceptados) ', v_n); END IF;

  -- 5. Sin sesión de usuario (anon) → 42501.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  BEGIN
    PERFORM public.registrar_error_app('prueba.d064', 'anon');
    v_msg := 'sin error';
  EXCEPTION WHEN insufficient_privilege THEN v_msg := '42501';
  END;
  IF v_msg = '42501' THEN v_ok := v_ok + 1; v_log := v_log || '5 anon ✓ ';
  ELSE v_log := v_log || format('5 anon ✗ (%s) ', v_msg); END IF;

  -- 6. RLS: el dueño (no super admin) NO lee app_errores; el super admin sí.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.app_errores;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sa, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF v_n = 0 AND (SELECT count(*) FROM public.app_errores WHERE origen LIKE 'prueba.d064%') = 20 THEN
    v_ok := v_ok + 1; v_log := v_log || '6 RLS errores ✓ ';
  ELSE v_log := v_log || format('6 RLS errores ✗ (dueño ve %s) ', v_n); END IF;
  RESET ROLE;

  -- 7. registrar_salud_dispositivo: alta con empresa del servidor; repetir a <10 s se ignora;
  --    después actualiza, el último sync no retrocede y no acepta fechas futuras.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_t := now() - interval '2 hours';
  v_r := public.registrar_salud_dispositivo('disp-d064', 'v1', 3, 1, v_t, 'Falló a pepe@x.com', 'android');
  IF v_r AND NOT public.registrar_salud_dispositivo('disp-d064', 'v1', 0, 0, now(), NULL, 'android') THEN
    UPDATE public.dispositivos_sync SET updated_at = now() - interval '1 minute'
     WHERE user_id = v_owner_a AND dispositivo_id = 'disp-d064';
    v_r := public.registrar_salud_dispositivo('disp-d064', 'v2', 0, 2, now() - interval '5 hours', NULL, NULL);
    SELECT * INTO v_row FROM public.dispositivos_sync WHERE user_id = v_owner_a AND dispositivo_id = 'disp-d064';
    IF v_r AND v_row.empresa_id = v_a AND v_row.version = 'v2' AND v_row.pendientes = 0 AND v_row.fallidas = 2
       AND v_row.ultimo_sync_ok = v_t AND v_row.plataforma = 'android' AND v_row.ultimo_error IS NULL THEN
      UPDATE public.dispositivos_sync SET updated_at = now() - interval '1 minute'
       WHERE user_id = v_owner_a AND dispositivo_id = 'disp-d064';
      PERFORM public.registrar_salud_dispositivo('disp-d064', 'v2', 1, 0, now() + interval '3 days', 'x', NULL);
      IF (SELECT ultimo_sync_ok <= now() FROM public.dispositivos_sync WHERE user_id = v_owner_a AND dispositivo_id = 'disp-d064') THEN
        v_ok := v_ok + 1; v_log := v_log || '7 salud dispositivo ✓ ';
      ELSE v_log := v_log || '7 salud dispositivo ✗ (fecha futura) '; END IF;
    ELSE v_log := v_log || format('7 salud dispositivo ✗ (%s) ', row_to_json(v_row)); END IF;
  ELSE v_log := v_log || '7 salud dispositivo ✗ (alta o freno) '; END IF;

  -- 8. RLS dispositivos: dueño de A ve el suyo; dueño de B no; usuario sin admin de A no.
  v_total := v_total + 1;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.dispositivos_sync WHERE dispositivo_id = 'disp-d064';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF v_n = 1 AND (SELECT count(*) FROM public.dispositivos_sync WHERE dispositivo_id = 'disp-d064') = 0 THEN
    RESET ROLE;
    IF v_user_a IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO v_n FROM public.dispositivos_sync WHERE dispositivo_id = 'disp-d064';
      RESET ROLE;
    ELSE v_n := 0; v_log := v_log || '(sin usuario no-admin en A) '; END IF;
    IF v_n = 0 THEN v_ok := v_ok + 1; v_log := v_log || '8 RLS dispositivos ✓ ';
    ELSE v_log := v_log || '8 RLS dispositivos ✗ (no-admin ve) '; END IF;
  ELSE
    RESET ROLE;
    v_log := v_log || format('8 RLS dispositivos ✗ (dueño A ve %s) ', v_n);
  END IF;

  -- 9. Lecturas del panel: dueño → 42501; super admin → ve el grupo y el dispositivo.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM * FROM public.admin_salud_errores(24);
    v_msg := 'sin error';
  EXCEPTION WHEN insufficient_privilege THEN v_msg := '42501';
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sa, 'role', 'authenticated')::text, true);
  IF v_msg = '42501'
     AND (SELECT sum(conteo) FROM public.admin_salud_errores(24) WHERE origen = 'prueba.d064.limite' AND empresa_id = v_a) = 18
     AND EXISTS (SELECT 1 FROM public.admin_salud_dispositivos() WHERE dispositivo_id = 'disp-d064' AND empresa_id = v_a)
     AND (public.admin_salud_crons(24) ? 'jobs') THEN
    v_ok := v_ok + 1; v_log := v_log || '9 panel ✓ ';
  ELSE v_log := v_log || format('9 panel ✗ (%s) ', v_msg); END IF;

  -- 10. Config de alertas: dueño no; correo inválido no; válido se guarda en minúsculas y sin repetir.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.admin_guardar_alertas_config(ARRAY['a@b.co'], true, 20, 6);
    v_msg := 'sin error';
  EXCEPTION WHEN insufficient_privilege THEN v_msg := '42501';
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sa, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.admin_guardar_alertas_config(ARRAY['no-es-correo'], true, 20, 6);
    v_msg := v_msg || '/sin error';
  EXCEPTION WHEN invalid_parameter_value THEN v_msg := v_msg || '/22023';
  END;
  v_j := public.admin_guardar_alertas_config(ARRAY[' Ops@Ejemplo.MX ', 'ops@ejemplo.mx', ''], true, 15, 4);
  IF v_msg = '42501/22023' AND v_j->'destinatarios' = '["ops@ejemplo.mx"]'::jsonb
     AND (v_j->>'umbral_errores_hora')::int = 15 AND (v_j->>'horas_pendientes')::int = 4 THEN
    v_ok := v_ok + 1; v_log := v_log || '10 config alertas ✓ ';
  ELSE v_log := v_log || format('10 config alertas ✗ (%s %s) ', v_msg, v_j); END IF;

  -- 11. Purga (sin sesión, como el cron): borra errores de más de 30 días y deja los recientes.
  v_total := v_total + 1;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.app_errores (empresa_id, user_id, origen, mensaje, created_at)
  VALUES (v_a, v_owner_a, 'prueba.d064.viejo', 'viejo', now() - interval '31 days');
  v_j := public.purgar_observabilidad();
  IF NOT EXISTS (SELECT 1 FROM public.app_errores WHERE origen = 'prueba.d064.viejo')
     AND (SELECT count(*) FROM public.app_errores WHERE origen LIKE 'prueba.d064%') = 20 THEN
    v_ok := v_ok + 1; v_log := v_log || '11 purga ✓ ';
  ELSE v_log := v_log || format('11 purga ✗ (%s) ', v_j); END IF;

  IF v_ok = v_total THEN
    RAISE EXCEPTION 'D-064 OK (%/%): % — todo se deshizo', v_ok, v_total, v_log;
  END IF;
  RAISE EXCEPTION 'D-064 FALLA (%/%): % — todo se deshizo', v_ok, v_total, v_log;
END
$verificar$;
