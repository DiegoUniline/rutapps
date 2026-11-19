BEGIN;

-- Cierre comercial reversible. No bloquea el acceso de la empresa ni modifica
-- Stripe: únicamente la saca del embudo activo y conserva evidencia auditable.
ALTER TABLE public.admin_trial_crm_leads
  ADD COLUMN IF NOT EXISTS lost_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lost_reason text;

CREATE INDEX IF NOT EXISTS admin_trial_crm_leads_lost_idx
  ON public.admin_trial_crm_leads(lost_at DESC)
  WHERE stage IN ('no_interesado', 'descartado');

CREATE INDEX IF NOT EXISTS admin_trial_crm_activities_created_idx
  ON public.admin_trial_crm_activities(created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_mark_lost(
  p_empresa_id uuid,
  p_reason text,
  p_outcome text DEFAULT 'No interesado'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_previous_stage text;
  v_coupon_id uuid;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_outcome text := COALESCE(NULLIF(btrim(p_outcome), ''), 'No interesado');
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Escribe un motivo de al menos 5 caracteres' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('borrador', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene ventas operativas y no pertenece a recuperación';
  END IF;

  SELECT stage, coupon_id INTO v_previous_stage, v_coupon_id
  FROM public.admin_trial_crm_leads
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  INSERT INTO public.admin_trial_crm_leads (
    empresa_id, stage, next_follow_up_at, notes, lost_at, lost_by,
    lost_reason, created_by, updated_by
  ) VALUES (
    p_empresa_id, 'no_interesado', NULL, v_reason, now(), auth.uid(),
    v_reason, auth.uid(), auth.uid()
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    stage = 'no_interesado',
    next_follow_up_at = NULL,
    notes = v_reason,
    lost_at = now(),
    lost_by = auth.uid(),
    lost_reason = v_reason,
    updated_by = auth.uid();

  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.cupones SET activo = false WHERE id = v_coupon_id;
  END IF;

  INSERT INTO public.admin_trial_crm_activities (
    empresa_id, activity_type, outcome, note, previous_stage, new_stage, created_by
  ) VALUES (
    p_empresa_id, 'stage', v_outcome, v_reason,
    COALESCE(v_previous_stage, 'sin_contactar'), 'no_interesado', auth.uid()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'empresa_id', p_empresa_id,
    'stage', 'no_interesado',
    'lost_at', now(),
    'coupon_revoked', v_coupon_id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_restore_lost(
  p_empresa_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_previous_stage text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  SELECT stage INTO v_previous_stage
  FROM public.admin_trial_crm_leads
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospecto no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_previous_stage NOT IN ('no_interesado', 'descartado') THEN
    RAISE EXCEPTION 'El prospecto no está en Perdidos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('borrador', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene ventas operativas y no debe volver a recuperación';
  END IF;

  UPDATE public.admin_trial_crm_leads SET
    stage = 'por_contactar',
    next_follow_up_at = now(),
    lost_at = NULL,
    lost_by = NULL,
    lost_reason = NULL,
    notes = COALESCE(NULLIF(btrim(p_note), ''), notes),
    updated_by = auth.uid()
  WHERE empresa_id = p_empresa_id;

  INSERT INTO public.admin_trial_crm_activities (
    empresa_id, activity_type, outcome, note, previous_stage, new_stage, created_by
  ) VALUES (
    p_empresa_id, 'stage', 'Reactivado en CRM', NULLIF(btrim(p_note), ''),
    v_previous_stage, 'por_contactar', auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'empresa_id', p_empresa_id, 'stage', 'por_contactar');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_log_contact(
  p_empresa_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_previous_stage text;
  v_new_stage text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF p_channel NOT IN ('call', 'whatsapp', 'email') THEN
    RAISE EXCEPTION 'Canal de contacto inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT stage INTO v_previous_stage
  FROM public.admin_trial_crm_leads
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  v_new_stage := CASE
    WHEN COALESCE(v_previous_stage, 'sin_contactar') = 'sin_contactar' THEN 'por_contactar'
    ELSE COALESCE(v_previous_stage, 'por_contactar')
  END;

  INSERT INTO public.admin_trial_crm_leads (
    empresa_id, stage, last_contact_at, contact_attempts, created_by, updated_by
  ) VALUES (
    p_empresa_id, v_new_stage, now(), 1, auth.uid(), auth.uid()
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    stage = CASE
      WHEN admin_trial_crm_leads.stage = 'sin_contactar' THEN 'por_contactar'
      ELSE admin_trial_crm_leads.stage
    END,
    last_contact_at = now(),
    contact_attempts = admin_trial_crm_leads.contact_attempts + 1,
    updated_by = auth.uid();

  INSERT INTO public.admin_trial_crm_activities (
    empresa_id, activity_type, outcome, previous_stage, new_stage, created_by
  ) VALUES (
    p_empresa_id, p_channel, 'Contacto iniciado desde CRM',
    COALESCE(v_previous_stage, 'sin_contactar'), v_new_stage, auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'empresa_id', p_empresa_id, 'channel', p_channel);
END;
$$;

-- Workspace agregado: reutiliza el snapshot probado y añade cierre comercial y
-- productividad real tomada de la bitácora inmutable del CRM.
CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_workspace(
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_days integer := LEAST(365, GREATEST(7, COALESCE(p_days, 30)));
  v_snapshot jsonb;
  v_leads jsonb;
  v_operations jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  v_snapshot := public.fn_admin_trial_crm_snapshot(0, 36500);

  SELECT COALESCE(jsonb_agg(
    item || jsonb_build_object(
      'lost_at', lead.lost_at,
      'lost_by', lead.lost_by,
      'lost_reason', lead.lost_reason,
      'lost_by_name', COALESCE(
        lost_profile.nombre,
        lost_user.raw_user_meta_data ->> 'full_name',
        lost_user.raw_user_meta_data ->> 'name',
        lost_user.email
      )
    ) ORDER BY ordinality
  ), '[]'::jsonb)
  INTO v_leads
  FROM jsonb_array_elements(COALESCE(v_snapshot -> 'leads', '[]'::jsonb))
    WITH ORDINALITY AS source(item, ordinality)
  LEFT JOIN public.admin_trial_crm_leads lead
    ON lead.empresa_id = (source.item ->> 'empresa_id')::uuid
  LEFT JOIN public.profiles lost_profile ON lost_profile.user_id = lead.lost_by
  LEFT JOIN auth.users lost_user ON lost_user.id = lead.lost_by;

  WITH activity AS MATERIALIZED (
    SELECT
      a.id,
      a.empresa_id,
      a.activity_type,
      a.outcome,
      a.note,
      a.previous_stage,
      a.new_stage,
      a.created_by,
      a.created_at,
      (a.created_at AT TIME ZONE 'America/Mexico_City')::date AS local_day,
      e.nombre AS empresa_nombre,
      COALESCE(
        profile.nombre,
        app_user.raw_user_meta_data ->> 'full_name',
        app_user.raw_user_meta_data ->> 'name',
        app_user.email,
        CASE WHEN a.created_by IS NULL THEN 'Sistema' ELSE 'Usuario sin nombre' END
      ) AS actor_name
    FROM public.admin_trial_crm_activities a
    JOIN public.empresas e ON e.id = a.empresa_id
    LEFT JOIN public.profiles profile ON profile.user_id = a.created_by
    LEFT JOIN auth.users app_user ON app_user.id = a.created_by
    WHERE a.created_at >= now() - make_interval(days => v_days)
  ),
  calendar AS MATERIALIZED (
    SELECT generate_series(
      (now() AT TIME ZONE 'America/Mexico_City')::date - (v_days - 1),
      (now() AT TIME ZONE 'America/Mexico_City')::date,
      interval '1 day'
    )::date AS day
  ),
  daily AS MATERIALIZED (
    SELECT
      a.local_day AS day,
      COUNT(*)::integer AS activities,
      COUNT(*) FILTER (WHERE a.activity_type IN ('call', 'whatsapp', 'email'))::integer AS contacts,
      COUNT(*) FILTER (WHERE a.activity_type = 'call')::integer AS calls,
      COUNT(*) FILTER (WHERE a.activity_type = 'whatsapp')::integer AS whatsapp,
      COUNT(*) FILTER (WHERE a.activity_type = 'email')::integer AS emails,
      COUNT(*) FILTER (WHERE a.activity_type = 'coupon')::integer AS offers,
      COUNT(*) FILTER (WHERE a.new_stage IN ('no_interesado', 'descartado'))::integer AS lost
    FROM activity a
    GROUP BY a.local_day
  ),
  team AS MATERIALIZED (
    SELECT
      a.created_by AS user_id,
      a.actor_name AS name,
      COUNT(*)::integer AS activities,
      COUNT(DISTINCT a.empresa_id)::integer AS leads_touched,
      COUNT(*) FILTER (WHERE a.activity_type IN ('call', 'whatsapp', 'email'))::integer AS contacts,
      COUNT(*) FILTER (WHERE a.activity_type = 'call')::integer AS calls,
      COUNT(*) FILTER (WHERE a.activity_type = 'whatsapp')::integer AS whatsapp,
      COUNT(*) FILTER (WHERE a.activity_type = 'email')::integer AS emails,
      COUNT(*) FILTER (WHERE a.activity_type = 'note')::integer AS notes,
      COUNT(*) FILTER (WHERE a.activity_type = 'coupon')::integer AS offers,
      COUNT(*) FILTER (WHERE a.new_stage = 'interesado')::integer AS interested,
      COUNT(*) FILTER (WHERE a.new_stage IN ('no_interesado', 'descartado'))::integer AS lost,
      MAX(a.created_at) AS last_activity_at
    FROM activity a
    GROUP BY a.created_by, a.actor_name
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'metrics', jsonb_build_object(
      'activities', (SELECT COUNT(*) FROM activity),
      'contacts', (SELECT COUNT(*) FROM activity WHERE activity_type IN ('call', 'whatsapp', 'email')),
      'calls', (SELECT COUNT(*) FROM activity WHERE activity_type = 'call'),
      'whatsapp', (SELECT COUNT(*) FROM activity WHERE activity_type = 'whatsapp'),
      'emails', (SELECT COUNT(*) FROM activity WHERE activity_type = 'email'),
      'notes', (SELECT COUNT(*) FROM activity WHERE activity_type = 'note'),
      'offers', (SELECT COUNT(*) FROM activity WHERE activity_type = 'coupon'),
      'leads_touched', (SELECT COUNT(DISTINCT empresa_id) FROM activity),
      'staff_active', (SELECT COUNT(DISTINCT created_by) FROM activity WHERE created_by IS NOT NULL),
      'interested', (SELECT COUNT(*) FROM activity WHERE new_stage = 'interesado'),
      'lost', (SELECT COUNT(*) FROM activity WHERE new_stage IN ('no_interesado', 'descartado'))
    ),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day', c.day,
        'activities', COALESCE(d.activities, 0),
        'contacts', COALESCE(d.contacts, 0),
        'calls', COALESCE(d.calls, 0),
        'whatsapp', COALESCE(d.whatsapp, 0),
        'emails', COALESCE(d.emails, 0),
        'offers', COALESCE(d.offers, 0),
        'lost', COALESCE(d.lost, 0)
      ) ORDER BY c.day)
      FROM calendar c LEFT JOIN daily d ON d.day = c.day
    ), '[]'::jsonb),
    'team', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.contacts DESC, t.activities DESC) FROM team t), '[]'::jsonb),
    'recent', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
      FROM (
        SELECT id, empresa_id, empresa_nombre, activity_type, outcome, note,
          previous_stage, new_stage, created_by, actor_name, created_at
        FROM activity ORDER BY created_at DESC LIMIT 200
      ) r
    ), '[]'::jsonb)
  ) INTO v_operations;

  RETURN v_snapshot || jsonb_build_object(
    'leads', v_leads,
    'operations', v_operations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_mark_lost(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_restore_lost(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_log_contact(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_workspace(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_mark_lost(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_restore_lost(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_log_contact(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_workspace(integer) TO authenticated;

COMMIT;
