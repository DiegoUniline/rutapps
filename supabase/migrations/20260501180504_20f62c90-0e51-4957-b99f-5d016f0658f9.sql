-- List inactive/expired empresas for super admin cleanup
CREATE OR REPLACE FUNCTION public.get_inactive_empresas(
  p_dias_inactivo int DEFAULT 30,
  p_dias_vencido int DEFAULT 30
)
RETURNS TABLE (
  empresa_id uuid,
  nombre text,
  email text,
  telefono text,
  owner_email text,
  empresa_created_at timestamptz,
  status text,
  trial_ends_at timestamptz,
  fecha_vencimiento date,
  current_period_end timestamptz,
  last_sign_in_at timestamptz,
  last_venta_at timestamptz,
  dias_sin_actividad int,
  dias_vencido int,
  motivo text,
  total_ventas bigint,
  total_clientes bigint,
  total_usuarios bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de super administrador';
  END IF;

  RETURN QUERY
  WITH last_act AS (
    SELECT p.empresa_id,
           MAX(u.last_sign_in_at) AS last_sign_in_at
    FROM profiles p
    JOIN auth.users u ON u.id = p.user_id
    GROUP BY p.empresa_id
  ),
  ventas_act AS (
    SELECT empresa_id, MAX(created_at) AS last_venta_at, COUNT(*) AS total_ventas
    FROM ventas GROUP BY empresa_id
  ),
  clientes_count AS (
    SELECT empresa_id, COUNT(*) AS total_clientes FROM clientes GROUP BY empresa_id
  ),
  usuarios_count AS (
    SELECT empresa_id, COUNT(*) AS total_usuarios FROM profiles GROUP BY empresa_id
  )
  SELECT
    e.id,
    e.nombre,
    e.email,
    e.telefono,
    (SELECT u.email FROM auth.users u WHERE u.id = e.owner_user_id) AS owner_email,
    e.created_at,
    s.status,
    s.trial_ends_at,
    s.fecha_vencimiento,
    s.current_period_end,
    la.last_sign_in_at,
    va.last_venta_at,
    GREATEST(
      0,
      EXTRACT(DAY FROM (now() - COALESCE(la.last_sign_in_at, va.last_venta_at, e.created_at)))::int
    ) AS dias_sin_actividad,
    CASE
      WHEN s.fecha_vencimiento IS NOT NULL AND s.fecha_vencimiento < CURRENT_DATE
        THEN (CURRENT_DATE - s.fecha_vencimiento)::int
      WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at < now()
        THEN EXTRACT(DAY FROM (now() - s.trial_ends_at))::int
      ELSE 0
    END AS dias_vencido,
    (CASE
      WHEN s.status IN ('suspended','cancelada') THEN 'Suscripción ' || s.status
      WHEN s.fecha_vencimiento IS NOT NULL AND s.fecha_vencimiento < (CURRENT_DATE - p_dias_vencido)
        THEN 'Vencida hace ' || (CURRENT_DATE - s.fecha_vencimiento)::int || ' días'
      WHEN s.status = 'trial' AND s.trial_ends_at < (now() - (p_dias_vencido || ' days')::interval)
        THEN 'Trial expirado hace ' || EXTRACT(DAY FROM (now() - s.trial_ends_at))::int || ' días'
      WHEN COALESCE(la.last_sign_in_at, va.last_venta_at, e.created_at) < (now() - (p_dias_inactivo || ' days')::interval)
        THEN 'Sin actividad hace ' || EXTRACT(DAY FROM (now() - COALESCE(la.last_sign_in_at, va.last_venta_at, e.created_at)))::int || ' días'
      ELSE 'N/A'
    END)::text AS motivo,
    COALESCE(va.total_ventas, 0)::bigint,
    COALESCE(cc.total_clientes, 0)::bigint,
    COALESCE(uc.total_usuarios, 0)::bigint
  FROM empresas e
  LEFT JOIN subscriptions s ON s.empresa_id = e.id
  LEFT JOIN last_act la ON la.empresa_id = e.id
  LEFT JOIN ventas_act va ON va.empresa_id = e.id
  LEFT JOIN clientes_count cc ON cc.empresa_id = e.id
  LEFT JOIN usuarios_count uc ON uc.empresa_id = e.id
  WHERE
    -- Skip manual subscriptions (paid offline)
    COALESCE(s.es_manual, false) = false
    AND (
      -- Inactive: no sign-in in N days
      COALESCE(la.last_sign_in_at, va.last_venta_at, e.created_at) < (now() - (p_dias_inactivo || ' days')::interval)
      -- OR expired subscription
      OR (s.fecha_vencimiento IS NOT NULL AND s.fecha_vencimiento < (CURRENT_DATE - p_dias_vencido))
      -- OR expired trial
      OR (s.status = 'trial' AND s.trial_ends_at < (now() - (p_dias_vencido || ' days')::interval))
      -- OR cancelled/suspended
      OR s.status IN ('suspended', 'cancelada')
    )
  ORDER BY COALESCE(la.last_sign_in_at, va.last_venta_at, e.created_at) ASC;
END;
$$;

-- Bulk delete with cascade + blacklist
CREATE OR REPLACE FUNCTION public.delete_empresas_bulk(
  p_empresa_ids uuid[],
  p_deleted_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_ok int := 0;
  v_err int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de super administrador';
  END IF;

  FOREACH v_id IN ARRAY p_empresa_ids LOOP
    BEGIN
      PERFORM public.delete_empresa_cascade(v_id, p_deleted_by);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('empresa_id', v_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('eliminadas', v_ok, 'fallidas', v_err, 'errores', v_errors);
END;
$$;