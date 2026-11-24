-- D-064 · Fase 4 «Monitoreo y pruebas» (decisión del dueño: «Interno + correo»).
-- Errores de la app y salud de los celulares se guardan en Supabase y se ven en el Super Admin;
-- alertas por correo (Resend) desde la edge function `alertas-salud`. Sentry sigue igual (opcional).
--
--  1. public.app_errores          errores de la app (sin datos personales). Solo super admin lee;
--                                 se escribe solo con la RPC registrar_error_app (límite por usuario).
--  2. public.dispositivos_sync    salud de la cola por instalación (pendientes, fallidas, último sync).
--                                 Super admin todo; Administrador / dueño ven los de su empresa.
--                                 Se escribe solo con la RPC registrar_salud_dispositivo.
--  3. public.alertas_config       destinatarios y umbrales de las alertas (una fila; sin valores en el
--                                 repo: el super admin los captura en el panel).
--     public.alertas_enviadas     dedupe de alertas (una clave = un hallazgo ya avisado).
--  4. RPC de lectura para el panel (solo super admin / servidor): admin_salud_errores,
--     admin_salud_dispositivos, admin_salud_crons, admin_guardar_alertas_config.
--  5. Purga diaria (30 días errores, 90 días alertas y dispositivos sin reportar) y cron horario
--     que llama a `alertas-salud` con x-cron-secret leído de Vault (como los crons actuales).
--
-- Aditiva: solo crea tablas/funciones/crons nuevos. Revertir: ver docs/decisiones.md D-064.

-- ─── Autorización común ──────────────────────────────────────────────────────────────
-- Super admin (sin empresa simulada), service_role o conexión directa (cron/migración).
CREATE OR REPLACE FUNCTION public._salud_es_privilegiado()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN coalesce(auth.role(), '') NOT IN ('anon', 'authenticated');
  END IF;
  RETURN public.is_super_admin(v_uid);
END
$fn$;
REVOKE ALL ON FUNCTION public._salud_es_privilegiado() FROM PUBLIC, anon, authenticated;

-- Quita del texto lo que pueda ser dato personal: correos, teléfonos/números largos y tokens.
CREATE OR REPLACE FUNCTION public._salud_sin_pii(p_texto text, p_max int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT left(
    regexp_replace(
      regexp_replace(
        regexp_replace(btrim(coalesce(p_texto, '')),
          '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[correo]', 'g'),
        'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?', '[token]', 'g'),
      '\+?[0-9][0-9 ()-]{8,}[0-9]', '[numero]', 'g'),
    greatest(p_max, 1));
$fn$;
REVOKE ALL ON FUNCTION public._salud_sin_pii(text, int) FROM PUBLIC, anon, authenticated;

-- ─── 1. Errores de la app ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_errores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id        uuid,
  origen         text NOT NULL CHECK (length(origen) BETWEEN 1 AND 80),
  mensaje        text NOT NULL CHECK (length(mensaje) BETWEEN 1 AND 500),
  detalle        jsonb CHECK (detalle IS NULL OR pg_column_size(detalle) <= 4096),
  version        text CHECK (version IS NULL OR length(version) <= 40),
  ruta           text CHECK (ruta IS NULL OR length(ruta) <= 200),
  dispositivo_id text CHECK (dispositivo_id IS NULL OR length(dispositivo_id) <= 64),
  plataforma     text CHECK (plataforma IS NULL OR length(plataforma) <= 20),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_errores_created ON public.app_errores (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errores_user_created ON public.app_errores (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errores_empresa_created ON public.app_errores (empresa_id, created_at DESC);

ALTER TABLE public.app_errores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin lee errores" ON public.app_errores;
CREATE POLICY "Super admin lee errores" ON public.app_errores
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin((SELECT auth.uid()))));
REVOKE ALL ON public.app_errores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_errores TO authenticated;
GRANT ALL ON public.app_errores TO service_role;
COMMENT ON TABLE public.app_errores IS
  'D-064: errores de la app (sin datos personales). Escritura solo por registrar_error_app; purga a 30 días.';

-- Registra un error de la app del usuario en sesión. Devuelve false si se descartó por límite.
-- Límite: 20 por minuto y 300 por hora por usuario. Todo se acota y se limpia en el servidor.
CREATE OR REPLACE FUNCTION public.registrar_error_app(
  p_origen text,
  p_mensaje text,
  p_detalle jsonb DEFAULT NULL,
  p_version text DEFAULT NULL,
  p_ruta text DEFAULT NULL,
  p_dispositivo_id text DEFAULT NULL,
  p_plataforma text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa uuid;
  v_min int;
  v_hora int;
  v_detalle jsonb := p_detalle;
  v_ruta text;
  v_mensaje text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sin sesión' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 minute'),
         count(*)
    INTO v_min, v_hora
    FROM public.app_errores
   WHERE user_id = v_uid AND created_at > now() - interval '1 hour';
  IF v_min >= 20 OR v_hora >= 300 THEN
    RETURN false;
  END IF;

  v_empresa := public.get_my_empresa_id();
  IF v_empresa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_empresa) THEN
    v_empresa := NULL;
  END IF;

  IF v_detalle IS NOT NULL AND (jsonb_typeof(v_detalle) <> 'object' OR pg_column_size(v_detalle) > 4096) THEN
    v_detalle := jsonb_build_object('recortado', true);
  END IF;

  -- Solo la ruta (sin ?consulta ni #ancla) y sin ids largos.
  v_ruta := nullif(split_part(split_part(coalesce(p_ruta, ''), '?', 1), '#', 1), '');
  v_ruta := left(regexp_replace(v_ruta, '[0-9a-fA-F-]{16,}', ':id', 'g'), 200);

  v_mensaje := public._salud_sin_pii(p_mensaje, 500);
  IF v_mensaje = '' THEN v_mensaje := 'Error sin mensaje'; END IF;

  INSERT INTO public.app_errores (empresa_id, user_id, origen, mensaje, detalle, version, ruta, dispositivo_id, plataforma)
  VALUES (
    v_empresa, v_uid,
    coalesce(nullif(left(btrim(coalesce(p_origen, '')), 80), ''), 'desconocido'),
    v_mensaje,
    v_detalle,
    nullif(left(btrim(coalesce(p_version, '')), 40), ''),
    v_ruta,
    nullif(left(btrim(coalesce(p_dispositivo_id, '')), 64), ''),
    nullif(left(btrim(coalesce(p_plataforma, '')), 20), '')
  );
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.registrar_error_app(text, text, jsonb, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_error_app(text, text, jsonb, text, text, text, text) TO authenticated, service_role;

-- ─── 2. Salud de dispositivos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispositivos_sync (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  dispositivo_id text NOT NULL CHECK (length(dispositivo_id) BETWEEN 1 AND 64),
  plataforma     text CHECK (plataforma IS NULL OR length(plataforma) <= 20),
  version        text CHECK (version IS NULL OR length(version) <= 40),
  pendientes     integer NOT NULL DEFAULT 0 CHECK (pendientes >= 0),
  fallidas       integer NOT NULL DEFAULT 0 CHECK (fallidas >= 0),
  ultimo_sync_ok timestamptz,
  ultimo_error   text CHECK (ultimo_error IS NULL OR length(ultimo_error) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispositivos_sync_user_dispositivo_key UNIQUE (user_id, dispositivo_id)
);
CREATE INDEX IF NOT EXISTS idx_dispositivos_sync_empresa ON public.dispositivos_sync (empresa_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispositivos_sync_problemas ON public.dispositivos_sync (updated_at DESC)
  WHERE pendientes > 0 OR fallidas > 0;

-- ¿El usuario en sesión es Administrador o dueño de SU empresa? (sin parámetro de usuario: no
-- sirve para preguntar por otros). is_empresa_admin no es ejecutable por authenticated.
CREATE OR REPLACE FUNCTION public._salud_admin_de_mi_empresa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_empresa_admin(auth.uid(), public.get_my_empresa_id())
    OR EXISTS (SELECT 1 FROM public.empresas e
                WHERE e.id = public.get_my_empresa_id() AND e.owner_user_id = auth.uid())
  );
$fn$;
REVOKE ALL ON FUNCTION public._salud_admin_de_mi_empresa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._salud_admin_de_mi_empresa() TO authenticated, service_role;

ALTER TABLE public.dispositivos_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Salud de dispositivos: super admin y administradores" ON public.dispositivos_sync;
CREATE POLICY "Salud de dispositivos: super admin y administradores" ON public.dispositivos_sync
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin((SELECT auth.uid())))
    OR (
      empresa_id = (SELECT public.get_my_empresa_id())
      AND (SELECT public._salud_admin_de_mi_empresa())
    )
  );
REVOKE ALL ON public.dispositivos_sync FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dispositivos_sync TO authenticated;
GRANT ALL ON public.dispositivos_sync TO service_role;
COMMENT ON TABLE public.dispositivos_sync IS
  'D-064: salud de la cola offline por instalación. Escritura solo por registrar_salud_dispositivo.';

-- Upsert del estado de la cola de ESTE usuario en ESTE dispositivo. La empresa y el usuario los
-- pone el servidor (no el teléfono). Ignora reportes a menos de 10 s del anterior.
CREATE OR REPLACE FUNCTION public.registrar_salud_dispositivo(
  p_dispositivo_id text,
  p_version text DEFAULT NULL,
  p_pendientes integer DEFAULT 0,
  p_fallidas integer DEFAULT 0,
  p_ultimo_sync_ok timestamptz DEFAULT NULL,
  p_ultimo_error text DEFAULT NULL,
  p_plataforma text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa uuid;
  v_disp text := nullif(left(btrim(coalesce(p_dispositivo_id, '')), 64), '');
  v_sync timestamptz := p_ultimo_sync_ok;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sin sesión' USING ERRCODE = '42501';
  END IF;
  IF v_disp IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador del dispositivo' USING ERRCODE = '22023';
  END IF;
  v_empresa := public.get_my_empresa_id();
  IF v_empresa IS NULL OR NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_empresa) THEN
    RETURN false; -- usuario sin empresa (registro incompleto): nada que reportar
  END IF;
  -- Reloj del teléfono adelantado: no se acepta un «último sync» en el futuro.
  IF v_sync IS NOT NULL AND v_sync > now() THEN v_sync := now(); END IF;

  INSERT INTO public.dispositivos_sync AS d
    (empresa_id, user_id, dispositivo_id, plataforma, version, pendientes, fallidas, ultimo_sync_ok, ultimo_error, updated_at)
  VALUES (
    v_empresa, v_uid, v_disp,
    nullif(left(btrim(coalesce(p_plataforma, '')), 20), ''),
    nullif(left(btrim(coalesce(p_version, '')), 40), ''),
    least(greatest(coalesce(p_pendientes, 0), 0), 1000000),
    least(greatest(coalesce(p_fallidas, 0), 0), 1000000),
    v_sync,
    nullif(public._salud_sin_pii(p_ultimo_error, 300), ''),
    now()
  )
  ON CONFLICT (user_id, dispositivo_id) DO UPDATE SET
    empresa_id     = EXCLUDED.empresa_id,
    plataforma     = coalesce(EXCLUDED.plataforma, d.plataforma),
    version        = coalesce(EXCLUDED.version, d.version),
    pendientes     = EXCLUDED.pendientes,
    fallidas       = EXCLUDED.fallidas,
    -- Nunca retrocede (dos pestañas o un reporte atrasado).
    ultimo_sync_ok = CASE WHEN d.ultimo_sync_ok IS NULL THEN EXCLUDED.ultimo_sync_ok
                          WHEN EXCLUDED.ultimo_sync_ok IS NULL THEN d.ultimo_sync_ok
                          ELSE greatest(d.ultimo_sync_ok, EXCLUDED.ultimo_sync_ok) END,
    ultimo_error   = EXCLUDED.ultimo_error,
    updated_at     = now()
  WHERE d.updated_at < now() - interval '10 seconds';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END
$fn$;
REVOKE ALL ON FUNCTION public.registrar_salud_dispositivo(text, text, integer, integer, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_salud_dispositivo(text, text, integer, integer, timestamptz, text, text) TO authenticated, service_role;

-- ─── 3. Configuración y dedupe de alertas ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alertas_config (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  destinatarios       text[] NOT NULL DEFAULT '{}',
  activo              boolean NOT NULL DEFAULT true,
  umbral_errores_hora integer NOT NULL DEFAULT 20 CHECK (umbral_errores_hora BETWEEN 1 AND 100000),
  horas_pendientes    integer NOT NULL DEFAULT 6 CHECK (horas_pendientes BETWEEN 1 AND 168),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid
);
INSERT INTO public.alertas_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.alertas_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin lee config de alertas" ON public.alertas_config;
CREATE POLICY "Super admin lee config de alertas" ON public.alertas_config
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin((SELECT auth.uid()))));
REVOKE ALL ON public.alertas_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.alertas_config TO authenticated;
GRANT ALL ON public.alertas_config TO service_role;
COMMENT ON TABLE public.alertas_config IS
  'D-064: destinatarios y umbrales de las alertas de salud (una fila). Se edita con admin_guardar_alertas_config.';

CREATE TABLE IF NOT EXISTS public.alertas_enviadas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave      text NOT NULL CHECK (length(clave) BETWEEN 1 AND 300),
  tipo       text NOT NULL CHECK (tipo IN ('cron', 'http', 'dispositivo', 'errores')),
  enviado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alertas_enviadas_clave_key UNIQUE (clave)
);
CREATE INDEX IF NOT EXISTS idx_alertas_enviadas_enviado ON public.alertas_enviadas (enviado_at DESC);
ALTER TABLE public.alertas_enviadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin lee alertas enviadas" ON public.alertas_enviadas;
CREATE POLICY "Super admin lee alertas enviadas" ON public.alertas_enviadas
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin((SELECT auth.uid()))));
REVOKE ALL ON public.alertas_enviadas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.alertas_enviadas TO authenticated;
GRANT ALL ON public.alertas_enviadas TO service_role;

CREATE OR REPLACE FUNCTION public.admin_guardar_alertas_config(
  p_destinatarios text[],
  p_activo boolean,
  p_umbral_errores_hora integer,
  p_horas_pendientes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_lista text[];
  v_mal text;
BEGIN
  IF NOT public._salud_es_privilegiado() THEN
    RAISE EXCEPTION 'Solo super admin' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}')
    INTO v_lista
    FROM (SELECT lower(btrim(c)) AS x FROM unnest(coalesce(p_destinatarios, '{}')) c) s
   WHERE x <> '';
  SELECT x INTO v_mal FROM unnest(v_lista) x
   WHERE x !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(x) > 254 LIMIT 1;
  IF v_mal IS NOT NULL THEN
    RAISE EXCEPTION 'Correo no válido: %', v_mal USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_lista) > 10 THEN
    RAISE EXCEPTION 'Máximo 10 destinatarios' USING ERRCODE = '22023';
  END IF;
  IF p_umbral_errores_hora IS NULL OR p_umbral_errores_hora NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'Umbral de errores por hora fuera de rango (1 a 100000)' USING ERRCODE = '22023';
  END IF;
  IF p_horas_pendientes IS NULL OR p_horas_pendientes NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'Horas de pendientes fuera de rango (1 a 168)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.alertas_config AS c (id, destinatarios, activo, umbral_errores_hora, horas_pendientes, updated_at, updated_by)
  VALUES (1, v_lista, coalesce(p_activo, true), p_umbral_errores_hora, p_horas_pendientes, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    destinatarios = EXCLUDED.destinatarios, activo = EXCLUDED.activo,
    umbral_errores_hora = EXCLUDED.umbral_errores_hora, horas_pendientes = EXCLUDED.horas_pendientes,
    updated_at = now(), updated_by = auth.uid();
  RETURN (SELECT to_jsonb(c) FROM public.alertas_config c WHERE id = 1);
END
$fn$;
REVOKE ALL ON FUNCTION public.admin_guardar_alertas_config(text[], boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_guardar_alertas_config(text[], boolean, integer, integer) TO authenticated, service_role;

-- ─── 4. Lecturas para el panel y la alerta ───────────────────────────────────────────
-- Errores agrupados por origen + mensaje + empresa en las últimas p_horas (máx. 200 grupos).
CREATE OR REPLACE FUNCTION public.admin_salud_errores(p_horas integer DEFAULT 24)
RETURNS TABLE (
  origen text, mensaje text, empresa_id uuid, empresa_nombre text,
  conteo bigint, usuarios bigint, ultima timestamptz, version text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public._salud_es_privilegiado() THEN
    RAISE EXCEPTION 'Solo super admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.origen, a.mensaje, a.empresa_id, max(e.nombre)::text,
         count(*), count(DISTINCT a.user_id), max(a.created_at),
         (array_agg(a.version ORDER BY a.created_at DESC))[1]
    FROM public.app_errores a
    LEFT JOIN public.empresas e ON e.id = a.empresa_id
   WHERE a.created_at > now() - make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 720))
   GROUP BY a.origen, a.mensaje, a.empresa_id
   ORDER BY max(a.created_at) DESC
   LIMIT 200;
END
$fn$;
REVOKE ALL ON FUNCTION public.admin_salud_errores(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salud_errores(integer) TO authenticated, service_role;

-- Dispositivos con pendientes o fallidas (máx. 500), con horas desde el último sync correcto.
CREATE OR REPLACE FUNCTION public.admin_salud_dispositivos()
RETURNS TABLE (
  dispositivo_id text, empresa_id uuid, empresa_nombre text, user_id uuid, usuario text,
  plataforma text, version text, pendientes integer, fallidas integer,
  ultimo_sync_ok timestamptz, ultimo_error text, updated_at timestamptz, horas_sin_sync numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public._salud_es_privilegiado() THEN
    RAISE EXCEPTION 'Solo super admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT d.dispositivo_id, d.empresa_id, e.nombre::text, d.user_id,
         (SELECT p.nombre::text FROM public.profiles p WHERE p.user_id = d.user_id LIMIT 1),
         d.plataforma, d.version, d.pendientes, d.fallidas, d.ultimo_sync_ok, d.ultimo_error, d.updated_at,
         round((extract(epoch FROM now() - coalesce(d.ultimo_sync_ok, d.created_at)) / 3600)::numeric, 1)
    FROM public.dispositivos_sync d
    LEFT JOIN public.empresas e ON e.id = d.empresa_id
   WHERE d.pendientes > 0 OR d.fallidas > 0
   ORDER BY d.fallidas DESC, coalesce(d.ultimo_sync_ok, d.created_at) ASC
   LIMIT 500;
END
$fn$;
REVOKE ALL ON FUNCTION public.admin_salud_dispositivos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salud_dispositivos() TO authenticated, service_role;

-- Estado de los crons (pg_cron) y respuestas HTTP con error (pg_net) de las últimas p_horas.
-- Los «Timeout of 5000 ms» de pg_net NO son fallas (la función sigue corriendo); se cuentan aparte.
CREATE OR REPLACE FUNCTION public.admin_salud_crons(p_horas integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_desde timestamptz := now() - make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 168));
  v_jobs jsonb := '[]'::jsonb;
  v_fallas jsonb := '[]'::jsonb;
  v_http jsonb := '[]'::jsonb;
  v_timeouts int := 0;
  v_cron boolean := true;
  v_net boolean := true;
BEGIN
  IF NOT public._salud_es_privilegiado() THEN
    RAISE EXCEPTION 'Solo super admin' USING ERRCODE = '42501';
  END IF;

  BEGIN
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'jobname'), '[]'::jsonb) INTO v_jobs FROM (
      SELECT jsonb_build_object(
        'jobid', j.jobid, 'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'ultima_corrida', r.start_time, 'ultimo_status', r.status,
        'ultimo_error', CASE WHEN r.status = 'failed' THEN left(r.return_message, 300) END,
        'fallas', (SELECT count(*) FROM cron.job_run_details f
                    WHERE f.jobid = j.jobid AND f.status = 'failed' AND f.start_time > v_desde)
      ) AS x
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT d.start_time, d.status, d.return_message FROM cron.job_run_details d
         WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1
      ) r ON true
    ) s;
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'start_time' DESC), '[]'::jsonb) INTO v_fallas FROM (
      SELECT jsonb_build_object(
        'runid', d.runid, 'jobid', d.jobid, 'jobname', j.jobname, 'start_time', d.start_time,
        'mensaje', left(d.return_message, 300)) AS x
        FROM cron.job_run_details d
        LEFT JOIN cron.job j ON j.jobid = d.jobid
       WHERE d.status = 'failed' AND d.start_time > v_desde
       ORDER BY d.start_time DESC
       LIMIT 50
    ) s;
  EXCEPTION WHEN undefined_table OR invalid_schema_name OR insufficient_privilege THEN
    v_cron := false;
  END;

  BEGIN
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'created' DESC), '[]'::jsonb) INTO v_http FROM (
      SELECT jsonb_build_object(
        'id', h.id, 'status_code', h.status_code, 'created', h.created,
        'mensaje', left(coalesce(h.error_msg, h.content::text, ''), 200)) AS x
        FROM net._http_response h
       WHERE h.created > v_desde
         AND (h.status_code >= 400 OR (h.status_code IS NULL AND h.error_msg NOT ILIKE 'Timeout of%'))
       ORDER BY h.created DESC
       LIMIT 50
    ) s;
    SELECT count(*) INTO v_timeouts FROM net._http_response h
     WHERE h.created > v_desde AND h.status_code IS NULL AND h.error_msg ILIKE 'Timeout of%';
  EXCEPTION WHEN undefined_table OR invalid_schema_name OR insufficient_privilege THEN
    v_net := false;
  END;

  RETURN jsonb_build_object(
    'cron_disponible', v_cron, 'net_disponible', v_net, 'desde', v_desde, 'generado_en', now(),
    'jobs', v_jobs, 'fallas', v_fallas, 'http_errores', v_http, 'http_timeouts', v_timeouts);
END
$fn$;
REVOKE ALL ON FUNCTION public.admin_salud_crons(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salud_crons(integer) TO authenticated, service_role;

-- ─── 5. Purga y crons ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purgar_observabilidad()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_err int; v_alr int; v_dis int;
BEGIN
  IF NOT public._salud_es_privilegiado() THEN
    RAISE EXCEPTION 'Solo super admin' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.app_errores WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_err = ROW_COUNT;
  DELETE FROM public.alertas_enviadas WHERE enviado_at < now() - interval '90 days';
  GET DIAGNOSTICS v_alr = ROW_COUNT;
  DELETE FROM public.dispositivos_sync WHERE updated_at < now() - interval '90 days';
  GET DIAGNOSTICS v_dis = ROW_COUNT;
  RETURN jsonb_build_object('app_errores', v_err, 'alertas_enviadas', v_alr, 'dispositivos_sync', v_dis);
END
$fn$;
REVOKE ALL ON FUNCTION public.purgar_observabilidad() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_observabilidad() TO service_role;

-- Crons (solo si pg_cron existe; en local sin pg_cron se omiten). Minutos no redondos.
-- La alerta lee CRON_SECRET de Vault (igual que los crons de cobro); la función valida x-cron-secret.
DO $crons$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    RAISE NOTICE 'D-064: pg_cron no disponible; crons omitidos';
    RETURN;
  END IF;
  PERFORM cron.schedule('observabilidad-purga-diaria', '41 3 * * *',
    $cmd$select public.purgar_observabilidad();$cmd$);
  PERFORM cron.schedule('alertas-salud-horaria', '17 * * * *', $cmd$
    select net.http_post(
      url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/alertas-salud',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)),
      body := jsonb_build_object('source', 'cron', 'at', now()::text));
  $cmd$);
END
$crons$;
