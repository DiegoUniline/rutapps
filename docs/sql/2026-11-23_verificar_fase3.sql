-- Verificación de la migración 20261123041000_purga_gps_recorded_at.sql (fase 3 «Inventario y cobros»).
-- Correr DESPUÉS de aplicarla. Es UN solo bloque DO que termina con RAISE EXCEPTION: todo lo
-- que hace (filas GPS de prueba y la purga misma) se deshace al final.
--
-- Usa un perfil existente (user_id + empresa_id) para insertar dos puntos GPS de prueba:
-- uno de hace 31 días (debe borrarse) y uno de hace 29 días (debe quedarse).
-- Nota: dentro de la transacción la purga borra también el histórico viejo real (se deshace).
--
-- Lee los NOTICE: una línea por prueba «ok | fallo · prueba · esperado → obtenido». La última
-- línea (ERROR) es el resumen: «FIN verificación fase 3: N ok, M fallas (todo se deshizo)».
--
-- psql: psql "$DB_URL" -f docs/sql/2026-11-23_verificar_fase3.sql

DO $v$
DECLARE
  u uuid; e uuid;
  viejo uuid := gen_random_uuid();
  reciente uuid := gen_random_uuid();
  n_ok int := 0; n_fail int := 0;
  n int; def text;
  procedure_ok boolean;
BEGIN
  SELECT p.user_id, p.empresa_id INTO u, e
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL AND p.empresa_id IS NOT NULL
  LIMIT 1;
  IF u IS NULL THEN RAISE EXCEPTION 'Sin perfiles para probar'; END IF;

  -- 1. La función usa la columna real.
  def := pg_get_functiondef('public.purge_old_gps_history'::regproc);
  IF def ILIKE '%recorded_at%' AND def NOT ILIKE '%created_at%' THEN
    n_ok := n_ok + 1; RAISE NOTICE 'ok | función borra por recorded_at';
  ELSE
    n_fail := n_fail + 1; RAISE NOTICE 'fallo | función borra por recorded_at → %', def;
  END IF;

  -- 2. Permisos: solo service_role (fase 1 de seguridad).
  procedure_ok := NOT has_function_privilege('authenticated', 'public.purge_old_gps_history()', 'EXECUTE')
              AND NOT has_function_privilege('anon', 'public.purge_old_gps_history()', 'EXECUTE')
              AND has_function_privilege('service_role', 'public.purge_old_gps_history()', 'EXECUTE');
  IF procedure_ok THEN
    n_ok := n_ok + 1; RAISE NOTICE 'ok | EXECUTE solo service_role';
  ELSE
    n_fail := n_fail + 1; RAISE NOTICE 'fallo | EXECUTE solo service_role';
  END IF;

  -- 3. Purga: borra lo de más de 30 días y conserva lo reciente.
  INSERT INTO public.vendedor_ubicaciones_historial (id, user_id, empresa_id, lat, lng, recorded_at)
  VALUES (viejo, u, e, 19.4326, -99.1332, now() - interval '31 days'),
         (reciente, u, e, 19.4326, -99.1332, now() - interval '29 days');

  PERFORM public.purge_old_gps_history();   -- antes: ERROR column "created_at" does not exist

  SELECT count(*) INTO n FROM public.vendedor_ubicaciones_historial WHERE id = viejo;
  IF n = 0 THEN n_ok := n_ok + 1; RAISE NOTICE 'ok | punto de hace 31 días borrado';
  ELSE n_fail := n_fail + 1; RAISE NOTICE 'fallo | punto de hace 31 días borrado → sigue'; END IF;

  SELECT count(*) INTO n FROM public.vendedor_ubicaciones_historial WHERE id = reciente;
  IF n = 1 THEN n_ok := n_ok + 1; RAISE NOTICE 'ok | punto de hace 29 días conservado';
  ELSE n_fail := n_fail + 1; RAISE NOTICE 'fallo | punto de hace 29 días conservado → borrado'; END IF;

  SELECT count(*) INTO n FROM public.vendedor_ubicaciones_historial WHERE recorded_at < now() - interval '30 days';
  IF n = 0 THEN n_ok := n_ok + 1; RAISE NOTICE 'ok | nada anterior a 30 días';
  ELSE n_fail := n_fail + 1; RAISE NOTICE 'fallo | nada anterior a 30 días → % filas', n; END IF;

  RAISE EXCEPTION 'FIN verificación fase 3: % ok, % fallas (todo se deshizo)', n_ok, n_fail;
END
$v$;
