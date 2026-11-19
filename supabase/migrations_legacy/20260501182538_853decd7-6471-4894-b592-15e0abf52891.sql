CREATE OR REPLACE FUNCTION public.get_inactive_empresas(p_dias_inactivo integer DEFAULT 30, p_dias_vencido integer DEFAULT 30)
 RETURNS TABLE(empresa_id uuid, nombre text, email text, telefono text, owner_email text, empresa_created_at timestamp with time zone, status text, trial_ends_at timestamp with time zone, fecha_vencimiento date, current_period_end timestamp with time zone, last_sign_in_at timestamp with time zone, last_venta_at timestamp with time zone, dias_sin_actividad integer, dias_vencido integer, motivo text, total_ventas bigint, total_clientes bigint, total_usuarios bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de super administrador';
  END IF;

  RETURN QUERY
  WITH last_act AS (
    SELECT p.empresa_id AS emp_id, MAX(u.last_sign_in_at) AS last_sign_in_at
    FROM profiles p JOIN auth.users u ON u.id = p.user_id
    GROUP BY p.empresa_id
  ),
  ventas_act AS (
    SELECT v.empresa_id AS emp_id, MAX(v.created_at) AS last_venta_at, COUNT(*)::bigint AS total_ventas
    FROM ventas v GROUP BY v.empresa_id
  ),
  clientes_count AS (
    SELECT c.empresa_id AS emp_id, COUNT(*)::bigint AS total_clientes FROM clientes c GROUP BY c.empresa_id
  ),
  usuarios_count AS (
    SELECT pr.empresa_id AS emp_id, COUNT(*)::bigint AS total_usuarios FROM profiles pr GROUP BY pr.empresa_id
  ),
  base AS (
    SELECT
      e.id AS emp_id, e.nombre, e.email, e.telefono, e.owner_user_id,
      e.created_at AS empresa_created_at,
      s.status, s.trial_ends_at, s.fecha_vencimiento, s.current_period_end,
      COALESCE(s.es_manual, false) AS es_manual,
      la.last_sign_in_at, va.last_venta_at,
      va.total_ventas, cc.total_clientes, uc.total_usuarios,
      GREATEST(la.last_sign_in_at, va.last_venta_at) AS ultima_actividad_real,
      -- VIGENCIA REAL: considera current_period_end primero, luego fecha_vencimiento, luego trial (solo si trial)
      CASE
        WHEN s.status = 'active' AND s.current_period_end IS NOT NULL AND s.current_period_end >= now()
          THEN 0  -- vigente
        WHEN s.status = 'active' AND s.current_period_end IS NOT NULL AND s.current_period_end < now()
          THEN FLOOR(EXTRACT(EPOCH FROM (now() - s.current_period_end)) / 86400)::int
        WHEN s.fecha_vencimiento IS NOT NULL AND s.fecha_vencimiento < CURRENT_DATE
          THEN (CURRENT_DATE - s.fecha_vencimiento)::int
        WHEN s.status = 'trial' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at < now()
          THEN FLOOR(EXTRACT(EPOCH FROM (now() - s.trial_ends_at)) / 86400)::int
        ELSE 0
      END AS dias_venc_calc,
      -- ¿está vigente?
      (s.status = 'active' AND COALESCE(s.current_period_end >= now(), false))
       OR (s.fecha_vencimiento IS NOT NULL AND s.fecha_vencimiento >= CURRENT_DATE)
       OR (s.status = 'trial' AND COALESCE(s.trial_ends_at >= now(), false))
       AS suscripcion_vigente
    FROM empresas e
    LEFT JOIN subscriptions s ON s.empresa_id = e.id
    LEFT JOIN last_act la ON la.emp_id = e.id
    LEFT JOIN ventas_act va ON va.emp_id = e.id
    LEFT JOIN clientes_count cc ON cc.emp_id = e.id
    LEFT JOIN usuarios_count uc ON uc.emp_id = e.id
  ),
  enriched AS (
    SELECT b.*,
      CASE
        WHEN b.ultima_actividad_real IS NOT NULL
          THEN FLOOR(EXTRACT(EPOCH FROM (now() - b.ultima_actividad_real)) / 86400)::int
        ELSE FLOOR(EXTRACT(EPOCH FROM (now() - b.empresa_created_at)) / 86400)::int
      END AS dias_inact_calc
    FROM base b
  )
  SELECT
    e2.emp_id::uuid, e2.nombre::text, e2.email::text, e2.telefono::text,
    (SELECT u.email::text FROM auth.users u WHERE u.id = e2.owner_user_id) AS owner_email,
    e2.empresa_created_at::timestamptz, e2.status::text,
    e2.trial_ends_at::timestamptz, e2.fecha_vencimiento::date, e2.current_period_end::timestamptz,
    e2.last_sign_in_at::timestamptz, e2.last_venta_at::timestamptz,
    GREATEST(0, e2.dias_inact_calc)::int AS dias_sin_actividad,
    e2.dias_venc_calc::int AS dias_vencido,
    (CASE
      WHEN e2.dias_inact_calc >= p_dias_inactivo AND e2.dias_venc_calc >= p_dias_vencido
        THEN 'Inactiva ' || e2.dias_inact_calc || 'd y vencida ' || e2.dias_venc_calc || 'd'
      WHEN e2.dias_inact_calc >= p_dias_inactivo AND e2.status IS NULL
        THEN 'Inactiva ' || e2.dias_inact_calc || 'd, sin suscripción'
      WHEN e2.dias_inact_calc >= p_dias_inactivo AND e2.status IN ('suspended','cancelada')
        THEN 'Inactiva ' || e2.dias_inact_calc || 'd, suscripción ' || e2.status
      ELSE 'N/A'
    END)::text AS motivo,
    COALESCE(e2.total_ventas, 0)::bigint,
    COALESCE(e2.total_clientes, 0)::bigint,
    COALESCE(e2.total_usuarios, 0)::bigint
  FROM enriched e2
  WHERE
    e2.es_manual = false
    AND COALESCE(e2.suscripcion_vigente, false) = false  -- excluir empresas con suscripción vigente
    AND e2.dias_inact_calc >= p_dias_inactivo
    AND (
      e2.dias_venc_calc >= p_dias_vencido
      OR e2.status IS NULL
      OR e2.status IN ('suspended','cancelada')
    )
  ORDER BY e2.dias_inact_calc DESC;
END;
$function$;