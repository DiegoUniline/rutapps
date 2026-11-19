BEGIN;

-- CRM interno para recuperar empresas que terminaron el registro pero nunca
-- realizaron una venta operativa. No modifica suscripciones ni datos del tenant.
CREATE TABLE IF NOT EXISTS public.admin_trial_crm_leads (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'sin_contactar' CHECK (stage IN (
    'sin_contactar', 'por_contactar', 'contactado', 'interesado', 'seguimiento',
    'no_localizado', 'no_interesado', 'descartado', 'convertido'
  )),
  assigned_to uuid REFERENCES public.commission_people(id) ON DELETE SET NULL,
  next_follow_up_at timestamptz,
  last_contact_at timestamptz,
  contact_attempts integer NOT NULL DEFAULT 0 CHECK (contact_attempts >= 0),
  notes text,
  coupon_id uuid REFERENCES public.cupones(id) ON DELETE SET NULL,
  coupon_assigned_at timestamptz,
  converted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_trial_crm_leads_stage_idx
  ON public.admin_trial_crm_leads(stage, next_follow_up_at);
CREATE INDEX IF NOT EXISTS admin_trial_crm_leads_assigned_idx
  ON public.admin_trial_crm_leads(assigned_to, stage);

CREATE TABLE IF NOT EXISTS public.admin_trial_crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN (
    'note', 'call', 'whatsapp', 'email', 'stage', 'assignment', 'coupon', 'system'
  )),
  outcome text,
  note text,
  previous_stage text,
  new_stage text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_trial_crm_activities_company_idx
  ON public.admin_trial_crm_activities(empresa_id, created_at DESC);

-- Esta bitácora sobrevive a la depuración de la empresa. Conserva únicamente
-- evidencia administrativa mínima, no información operativa del tenant.
CREATE TABLE IF NOT EXISTS public.admin_trial_crm_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  empresa_nombre text NOT NULL,
  licencia text,
  email text,
  telefono text,
  age_days integer NOT NULL,
  reason text NOT NULL,
  snapshot jsonb NOT NULL,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_trial_crm_deletions_date_idx
  ON public.admin_trial_crm_deletions(deleted_at DESC);

ALTER TABLE public.admin_trial_crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_trial_crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_trial_crm_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_trial_crm_leads_super_admin ON public.admin_trial_crm_leads;
CREATE POLICY admin_trial_crm_leads_super_admin ON public.admin_trial_crm_leads
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_trial_crm_activities_super_admin ON public.admin_trial_crm_activities;
CREATE POLICY admin_trial_crm_activities_super_admin ON public.admin_trial_crm_activities
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_trial_crm_deletions_super_admin ON public.admin_trial_crm_deletions;
CREATE POLICY admin_trial_crm_deletions_super_admin ON public.admin_trial_crm_deletions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS admin_trial_crm_leads_updated_at ON public.admin_trial_crm_leads;
CREATE TRIGGER admin_trial_crm_leads_updated_at
  BEFORE UPDATE ON public.admin_trial_crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Un solo agregado para el panel completo. Se excluyen sandboxes de partners y
-- las ventas borrador/canceladas/saldos iniciales no cuentan como uso real.
CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_snapshot(
  p_min_age_days integer DEFAULT 0,
  p_max_age_days integer DEFAULT 3650
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_min_age integer := GREATEST(0, COALESCE(p_min_age_days, 0));
  v_max_age integer := LEAST(36500, GREATEST(v_min_age, COALESCE(p_max_age_days, 3650)));
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  WITH sale_stats AS MATERIALIZED (
    SELECT
      v.empresa_id,
      COUNT(*)::integer AS all_sales,
      COUNT(*) FILTER (
        WHERE COALESCE(v.es_saldo_inicial, false) = false
          AND v.status::text NOT IN ('borrador', 'cancelado')
      )::integer AS valid_sales,
      COUNT(*) FILTER (WHERE v.status::text = 'borrador')::integer AS draft_sales,
      MAX(v.created_at) AS last_sale_record_at
    FROM public.ventas v
    GROUP BY v.empresa_id
  ),
  product_stats AS MATERIALIZED (
    SELECT p.empresa_id, COUNT(*)::integer AS products,
      COUNT(*) FILTER (WHERE p.status::text = 'activo')::integer AS active_products,
      MAX(p.created_at) AS last_product_at
    FROM public.productos p GROUP BY p.empresa_id
  ),
  client_stats AS MATERIALIZED (
    SELECT c.empresa_id, COUNT(*)::integer AS clients, MAX(c.created_at) AS last_client_at
    FROM public.clientes c GROUP BY c.empresa_id
  ),
  profile_stats AS MATERIALIZED (
    SELECT p.empresa_id, COUNT(*)::integer AS users,
      MAX(u.last_sign_in_at) AS last_sign_in_at,
      MIN(u.email) FILTER (WHERE p.user_id = e.owner_user_id) AS owner_email
    FROM public.profiles p
    JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN auth.users u ON u.id = p.user_id
    GROUP BY p.empresa_id
  ),
  invoice_stats AS MATERIALIZED (
    SELECT f.empresa_id,
      COUNT(*)::integer AS invoices,
      COUNT(*) FILTER (WHERE lower(COALESCE(f.estado, '')) = 'pagada')::integer AS paid_invoices,
      COALESCE(SUM(f.total) FILTER (WHERE lower(COALESCE(f.estado, '')) = 'pagada'), 0)::numeric AS paid_total,
      MAX(f.fecha_pago) FILTER (WHERE lower(COALESCE(f.estado, '')) = 'pagada') AS last_payment_at
    FROM public.facturas f
    GROUP BY f.empresa_id
  ),
  latest_subscription AS MATERIALIZED (
    SELECT DISTINCT ON (s.empresa_id)
      s.empresa_id, s.id, s.status, s.trial_ends_at, s.current_period_end,
      s.fecha_vencimiento, s.stripe_customer_id, s.stripe_subscription_id,
      s.es_manual, s.acceso_bloqueado
    FROM public.subscriptions s
    ORDER BY s.empresa_id, s.updated_at DESC, s.created_at DESC
  ),
  last_activity AS MATERIALIZED (
    SELECT DISTINCT ON (a.empresa_id)
      a.empresa_id, a.activity_type, a.outcome, a.note, a.created_at
    FROM public.admin_trial_crm_activities a
    ORDER BY a.empresa_id, a.created_at DESC
  ),
  base AS MATERIALIZED (
    SELECT
      e.id AS empresa_id,
      e.nombre,
      e.licencia,
      COALESCE(NULLIF(e.email, ''), prs.owner_email) AS email,
      e.telefono,
      e.created_at,
      GREATEST(0, EXTRACT(DAY FROM now() - e.created_at)::integer) AS age_days,
      e.onboarding_completado,
      COALESCE(ss.all_sales, 0) AS all_sales,
      COALESCE(ss.valid_sales, 0) AS valid_sales,
      COALESCE(ss.draft_sales, 0) AS draft_sales,
      ss.last_sale_record_at,
      COALESCE(ps.products, 0) AS products,
      COALESCE(ps.active_products, 0) AS active_products,
      ps.last_product_at,
      COALESCE(cs.clients, 0) AS clients,
      cs.last_client_at,
      COALESCE(prs.users, 0) AS users,
      prs.last_sign_in_at,
      CASE WHEN prs.last_sign_in_at IS NULL THEN NULL
        ELSE GREATEST(0, EXTRACT(DAY FROM now() - prs.last_sign_in_at)::integer) END AS days_since_login,
      COALESCE(inv.invoices, 0) AS invoices,
      COALESCE(inv.paid_invoices, 0) AS paid_invoices,
      COALESCE(inv.paid_total, 0) AS paid_total,
      inv.last_payment_at,
      sub.id AS subscription_id,
      COALESCE(sub.status, 'sin_suscripcion') AS subscription_status,
      sub.trial_ends_at,
      sub.current_period_end,
      sub.fecha_vencimiento,
      sub.stripe_customer_id,
      sub.stripe_subscription_id,
      COALESCE(sub.es_manual, false) AS manual_subscription,
      COALESCE(sub.acceso_bloqueado, false) AS access_blocked,
      COALESCE(lead.stage, 'sin_contactar') AS crm_stage,
      lead.assigned_to,
      person.name AS assigned_name,
      lead.next_follow_up_at,
      lead.last_contact_at,
      COALESCE(lead.contact_attempts, 0) AS contact_attempts,
      lead.notes,
      lead.coupon_id,
      coupon.codigo AS coupon_code,
      coupon.descuento_pct AS coupon_discount_pct,
      coupon.meses_duracion AS coupon_months,
      coupon.vigencia_fin AS coupon_expires_at,
      (
        COALESCE(coupon.activo, false)
        AND (coupon.vigencia_inicio IS NULL OR coupon.vigencia_inicio <= current_date)
        AND (coupon.vigencia_fin IS NULL OR coupon.vigencia_fin >= current_date)
      ) AS coupon_active,
      la.activity_type AS last_activity_type,
      la.outcome AS last_activity_outcome,
      la.note AS last_activity_note,
      la.created_at AS last_activity_at,
      CASE
        WHEN COALESCE(ps.products, 0) > 0 AND COALESCE(cs.clients, 0) > 0 AND COALESCE(ss.draft_sales, 0) > 0 THEN 'casi_listo'
        WHEN COALESCE(ps.products, 0) > 0 OR COALESCE(cs.clients, 0) > 0 OR COALESCE(ss.draft_sales, 0) > 0 THEN 'exploro'
        ELSE 'sin_configurar'
      END AS setup_level,
      LEAST(100,
        (CASE WHEN prs.last_sign_in_at IS NOT NULL THEN 15 ELSE 0 END) +
        (CASE WHEN COALESCE(e.onboarding_completado, false) THEN 20 ELSE 0 END) +
        (CASE WHEN COALESCE(ps.products, 0) > 0 THEN 25 ELSE 0 END) +
        (CASE WHEN COALESCE(cs.clients, 0) > 0 THEN 20 ELSE 0 END) +
        (CASE WHEN COALESCE(ss.draft_sales, 0) > 0 THEN 20 ELSE 0 END)
      )::integer AS activation_score,
      (
        COALESCE(inv.paid_invoices, 0) = 0
        AND sub.stripe_subscription_id IS NULL
        AND COALESCE(sub.status, 'sin_suscripcion') NOT IN ('active', 'past_due', 'pendiente_pago')
      ) AS deletion_eligible
    FROM public.empresas e
    LEFT JOIN sale_stats ss ON ss.empresa_id = e.id
    LEFT JOIN product_stats ps ON ps.empresa_id = e.id
    LEFT JOIN client_stats cs ON cs.empresa_id = e.id
    LEFT JOIN profile_stats prs ON prs.empresa_id = e.id
    LEFT JOIN invoice_stats inv ON inv.empresa_id = e.id
    LEFT JOIN latest_subscription sub ON sub.empresa_id = e.id
    LEFT JOIN public.admin_trial_crm_leads lead ON lead.empresa_id = e.id
    LEFT JOIN public.commission_people person ON person.id = lead.assigned_to
    LEFT JOIN public.cupones coupon ON coupon.id = lead.coupon_id
    LEFT JOIN last_activity la ON la.empresa_id = e.id
    WHERE COALESCE(e.is_partner_sandbox, false) = false
      AND COALESCE(ss.valid_sales, 0) = 0
      AND GREATEST(0, EXTRACT(DAY FROM now() - e.created_at)::integer) BETWEEN v_min_age AND v_max_age
  ),
  monthly AS MATERIALIZED (
    SELECT generate_series(
      date_trunc('month', current_date)::date - interval '11 months',
      date_trunc('month', current_date)::date,
      interval '1 month'
    )::date AS month
  ),
  monthly_counts AS MATERIALIZED (
    SELECT date_trunc('month', b.created_at)::date AS month, COUNT(*)::integer AS signups
    FROM base b GROUP BY 1
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM base),
      'uncontacted', (SELECT COUNT(*) FROM base WHERE crm_stage = 'sin_contactar'),
      'overdue_followups', (SELECT COUNT(*) FROM base WHERE next_follow_up_at < now() AND crm_stage NOT IN ('no_interesado', 'descartado', 'convertido')),
      'registered_7d', (SELECT COUNT(*) FROM base WHERE created_at >= now() - interval '7 days'),
      'registered_30d', (SELECT COUNT(*) FROM base WHERE created_at >= now() - interval '30 days'),
      'with_setup', (SELECT COUNT(*) FROM base WHERE activation_score > 0),
      'almost_ready', (SELECT COUNT(*) FROM base WHERE setup_level = 'casi_listo'),
      'expired_trial', (SELECT COUNT(*) FROM base WHERE trial_ends_at < now()),
      'offers_active', (SELECT COUNT(*) FROM base WHERE coupon_active = true),
      'deletion_eligible', (SELECT COUNT(*) FROM base WHERE deletion_eligible = true)
    ),
    'stages', COALESCE((
      SELECT jsonb_object_agg(x.crm_stage, x.total)
      FROM (SELECT crm_stage, COUNT(*)::integer AS total FROM base GROUP BY crm_stage) x
    ), '{}'::jsonb),
    'monthly_signups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', m.month, 'signups', COALESCE(mc.signups, 0)
      ) ORDER BY m.month)
      FROM monthly m LEFT JOIN monthly_counts mc ON mc.month = m.month
    ), '[]'::jsonb),
    'assignees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
      FROM public.commission_people p
      WHERE p.is_active = true AND p.person_type = 'internal'
    ), '[]'::jsonb),
    'leads', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY
        CASE WHEN b.next_follow_up_at < now() THEN 0 ELSE 1 END,
        CASE b.setup_level WHEN 'casi_listo' THEN 0 WHEN 'exploro' THEN 1 ELSE 2 END,
        b.created_at DESC
      ) FROM base b
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_save(
  p_empresa_id uuid,
  p_stage text,
  p_assigned_to uuid DEFAULT NULL,
  p_next_follow_up_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_activity_type text DEFAULT 'note',
  p_outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_previous_stage text;
  v_is_contact boolean := p_activity_type IN ('call', 'whatsapp', 'email');
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF p_stage NOT IN ('sin_contactar', 'por_contactar', 'contactado', 'interesado', 'seguimiento', 'no_localizado', 'no_interesado', 'descartado', 'convertido') THEN
    RAISE EXCEPTION 'Etapa comercial inválida' USING ERRCODE = '22023';
  END IF;
  IF p_activity_type NOT IN ('note', 'call', 'whatsapp', 'email', 'stage', 'assignment', 'system') THEN
    RAISE EXCEPTION 'Tipo de actividad inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas v WHERE v.empresa_id = p_empresa_id
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('borrador', 'cancelado')
  ) AND p_stage <> 'convertido' THEN
    RAISE EXCEPTION 'La empresa ya tiene ventas operativas y no pertenece a recuperación';
  END IF;
  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_people WHERE id = p_assigned_to AND is_active = true AND person_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'Responsable interno inválido';
  END IF;

  SELECT stage INTO v_previous_stage
  FROM public.admin_trial_crm_leads WHERE empresa_id = p_empresa_id FOR UPDATE;

  INSERT INTO public.admin_trial_crm_leads (
    empresa_id, stage, assigned_to, next_follow_up_at, last_contact_at,
    contact_attempts, notes, converted_at, created_by, updated_by
  ) VALUES (
    p_empresa_id, p_stage, p_assigned_to, p_next_follow_up_at,
    CASE WHEN v_is_contact THEN now() ELSE NULL END,
    CASE WHEN v_is_contact THEN 1 ELSE 0 END,
    NULLIF(btrim(p_note), ''),
    CASE WHEN p_stage = 'convertido' THEN now() ELSE NULL END,
    auth.uid(), auth.uid()
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    assigned_to = EXCLUDED.assigned_to,
    next_follow_up_at = EXCLUDED.next_follow_up_at,
    last_contact_at = CASE WHEN v_is_contact THEN now() ELSE admin_trial_crm_leads.last_contact_at END,
    contact_attempts = admin_trial_crm_leads.contact_attempts + CASE WHEN v_is_contact THEN 1 ELSE 0 END,
    notes = CASE WHEN NULLIF(btrim(p_note), '') IS NULL THEN admin_trial_crm_leads.notes ELSE NULLIF(btrim(p_note), '') END,
    converted_at = CASE WHEN EXCLUDED.stage = 'convertido' THEN COALESCE(admin_trial_crm_leads.converted_at, now()) ELSE admin_trial_crm_leads.converted_at END,
    updated_by = auth.uid();

  INSERT INTO public.admin_trial_crm_activities (
    empresa_id, activity_type, outcome, note, previous_stage, new_stage, created_by
  ) VALUES (
    p_empresa_id, p_activity_type, NULLIF(btrim(p_outcome), ''), NULLIF(btrim(p_note), ''),
    v_previous_stage, p_stage, auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'empresa_id', p_empresa_id, 'stage', p_stage);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_create_offer(
  p_empresa_id uuid,
  p_discount_pct numeric DEFAULT 20,
  p_months integer DEFAULT 2,
  p_valid_days integer DEFAULT 7,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company public.empresas%ROWTYPE;
  v_coupon_id uuid;
  v_code text;
  v_previous_coupon uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF p_discount_pct < 1 OR p_discount_pct > 50 THEN
    RAISE EXCEPTION 'El descuento de recuperación debe estar entre 1 y 50%%';
  END IF;
  IF p_months < 1 OR p_months > 12 OR p_valid_days < 1 OR p_valid_days > 90 THEN
    RAISE EXCEPTION 'Duración de oferta inválida';
  END IF;

  SELECT * INTO v_company FROM public.empresas WHERE id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas v WHERE v.empresa_id = p_empresa_id
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('borrador', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene ventas operativas; no corresponde una oferta de recuperación';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.facturas f
    WHERE f.empresa_id = p_empresa_id
      AND lower(COALESCE(f.estado, '')) = 'pagada'
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene facturas pagadas; no corresponde una oferta de recuperación';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.empresa_id = p_empresa_id
      AND (
        NULLIF(btrim(s.stripe_subscription_id), '') IS NOT NULL
        OR s.status::text IN ('active', 'past_due', 'pendiente_pago')
      )
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene una suscripción Stripe activa o pendiente';
  END IF;

  SELECT coupon_id INTO v_previous_coupon
  FROM public.admin_trial_crm_leads WHERE empresa_id = p_empresa_id FOR UPDATE;
  IF v_previous_coupon IS NOT NULL THEN
    UPDATE public.cupones SET activo = false WHERE id = v_previous_coupon;
  END IF;

  v_code := 'REC-' || upper(COALESCE(NULLIF(v_company.licencia, ''), substr(replace(v_company.id::text, '-', ''), 1, 8)))
    || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.cupones (
    codigo, descripcion, descuento_pct, planes_aplicables, uso_maximo,
    uso_por_empresa, usos_actuales, meses_duracion, acumulable, activo,
    vigencia_inicio, vigencia_fin
  ) VALUES (
    v_code,
    'Oferta CRM para recuperar a ' || v_company.nombre || COALESCE(' · ' || NULLIF(btrim(p_note), ''), ''),
    p_discount_pct, '{}'::text[], 1, 1, 1, p_months, false, true,
    current_date, current_date + p_valid_days
  ) RETURNING id INTO v_coupon_id;

  INSERT INTO public.cupon_usos (cupon_id, empresa_id, meses_restantes)
  VALUES (v_coupon_id, p_empresa_id, p_months);

  INSERT INTO public.admin_trial_crm_leads (
    empresa_id, stage, coupon_id, coupon_assigned_at, notes, created_by, updated_by
  ) VALUES (
    p_empresa_id, 'interesado', v_coupon_id, now(), NULLIF(btrim(p_note), ''), auth.uid(), auth.uid()
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    stage = CASE WHEN admin_trial_crm_leads.stage IN ('sin_contactar', 'por_contactar', 'contactado', 'no_localizado') THEN 'interesado' ELSE admin_trial_crm_leads.stage END,
    coupon_id = EXCLUDED.coupon_id,
    coupon_assigned_at = now(),
    notes = COALESCE(EXCLUDED.notes, admin_trial_crm_leads.notes),
    updated_by = auth.uid();

  INSERT INTO public.admin_trial_crm_activities (
    empresa_id, activity_type, outcome, note, new_stage, created_by
  ) VALUES (
    p_empresa_id, 'coupon', v_code,
    format('Oferta de %s%% por %s mes(es), vigente %s días. %s', p_discount_pct, p_months, p_valid_days, COALESCE(p_note, '')),
    'interesado', auth.uid()
  );

  RETURN jsonb_build_object(
    'ok', true, 'coupon_id', v_coupon_id, 'code', v_code,
    'discount_pct', p_discount_pct, 'months', p_months,
    'expires_at', current_date + p_valid_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_history(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'activity_type', a.activity_type, 'outcome', a.outcome,
    'note', a.note, 'previous_stage', a.previous_stage, 'new_stage', a.new_stage,
    'created_at', a.created_at, 'created_by', a.created_by
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.admin_trial_crm_activities a WHERE a.empresa_id = p_empresa_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_delete_candidate(
  p_empresa_id uuid,
  p_confirmation text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company public.empresas%ROWTYPE;
  v_lead public.admin_trial_crm_leads%ROWTYPE;
  v_age integer;
  v_expected text;
  v_snapshot jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Describe el motivo de eliminación con al menos 10 caracteres';
  END IF;

  SELECT * INTO v_company FROM public.empresas WHERE id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;
  SELECT * INTO v_lead FROM public.admin_trial_crm_leads WHERE empresa_id = p_empresa_id FOR UPDATE;

  v_expected := 'ELIMINAR ' || COALESCE(NULLIF(v_company.licencia, ''), v_company.nombre);
  IF p_confirmation IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Confirmación incorrecta. Escribe exactamente: %', v_expected;
  END IF;
  IF v_lead.stage IS NULL OR v_lead.stage NOT IN ('no_interesado', 'descartado') THEN
    RAISE EXCEPTION 'Primero marca el prospecto como No interesado o Descartado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas v WHERE v.empresa_id = p_empresa_id
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('borrador', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'Bloqueado: la empresa ya tiene ventas operativas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.facturas f WHERE f.empresa_id = p_empresa_id
      AND lower(COALESCE(f.estado, '')) = 'pagada'
  ) THEN
    RAISE EXCEPTION 'Bloqueado: la empresa tiene facturas pagadas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.empresa_id = p_empresa_id
      AND (s.stripe_subscription_id IS NOT NULL OR s.status IN ('active', 'past_due', 'pendiente_pago'))
  ) THEN
    RAISE EXCEPTION 'Bloqueado: cancela o concilia primero la suscripción activa';
  END IF;

  v_age := GREATEST(0, EXTRACT(DAY FROM now() - v_company.created_at)::integer);
  v_snapshot := jsonb_build_object(
    'empresa', to_jsonb(v_company),
    'lead', to_jsonb(v_lead),
    'counts', jsonb_build_object(
      'ventas', (SELECT COUNT(*) FROM public.ventas WHERE empresa_id = p_empresa_id),
      'productos', (SELECT COUNT(*) FROM public.productos WHERE empresa_id = p_empresa_id),
      'clientes', (SELECT COUNT(*) FROM public.clientes WHERE empresa_id = p_empresa_id),
      'usuarios', (SELECT COUNT(*) FROM public.profiles WHERE empresa_id = p_empresa_id)
    )
  );

  INSERT INTO public.admin_trial_crm_deletions (
    empresa_id, empresa_nombre, licencia, email, telefono, age_days,
    reason, snapshot, deleted_by
  ) VALUES (
    v_company.id, v_company.nombre, v_company.licencia, v_company.email,
    v_company.telefono, v_age, btrim(p_reason), v_snapshot, auth.uid()
  );

  -- La función existente elimina datos y usuarios dentro de la misma transacción.
  -- Si cualquier FK actual impide la depuración, todo se revierte y no queda una
  -- empresa parcialmente eliminada.
  PERFORM public.delete_empresa_cascade(p_empresa_id, auth.uid());

  RETURN jsonb_build_object('ok', true, 'empresa_id', p_empresa_id, 'nombre', v_company.nombre);
END;
$$;

-- Si un prospecto atendido registra su primera venta válida, el CRM lo reconoce
-- automáticamente como convertido; nunca depende de que alguien lo marque a mano.
CREATE OR REPLACE FUNCTION public.fn_admin_trial_crm_detect_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_updated uuid;
BEGIN
  IF COALESCE(NEW.es_saldo_inicial, false) OR NEW.status::text IN ('borrador', 'cancelado') THEN
    RETURN NEW;
  END IF;

  UPDATE public.admin_trial_crm_leads
  SET stage = 'convertido', converted_at = COALESCE(converted_at, now()), updated_at = now()
  WHERE empresa_id = NEW.empresa_id AND stage <> 'convertido'
  RETURNING empresa_id INTO v_updated;

  IF v_updated IS NOT NULL THEN
    INSERT INTO public.admin_trial_crm_activities (
      empresa_id, activity_type, outcome, note, previous_stage, new_stage
    ) VALUES (
      NEW.empresa_id, 'system', 'primera_venta',
      'Conversión detectada automáticamente por venta ' || COALESCE(NEW.folio, NEW.id::text),
      NULL, 'convertido'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_trial_crm_detect_conversion ON public.ventas;
CREATE TRIGGER admin_trial_crm_detect_conversion
  AFTER INSERT OR UPDATE OF status ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.fn_admin_trial_crm_detect_conversion();

REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_snapshot(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_save(uuid, text, uuid, timestamptz, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_create_offer(uuid, numeric, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_trial_crm_delete_candidate(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_snapshot(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_save(uuid, text, uuid, timestamptz, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_create_offer(uuid, numeric, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_trial_crm_delete_candidate(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
