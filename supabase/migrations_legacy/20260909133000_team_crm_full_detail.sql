BEGIN;

CREATE OR REPLACE FUNCTION public.fn_team_crm_detail(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_visible boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_trial_crm_leads lead
    WHERE lead.empresa_id = p_empresa_id
      AND lead.assigned_to IN (SELECT public.get_team_visible_people(auth.uid()))
  ) INTO v_visible;

  IF NOT v_visible THEN
    RAISE EXCEPTION 'Este prospecto no pertenece a tu cartera' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'company', COALESCE((
      SELECT to_jsonb(e) FROM public.empresas e WHERE e.id = p_empresa_id
    ), '{}'::jsonb),
    'lead', COALESCE((
      SELECT to_jsonb(l) || jsonb_build_object(
        'assigned_name', assigned.name,
        'lost_by_name', lost_person.name
      )
      FROM public.admin_trial_crm_leads l
      LEFT JOIN public.commission_people assigned ON assigned.id = l.assigned_to
      LEFT JOIN public.platform_team_members lost_tm ON lost_tm.user_id = l.lost_by
      LEFT JOIN public.commission_people lost_person ON lost_person.id = lost_tm.person_id
      WHERE l.empresa_id = p_empresa_id
    ), '{}'::jsonb),
    'summary', jsonb_build_object(
      'products', (SELECT count(*) FROM public.productos p WHERE p.empresa_id = p_empresa_id),
      'clients', (SELECT count(*) FROM public.clientes c WHERE c.empresa_id = p_empresa_id),
      'users', (SELECT count(*) FROM public.profiles p WHERE p.empresa_id = p_empresa_id),
      'sales', (SELECT count(*) FROM public.ventas v WHERE v.empresa_id = p_empresa_id),
      'invoices', (SELECT count(*) FROM public.facturas f WHERE f.empresa_id = p_empresa_id),
      'paid_invoices', (SELECT count(*) FROM public.facturas f WHERE f.empresa_id = p_empresa_id AND f.estado = 'pagada'),
      'paid_total', (SELECT COALESCE(sum(f.total), 0) FROM public.facturas f WHERE f.empresa_id = p_empresa_id AND f.estado = 'pagada'),
      'activities', (SELECT count(*) FROM public.admin_trial_crm_activities a WHERE a.empresa_id = p_empresa_id)
    ),
    'subscriptions', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
      FROM public.subscriptions s WHERE s.empresa_id = p_empresa_id
    ), '[]'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT f.* FROM public.facturas f
        WHERE f.empresa_id = p_empresa_id
        ORDER BY f.created_at DESC LIMIT 100
      ) x
    ), '[]'::jsonb),
    'activities', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT a.id, a.empresa_id, a.activity_type, a.outcome, a.note,
          a.previous_stage, a.new_stage, a.created_at, a.created_by,
          COALESCE(person.name, CASE WHEN a.created_by IS NULL THEN 'Sistema' ELSE 'Usuario' END) AS actor_name
        FROM public.admin_trial_crm_activities a
        LEFT JOIN public.platform_team_members tm ON tm.user_id = a.created_by
        LEFT JOIN public.commission_people person ON person.id = tm.person_id
        WHERE a.empresa_id = p_empresa_id
        ORDER BY a.created_at DESC
        LIMIT 1000
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_team_crm_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_detail(uuid) TO authenticated;

COMMIT;
