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
    SELECT p.empresa_id AS emp_id,
           MAX(u.last_sign_in_at) AS last_sign_in_at
    FROM profiles p
    JOIN auth.users u ON u.id = p.user_id
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
      e.id AS emp_id,
      e.nombre,
      e.email,
      e.telefono,
      e.owner_user_id,
      e.created_at AS empresa_created_at,
      s.status,
      s.trial_ends_at,
      s.fecha_vencimiento,
      s.current_period_end,
      COALESCE(s.es_manual, false) AS es_manual,
      la.last_sign_in_at,
      va.last_venta_at,
      va.total_ventas,
      cc.total_clientes,
      uc.total_usuarios,
      -- ultima actividad real: login o venta (NO usar created_at que infla)
      GREATEST(la.last_sign_in_at, va.last_venta_at) AS ultima_actividad_real,
      -- dias vencido segun fecha_vencimiento o trial
      CASE
        WHEN s.fecha_vencimiento IS NOT NULL AND s.fecha_vencimiento < CURRENT_DATE
          THEN (CURRENT_DATE - s.fecha_vencimiento)::int
        WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at < now()
          THEN FLOOR(EXTRACT(EPOCH FROM (now() - s.trial_ends_at)) / 86400)::int
        ELSE 0
      END AS dias_venc_calc
    FROM empresas e
    LEFT JOIN subscriptions s ON s.empresa_id = e.id
    LEFT JOIN last_act la ON la.emp_id = e.id
    LEFT JOIN ventas_act va ON va.emp_id = e.id
    LEFT JOIN clientes_count cc ON cc.emp_id = e.id
    LEFT JOIN usuarios_count uc ON uc.emp_id = e.id
  )
  SELECT
    b.emp_id::uuid,
    b.nombre::text,
    b.email::text,
    b.telefono::text,
    (SELECT u.email::text FROM auth.users u WHERE u.id = b.owner_user_id) AS owner_email,
    b.empresa_created_at::timestamptz,
    b.status::text,
    b.trial_ends_at::timestamptz,
    b.fecha_vencimiento::date,
    b.current_period_end::timestamptz,
    b.last_sign_in_at::timestamptz,
    b.last_venta_at::timestamptz,
    COALESCE(
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - b.ultima_actividad_real)) / 86400)::int),
      9999
    )::int AS dias_sin_actividad,
    b.dias_venc_calc::int AS dias_vencido,
    (CASE
      WHEN b.dias_venc_calc >= p_dias_vencido AND b.fecha_vencimiento IS NOT NULL
        THEN 'Vencida hace ' || b.dias_venc_calc || ' días'
      WHEN b.dias_venc_calc >= p_dias_vencido AND b.status = 'trial'
        THEN 'Trial expirado hace ' || b.dias_venc_calc || ' días'
      WHEN b.ultima_actividad_real IS NOT NULL
           AND b.ultima_actividad_real < (now() - (p_dias_inactivo || ' days')::interval)
        THEN 'Sin actividad hace ' || FLOOR(EXTRACT(EPOCH FROM (now() - b.ultima_actividad_real)) / 86400)::int || ' días'
      WHEN b.ultima_actividad_real IS NULL
           AND b.empresa_created_at < (now() - (p_dias_inactivo || ' days')::interval)
        THEN 'Nunca usó la app (creada hace ' || FLOOR(EXTRACT(EPOCH FROM (now() - b.empresa_created_at)) / 86400)::int || ' días)'
      ELSE 'N/A'
    END)::text AS motivo,
    COALESCE(b.total_ventas, 0)::bigint,
    COALESCE(b.total_clientes, 0)::bigint,
    COALESCE(b.total_usuarios, 0)::bigint
  FROM base b
  WHERE
    b.es_manual = false
    AND (
      -- Inactivo: tiene actividad pero hace mas de N dias
      (b.ultima_actividad_real IS NOT NULL
        AND b.ultima_actividad_real < (now() - (p_dias_inactivo || ' days')::interval))
      -- Nunca uso: sin login ni venta y empresa creada hace mas de N dias
      OR (b.ultima_actividad_real IS NULL
        AND b.empresa_created_at < (now() - (p_dias_inactivo || ' days')::interval))
      -- Vencido: suscripcion vencida hace mas de N dias
      OR (b.dias_venc_calc >= p_dias_vencido)
    )
  ORDER BY COALESCE(b.ultima_actividad_real, b.empresa_created_at) ASC;
END;
$function$;