BEGIN;

CREATE OR REPLACE FUNCTION public.fn_team_portal_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_me uuid; v_result jsonb;
BEGIN
  SELECT tm.person_id INTO v_me
  FROM public.platform_team_members tm
  JOIN public.commission_people cp ON cp.id = tm.person_id
  WHERE tm.user_id = auth.uid()
    AND tm.status IN ('invited','active')
    AND cp.is_active = true;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Acceso de equipo no disponible' USING ERRCODE = '42501';
  END IF;

  UPDATE public.platform_team_members tm
  SET last_access_at = now(), status = 'active'
  WHERE tm.person_id = v_me;

  WITH visible AS MATERIALIZED (
    SELECT public.get_team_visible_people(auth.uid()) AS id
  ),
  member_rows AS MATERIALIZED (
    SELECT cp.id, cp.name, cp.email, cp.phone, cp.manager_id, manager.name AS manager_name,
      tm.job_title, tm.access_level, tm.access_scope, tm.commission_mode,
      tm.commission_pct, tm.commission_payment_limit, tm.commission_fixed_amount
    FROM visible v
    JOIN public.commission_people cp ON cp.id = v.id
    JOIN public.platform_team_members tm ON tm.person_id = cp.id
    LEFT JOIN public.commission_people manager ON manager.id = cp.manager_id
  ),
  lead_base AS MATERIALIZED (
    SELECT
      e.id AS empresa_id,
      e.nombre,
      e.licencia,
      e.email,
      e.telefono,
      lead.stage,
      lead.assigned_to,
      cp.name AS assigned_name,
      lead.next_follow_up_at,
      lead.last_contact_at,
      lead.contact_attempts,
      lead.notes,
      lead.lost_at,
      lead.lost_reason,
      NULLIF(to_jsonb(e)->>'created_at','')::timestamptz AS created_at,
      GREATEST(0, floor(EXTRACT(EPOCH FROM (now() - COALESCE(NULLIF(to_jsonb(e)->>'created_at','')::timestamptz, now()))) / 86400))::integer AS age_days,
      (SELECT count(*)::integer FROM public.productos p WHERE p.empresa_id = e.id) AS products,
      (SELECT count(*)::integer FROM public.clientes c WHERE c.empresa_id = e.id) AS clients,
      (SELECT count(*)::integer FROM public.ventas s WHERE s.empresa_id = e.id) AS sales,
      (SELECT count(*)::integer FROM public.ventas s WHERE s.empresa_id = e.id AND COALESCE(to_jsonb(s)->>'estado','') IN ('borrador','draft')) AS draft_sales,
      (SELECT count(*)::integer FROM public.profiles pr WHERE pr.empresa_id = e.id) AS users,
      COALESCE((
        SELECT COALESCE(to_jsonb(s)->>'status', to_jsonb(s)->>'estado')
        FROM public.subscriptions s
        WHERE s.empresa_id = e.id
        ORDER BY NULLIF(to_jsonb(s)->>'created_at','')::timestamptz DESC NULLS LAST
        LIMIT 1
      ), 'sin_suscripcion') AS subscription_status,
      (NULLIF(to_jsonb(lead)->>'coupon_id','') IS NOT NULL) AS coupon_active,
      COALESCE(NULLIF(to_jsonb(lead)->>'activation_score','')::integer,
        LEAST(100,
          CASE WHEN EXISTS (SELECT 1 FROM public.productos p WHERE p.empresa_id=e.id) THEN 25 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM public.clientes c WHERE c.empresa_id=e.id) THEN 20 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM public.ventas s WHERE s.empresa_id=e.id) THEN 35 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.empresa_id=e.id) THEN 20 ELSE 0 END
        )
      ) AS activation_score
    FROM public.admin_trial_crm_leads lead
    JOIN visible v ON v.id = lead.assigned_to
    JOIN public.empresas e ON e.id = lead.empresa_id
    LEFT JOIN public.commission_people cp ON cp.id = lead.assigned_to
  ),
  lead_rows AS MATERIALIZED (
    SELECT lb.*,
      COALESCE(NULLIF(to_jsonb(l)->>'setup_level',''),
        CASE
          WHEN lb.activation_score >= 70 THEN 'casi_listo'
          WHEN lb.activation_score > 0 THEN 'exploro'
          ELSE 'sin_configurar'
        END
      ) AS setup_level
    FROM lead_base lb
    JOIN public.admin_trial_crm_leads l ON l.empresa_id = lb.empresa_id
  ),
  company_rows AS MATERIALIZED (
    SELECT e.id AS empresa_id, e.nombre, e.licencia, e.email, e.telefono,
      cca.managed_by_id, managed.name AS managed_by_name,
      cca.commissioned_by_id, commissioned.name AS commissioned_by_name,
      (pa.id IS NOT NULL) AS has_partner,
      COALESCE((SELECT sum(f.total) FROM public.facturas f WHERE f.empresa_id=e.id AND f.estado='pagada'),0) AS paid_total
    FROM public.commission_client_attributions cca
    JOIN public.empresas e ON e.id = cca.empresa_id
    LEFT JOIN public.commission_people managed ON managed.id = cca.managed_by_id
    LEFT JOIN public.commission_people commissioned ON commissioned.id = cca.commissioned_by_id
    LEFT JOIN public.partner_atribuciones pa ON pa.empresa_id = e.id
    WHERE cca.managed_by_id IN (SELECT id FROM visible)
       OR cca.commissioned_by_id IN (SELECT id FROM visible)
  ),
  commission_rows AS MATERIALIZED (
    SELECT ice.*, cp.name AS person_name, e.nombre AS empresa_nombre
    FROM public.internal_commission_entries ice
    JOIN visible v ON v.id = ice.person_id
    JOIN public.commission_people cp ON cp.id = ice.person_id
    JOIN public.empresas e ON e.id = ice.empresa_id
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'me_id', v_me,
    'me', (SELECT to_jsonb(m) FROM member_rows m WHERE m.id = v_me),
    'metrics', jsonb_build_object(
      'active_leads', (SELECT count(*) FROM lead_rows WHERE stage NOT IN ('no_interesado','descartado','convertido')),
      'followups_due', (SELECT count(*) FROM lead_rows WHERE next_follow_up_at < now() AND stage NOT IN ('no_interesado','descartado','convertido')),
      'companies', (SELECT count(*) FROM company_rows),
      'contacts_30d', (SELECT count(*) FROM public.admin_trial_crm_activities a WHERE a.created_by = auth.uid() AND a.activity_type IN ('call','whatsapp','email') AND a.created_at >= now()-interval '30 days'),
      'commission_pending', (SELECT COALESCE(sum(commission_amount),0) FROM commission_rows WHERE status IN ('pending','approved')),
      'commission_paid', (SELECT COALESCE(sum(commission_amount),0) FROM commission_rows WHERE status='paid')
    ),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.name) FROM member_rows m),'[]'::jsonb),
    'leads', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.next_follow_up_at NULLS LAST, l.nombre) FROM lead_rows l),'[]'::jsonb),
    'companies', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.nombre) FROM company_rows c),'[]'::jsonb),
    'commissions', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM commission_rows c),'[]'::jsonb),
    'activities', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
        SELECT a.id, a.empresa_id, e.nombre AS empresa_nombre, a.activity_type, a.outcome,
          a.note, a.new_stage, a.created_at, cp.name AS person_name
        FROM public.admin_trial_crm_activities a
        JOIN public.empresas e ON e.id = a.empresa_id
        LEFT JOIN public.platform_team_members tm ON tm.user_id = a.created_by
        LEFT JOIN public.commission_people cp ON cp.id = tm.person_id
        WHERE a.created_by IN (
          SELECT tm2.user_id FROM public.platform_team_members tm2
          WHERE tm2.person_id IN (SELECT id FROM visible)
        )
        ORDER BY a.created_at DESC
        LIMIT 300
      ) x
    ),'[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_team_portal_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_team_portal_snapshot() TO authenticated;

COMMIT;
