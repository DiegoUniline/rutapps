BEGIN;

-- El acceso del equipo es independiente del rol super_admin y de la empresa
-- operativa que la misma persona pudiera tener como cliente de RutApp.
CREATE TABLE IF NOT EXISTS public.platform_team_members (
  person_id uuid PRIMARY KEY REFERENCES public.commission_people(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  job_title text,
  access_level text NOT NULL DEFAULT 'executive' CHECK (access_level IN ('executive', 'supervisor', 'manager')),
  access_scope text NOT NULL DEFAULT 'own' CHECK (access_scope IN ('own', 'team', 'all')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended')),
  commission_mode text NOT NULL DEFAULT 'none' CHECK (commission_mode IN (
    'none', 'first_payment', 'first_n_payments', 'recurring', 'fixed_activation'
  )),
  commission_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct BETWEEN 0 AND 100),
  commission_payment_limit integer CHECK (commission_payment_limit BETWEEN 1 AND 60),
  commission_fixed_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (commission_fixed_amount >= 0),
  permissions jsonb NOT NULL DEFAULT '{"crm":true,"portfolio":true,"commissions":true,"billing_audit":false,"company_admin":false}'::jsonb,
  invited_at timestamptz,
  last_access_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_team_commission_configuration CHECK (
    (commission_mode = 'none')
    OR (commission_mode IN ('first_payment', 'first_n_payments', 'recurring') AND commission_pct > 0)
    OR (commission_mode = 'fixed_activation' AND commission_fixed_amount > 0)
  ),
  CONSTRAINT platform_team_payment_limit CHECK (
    commission_mode <> 'first_n_payments' OR commission_payment_limit IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS platform_team_members_user_idx
  ON public.platform_team_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_team_members_status_idx
  ON public.platform_team_members(status, access_level);
CREATE INDEX IF NOT EXISTS admin_trial_crm_activities_creator_date_idx
  ON public.admin_trial_crm_activities(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS facturas_internal_commission_sequence_idx
  ON public.facturas(empresa_id, tipo, estado, periodo_inicio, id);

CREATE TABLE IF NOT EXISTS public.platform_team_member_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL,
  previous_data jsonb,
  new_data jsonb,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_team_member_audit_person_idx
  ON public.platform_team_member_audit_log(person_id, created_at DESC);

ALTER TABLE public.commission_client_attributions
  ADD COLUMN IF NOT EXISTS commissioned_by_id uuid REFERENCES public.commission_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_starts_at timestamptz;

CREATE INDEX IF NOT EXISTS commission_client_commissioned_idx
  ON public.commission_client_attributions(commissioned_by_id)
  WHERE commissioned_by_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.internal_commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.commission_people(id) ON DELETE RESTRICT,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  factura_id uuid NOT NULL UNIQUE REFERENCES public.facturas(id) ON DELETE RESTRICT,
  invoice_number text,
  payment_number integer NOT NULL CHECK (payment_number >= 1),
  period text NOT NULL,
  base_amount numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  commission_mode text NOT NULL,
  commission_pct numeric(5,2) NOT NULL DEFAULT 0,
  commission_fixed_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL CHECK (commission_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'reversed', 'void')),
  rule_snapshot jsonb NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  payout_id uuid,
  paid_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_commission_entries_person_idx
  ON public.internal_commission_entries(person_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS internal_commission_entries_company_idx
  ON public.internal_commission_entries(empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.internal_commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.commission_people(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text,
  reference text,
  notes text,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_commission_entries
  DROP CONSTRAINT IF EXISTS internal_commission_entries_payout_id_fkey;
ALTER TABLE public.internal_commission_entries
  ADD CONSTRAINT internal_commission_entries_payout_id_fkey
  FOREIGN KEY (payout_id) REFERENCES public.internal_commission_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS internal_commission_payouts_person_idx
  ON public.internal_commission_payouts(person_id, paid_at DESC);

-- Una invitación interna no debe caer en la rama histórica que asigna usuarios
-- sin empresa a la primera empresa disponible. Las cuentas existentes conservan
-- intactos su profile y empresa; esta excepción solo aplica al alta de auth nueva.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_empresa_nombre text;
  v_ref_slug text;
  v_cupon_codigo text;
  v_is_partner boolean;
  v_role_id uuid;
  v_almacen_id uuid;
BEGIN
  IF NEW.raw_user_meta_data ->> 'account_type' = 'rutapp_team' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.partners partner
    WHERE lower(partner.email) = lower(NEW.email)
  ) INTO v_is_partner;
  IF v_is_partner THEN
    UPDATE public.partners partner SET user_id = NEW.id
    WHERE lower(partner.email) = lower(NEW.email) AND partner.user_id IS NULL;
    RETURN NEW;
  END IF;

  v_empresa_nombre := COALESCE(NEW.raw_user_meta_data ->> 'empresa_nombre', '');
  v_ref_slug := NULLIF(NEW.raw_user_meta_data ->> 'partner_ref', '');
  v_cupon_codigo := NULLIF(NEW.raw_user_meta_data ->> 'cupon_codigo', '');

  IF v_empresa_nombre <> '' THEN
    INSERT INTO public.empresas(nombre, telefono, email, owner_user_id)
    VALUES (
      v_empresa_nombre,
      COALESCE(NEW.raw_user_meta_data ->> 'phone', NEW.phone, ''),
      COALESCE(NEW.email, ''),
      NEW.id
    ) RETURNING id INTO v_empresa_id;
  ELSE
    SELECT empresa.id INTO v_empresa_id FROM public.empresas empresa LIMIT 1;
  END IF;

  SELECT almacen.id INTO v_almacen_id
  FROM public.almacenes almacen
  WHERE almacen.empresa_id = v_empresa_id AND almacen.nombre = 'Almacén General'
  LIMIT 1;

  INSERT INTO public.profiles(user_id, nombre, empresa_id, telefono, almacen_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    v_empresa_id,
    NEW.raw_user_meta_data ->> 'phone',
    v_almacen_id
  );

  SELECT role.id INTO v_role_id
  FROM public.roles role
  WHERE role.empresa_id = v_empresa_id AND role.nombre = 'Administrador'
  LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role_id)
    VALUES (NEW.id, v_role_id) ON CONFLICT DO NOTHING;
  END IF;

  IF v_empresa_nombre <> '' AND (v_ref_slug IS NOT NULL OR v_cupon_codigo IS NOT NULL) THEN
    BEGIN
      PERFORM public.aplicar_partner_referido(v_empresa_id, v_ref_slug, v_cupon_codigo);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.platform_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_team_member_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_team_members_admin_all ON public.platform_team_members;
CREATE POLICY platform_team_members_admin_all ON public.platform_team_members
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS platform_team_members_self_read ON public.platform_team_members;
CREATE POLICY platform_team_members_self_read ON public.platform_team_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS internal_commission_entries_admin_all ON public.internal_commission_entries;
CREATE POLICY internal_commission_entries_admin_all ON public.internal_commission_entries
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS internal_commission_entries_self_read ON public.internal_commission_entries;
CREATE POLICY internal_commission_entries_self_read ON public.internal_commission_entries
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.platform_team_members tm
      WHERE tm.person_id = internal_commission_entries.person_id
        AND tm.user_id = auth.uid() AND tm.status IN ('invited', 'active')
    )
  );

DROP POLICY IF EXISTS internal_commission_payouts_admin_all ON public.internal_commission_payouts;
CREATE POLICY internal_commission_payouts_admin_all ON public.internal_commission_payouts
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS internal_commission_payouts_self_read ON public.internal_commission_payouts;
CREATE POLICY internal_commission_payouts_self_read ON public.internal_commission_payouts
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.platform_team_members tm
      WHERE tm.person_id = internal_commission_payouts.person_id
        AND tm.user_id = auth.uid() AND tm.status IN ('invited', 'active')
    )
  );

DROP POLICY IF EXISTS platform_team_member_audit_admin_read ON public.platform_team_member_audit_log;
CREATE POLICY platform_team_member_audit_admin_read ON public.platform_team_member_audit_log
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS platform_team_members_updated_at ON public.platform_team_members;
CREATE TRIGGER platform_team_members_updated_at
  BEFORE UPDATE ON public.platform_team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS internal_commission_entries_updated_at ON public.internal_commission_entries;
CREATE TRIGGER internal_commission_entries_updated_at
  BEFORE UPDATE ON public.internal_commission_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.audit_platform_team_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.platform_team_member_audit_log(
    person_id, previous_data, new_data, reason, changed_by
  ) VALUES (
    NEW.person_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    to_jsonb(NEW),
    NULLIF(current_setting('app.commission_change_reason', true), ''),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_team_members_audit ON public.platform_team_members;
DROP TRIGGER IF EXISTS platform_team_members_audit_insert ON public.platform_team_members;
DROP TRIGGER IF EXISTS platform_team_members_audit_update ON public.platform_team_members;
CREATE TRIGGER platform_team_members_audit_insert
  AFTER INSERT ON public.platform_team_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_platform_team_member_change();
CREATE TRIGGER platform_team_members_audit_update
  AFTER UPDATE OF user_id, job_title, access_level, access_scope, status,
    commission_mode, commission_pct, commission_payment_limit,
    commission_fixed_amount, permissions
  ON public.platform_team_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_platform_team_member_change();

CREATE OR REPLACE FUNCTION public.is_platform_team_member(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_team_members tm
    JOIN public.commission_people cp ON cp.id = tm.person_id
    WHERE tm.user_id = p_user_id
      AND tm.status IN ('invited', 'active')
      AND cp.is_active = true
      AND cp.person_type = 'internal'
      AND (p_user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  );
$$;

CREATE OR REPLACE FUNCTION public.get_team_visible_people(p_user_id uuid DEFAULT auth.uid())
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE mine AS (
    SELECT tm.person_id, tm.access_scope
    FROM public.platform_team_members tm
    JOIN public.commission_people cp ON cp.id = tm.person_id
    WHERE tm.user_id = p_user_id
      AND tm.status IN ('invited', 'active')
      AND cp.is_active = true
      AND (p_user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  ), descendants(id) AS (
    SELECT mine.person_id FROM mine
    UNION
    SELECT cp.id
    FROM public.commission_people cp
    JOIN descendants d ON cp.manager_id = d.id
    CROSS JOIN mine
    WHERE mine.access_scope IN ('team', 'all')
      AND cp.person_type = 'internal'
      AND cp.is_active = true
  )
  SELECT descendants.id FROM descendants
  UNION
  SELECT cp.id
  FROM public.commission_people cp CROSS JOIN mine
  WHERE mine.access_scope = 'all'
    AND cp.person_type = 'internal'
    AND cp.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.fn_my_team_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'has_access', true,
    'person_id', tm.person_id,
    'name', cp.name,
    'job_title', tm.job_title,
    'access_level', tm.access_level,
    'access_scope', tm.access_scope,
    'status', tm.status,
    'permissions', tm.permissions
  ) INTO v_result
  FROM public.platform_team_members tm
  JOIN public.commission_people cp ON cp.id = tm.person_id
  WHERE tm.user_id = auth.uid()
    AND tm.status IN ('invited', 'active')
    AND cp.is_active = true AND cp.person_type = 'internal';

  RETURN COALESCE(v_result, jsonb_build_object('has_access', false));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_team_member(
  p_person_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_access_level text DEFAULT 'executive',
  p_access_scope text DEFAULT 'own',
  p_status text DEFAULT 'invited',
  p_commission_mode text DEFAULT 'none',
  p_commission_pct numeric DEFAULT 0,
  p_commission_payment_limit integer DEFAULT NULL,
  p_commission_fixed_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_change_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_person_id uuid;
  v_user_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo un super administrador puede gestionar el equipo' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'El nombre es obligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_email IS NULL OR position('@' IN p_email) = 0 THEN
    RAISE EXCEPTION 'El correo es obligatorio para dar acceso' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.partners partner
    WHERE lower(partner.email) = lower(btrim(p_email))
  ) THEN
    RAISE EXCEPTION 'Ese correo pertenece a un Partner externo y no puede reutilizarse como integrante interno'
      USING ERRCODE = '23505';
  END IF;
  IF p_access_level NOT IN ('executive', 'supervisor', 'manager')
     OR p_access_scope NOT IN ('own', 'team', 'all')
     OR p_status NOT IN ('invited', 'active', 'suspended') THEN
    RAISE EXCEPTION 'Configuración de acceso inválida' USING ERRCODE = '22023';
  END IF;
  IF p_commission_mode NOT IN ('none', 'first_payment', 'first_n_payments', 'recurring', 'fixed_activation') THEN
    RAISE EXCEPTION 'Plan de comisión inválido' USING ERRCODE = '22023';
  END IF;
  IF p_commission_mode IN ('first_payment', 'first_n_payments', 'recurring')
     AND (COALESCE(p_commission_pct, 0) <= 0 OR p_commission_pct > 100) THEN
    RAISE EXCEPTION 'El porcentaje debe estar entre 0.01 y 100' USING ERRCODE = '22023';
  END IF;
  IF p_commission_mode = 'first_n_payments'
     AND (p_commission_payment_limit IS NULL OR p_commission_payment_limit NOT BETWEEN 1 AND 60) THEN
    RAISE EXCEPTION 'Indica entre 1 y 60 pagos comisionables' USING ERRCODE = '22023';
  END IF;
  IF p_commission_mode = 'fixed_activation' AND COALESCE(p_commission_fixed_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'El monto fijo debe ser mayor a cero' USING ERRCODE = '22023';
  END IF;
  IF p_manager_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_people cp
    WHERE cp.id = p_manager_id AND cp.person_type = 'internal' AND cp.is_active = true
  ) THEN
    RAISE EXCEPTION 'El encargado no existe o está inactivo';
  END IF;

  PERFORM set_config('app.commission_change_reason', COALESCE(btrim(p_change_reason), ''), true);

  IF p_person_id IS NULL THEN
    SELECT cp.id INTO v_person_id
    FROM public.commission_people cp
    WHERE cp.person_type = 'internal' AND lower(cp.email) = lower(btrim(p_email));
    IF v_person_id IS NULL THEN
      INSERT INTO public.commission_people(person_type, name, email, phone, manager_id, is_active, notes)
      VALUES ('internal', btrim(p_name), lower(btrim(p_email)), NULLIF(btrim(p_phone), ''),
        p_manager_id, p_status <> 'suspended', NULLIF(btrim(p_notes), ''))
      RETURNING id INTO v_person_id;
    ELSE
      UPDATE public.commission_people cp SET
        name=btrim(p_name), phone=NULLIF(btrim(p_phone),''), manager_id=p_manager_id,
        is_active=p_status <> 'suspended', notes=NULLIF(btrim(p_notes),'')
      WHERE cp.id=v_person_id;
    END IF;
    SELECT au.id INTO v_user_id FROM auth.users au
    WHERE lower(au.email) = lower(btrim(p_email)) ORDER BY au.created_at LIMIT 1;
  ELSE
    SELECT tm.user_id INTO v_user_id
    FROM public.platform_team_members tm WHERE tm.person_id = p_person_id;

    IF v_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM auth.users account
      WHERE account.id = v_user_id AND lower(account.email) = lower(btrim(p_email))
    ) THEN
      RAISE EXCEPTION 'La cuenta ya está vinculada; cambia su correo desde autenticación antes de editarlo aquí'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.commission_people cp
      WHERE cp.id = p_person_id AND cp.person_type = 'internal'
    ) THEN
      RAISE EXCEPTION 'El integrante interno no existe' USING ERRCODE = 'P0002';
    END IF;
    IF p_change_reason IS NULL OR length(btrim(p_change_reason)) < 3 THEN
      RAISE EXCEPTION 'Indica el motivo del cambio' USING ERRCODE = '22023';
    END IF;
    UPDATE public.commission_people cp SET
      name = btrim(p_name), email = lower(btrim(p_email)), phone = NULLIF(btrim(p_phone), ''),
      manager_id = p_manager_id, is_active = p_status <> 'suspended', notes = NULLIF(btrim(p_notes), '')
    WHERE cp.id = p_person_id;
    v_person_id := p_person_id;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT au.id INTO v_user_id FROM auth.users au
    WHERE lower(au.email) = lower(btrim(p_email)) ORDER BY au.created_at LIMIT 1;
  END IF;

  INSERT INTO public.platform_team_members(
    person_id, user_id, job_title, access_level, access_scope, status,
    commission_mode, commission_pct, commission_payment_limit,
    commission_fixed_amount, invited_at, updated_by
  ) VALUES (
    v_person_id, v_user_id, NULLIF(btrim(p_job_title), ''), p_access_level, p_access_scope,
    CASE WHEN v_user_id IS NOT NULL AND p_status = 'invited' THEN 'active' ELSE p_status END,
    p_commission_mode, COALESCE(p_commission_pct, 0),
    CASE WHEN p_commission_mode = 'first_n_payments' THEN p_commission_payment_limit ELSE NULL END,
    CASE WHEN p_commission_mode = 'fixed_activation' THEN COALESCE(p_commission_fixed_amount, 0) ELSE 0 END,
    CASE WHEN p_status = 'invited' THEN now() ELSE NULL END, auth.uid()
  ) ON CONFLICT (person_id) DO UPDATE SET
    job_title = EXCLUDED.job_title,
    access_level = EXCLUDED.access_level,
    access_scope = EXCLUDED.access_scope,
    status = EXCLUDED.status,
    commission_mode = EXCLUDED.commission_mode,
    commission_pct = EXCLUDED.commission_pct,
    commission_payment_limit = EXCLUDED.commission_payment_limit,
    commission_fixed_amount = EXCLUDED.commission_fixed_amount,
    invited_at = CASE WHEN EXCLUDED.status = 'invited' THEN COALESCE(platform_team_members.invited_at, now()) ELSE platform_team_members.invited_at END,
    updated_by = auth.uid();

  RETURN jsonb_build_object('ok', true, 'person_id', v_person_id, 'user_id', v_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_link_team_account(p_person_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users account
    JOIN public.commission_people person
      ON person.id = p_person_id
     AND person.person_type = 'internal'
     AND person.is_active = true
     AND lower(person.email) = lower(account.email)
    WHERE account.id = p_user_id
  ) THEN
    RAISE EXCEPTION 'La cuenta no existe, está inactiva o su correo no coincide con el integrante'
      USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.platform_team_members tm SET
    user_id = p_user_id, status = 'active', invited_at = COALESCE(tm.invited_at, now()), updated_by = auth.uid()
  WHERE tm.person_id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El integrante no existe' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true, 'person_id', p_person_id, 'user_id', p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_team_company_assignment(
  p_empresa_id uuid,
  p_managed_by_id uuid DEFAULT NULL,
  p_commissioned_by_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_has_partner boolean;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo de la asignación' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF p_managed_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_team_members tm JOIN public.commission_people cp ON cp.id = tm.person_id
    WHERE tm.person_id = p_managed_by_id AND tm.status IN ('invited', 'active') AND cp.is_active = true
  ) THEN RAISE EXCEPTION 'El responsable no es un integrante activo'; END IF;
  IF p_commissioned_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_team_members tm JOIN public.commission_people cp ON cp.id = tm.person_id
    WHERE tm.person_id = p_commissioned_by_id AND tm.status IN ('invited', 'active')
      AND tm.commission_mode <> 'none' AND cp.is_active = true AND cp.person_type = 'internal'
  ) THEN RAISE EXCEPTION 'El comisionista no está activo o no tiene plan de comisión'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.partner_atribuciones pa WHERE pa.empresa_id = p_empresa_id)
  INTO v_has_partner;
  IF v_has_partner AND p_commissioned_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta empresa pertenece a un partner; no puede recibir simultáneamente comisión interna';
  END IF;

  PERFORM set_config('app.commission_change_reason', btrim(p_reason), true);
  INSERT INTO public.commission_client_attributions(
    empresa_id, managed_by_id, commissioned_by_id, commission_starts_at, channel, notes
  ) VALUES (
    p_empresa_id, p_managed_by_id, p_commissioned_by_id,
    CASE WHEN p_commissioned_by_id IS NULL THEN NULL ELSE now() END,
    'manual', btrim(p_reason)
  ) ON CONFLICT (empresa_id) DO UPDATE SET
    managed_by_id = EXCLUDED.managed_by_id,
    commissioned_by_id = EXCLUDED.commissioned_by_id,
    commission_starts_at = CASE
      WHEN commission_client_attributions.commissioned_by_id IS DISTINCT FROM EXCLUDED.commissioned_by_id
        THEN EXCLUDED.commission_starts_at
      ELSE commission_client_attributions.commission_starts_at
    END,
    notes = EXCLUDED.notes;

  UPDATE public.admin_trial_crm_leads lead
  SET assigned_to = p_managed_by_id, updated_by = auth.uid()
  WHERE lead.empresa_id = p_empresa_id
    AND lead.assigned_to IS DISTINCT FROM p_managed_by_id;

  RETURN jsonb_build_object('ok', true, 'empresa_id', p_empresa_id, 'partner_protected', v_has_partner);
END;
$$;

-- Si el responsable cambia desde el CRM Master, la cartera de Equipo refleja
-- el mismo dato. El comisionista nunca se altera desde esta sincronización.
CREATE OR REPLACE FUNCTION public.sync_crm_assignment_to_team_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_team_members member
    JOIN public.commission_people person ON person.id = member.person_id
    WHERE member.person_id = NEW.assigned_to
      AND member.status IN ('invited', 'active')
      AND person.is_active = true AND person.person_type = 'internal'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.commission_client_attributions(empresa_id, managed_by_id, channel, notes)
  VALUES (NEW.empresa_id, NEW.assigned_to, 'manual', 'Responsable sincronizado desde CRM')
  ON CONFLICT (empresa_id) DO UPDATE SET managed_by_id = EXCLUDED.managed_by_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_trial_crm_sync_team_portfolio ON public.admin_trial_crm_leads;
CREATE TRIGGER admin_trial_crm_sync_team_portfolio
  AFTER INSERT OR UPDATE OF assigned_to ON public.admin_trial_crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.sync_crm_assignment_to_team_portfolio();

CREATE OR REPLACE FUNCTION public.generate_internal_commission_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_assignment record;
  v_member record;
  v_payment_number integer;
  v_amount numeric(12,2);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'pagada' AND NEW.estado <> 'pagada' THEN
      UPDATE public.internal_commission_entries ice SET
        status = 'reversed', reversed_at = now(),
        reversal_reason = 'La factura dejó de estar pagada'
      WHERE ice.factura_id = NEW.id AND ice.status <> 'void';
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.estado <> 'pagada' OR COALESCE(NEW.tipo, 'subscription_renewal') <> 'subscription_renewal' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_atribuciones pa WHERE pa.empresa_id = NEW.empresa_id) THEN
    RETURN NEW;
  END IF;

  SELECT cca.commissioned_by_id, cca.commission_starts_at, captured.person_type AS captured_type
  INTO v_assignment
  FROM public.commission_client_attributions cca
  LEFT JOIN public.commission_people captured ON captured.id = cca.captured_by_id
  WHERE cca.empresa_id = NEW.empresa_id;

  IF v_assignment.commissioned_by_id IS NULL OR v_assignment.captured_type = 'partner'
     OR COALESCE(NEW.fecha_pago, now()) < COALESCE(v_assignment.commission_starts_at, '-infinity'::timestamptz) THEN
    RETURN NEW;
  END IF;

  SELECT tm.*, cp.is_active, cp.person_type INTO v_member
  FROM public.platform_team_members tm
  JOIN public.commission_people cp ON cp.id = tm.person_id
  WHERE tm.person_id = v_assignment.commissioned_by_id;

  IF NOT FOUND OR v_member.status NOT IN ('invited', 'active')
     OR NOT v_member.is_active OR v_member.person_type <> 'internal'
     OR v_member.commission_mode = 'none' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer INTO v_payment_number
  FROM public.facturas f
  WHERE f.empresa_id = NEW.empresa_id
    AND f.estado = 'pagada'
    AND COALESCE(f.tipo, 'subscription_renewal') = 'subscription_renewal'
    AND (f.periodo_inicio < NEW.periodo_inicio OR (f.periodo_inicio = NEW.periodo_inicio AND f.id::text <= NEW.id::text));
  v_payment_number := GREATEST(1, v_payment_number);

  v_amount := CASE v_member.commission_mode
    WHEN 'first_payment' THEN CASE WHEN v_payment_number = 1 THEN round(COALESCE(NEW.total, 0) * v_member.commission_pct / 100, 2) ELSE 0 END
    WHEN 'first_n_payments' THEN CASE WHEN v_payment_number <= v_member.commission_payment_limit THEN round(COALESCE(NEW.total, 0) * v_member.commission_pct / 100, 2) ELSE 0 END
    WHEN 'recurring' THEN round(COALESCE(NEW.total, 0) * v_member.commission_pct / 100, 2)
    WHEN 'fixed_activation' THEN CASE WHEN v_payment_number = 1 THEN v_member.commission_fixed_amount ELSE 0 END
    ELSE 0
  END;
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.internal_commission_entries(
    person_id, empresa_id, factura_id, invoice_number, payment_number, period,
    base_amount, commission_mode, commission_pct, commission_fixed_amount,
    commission_amount, rule_snapshot
  ) VALUES (
    v_assignment.commissioned_by_id, NEW.empresa_id, NEW.id, NEW.numero_factura,
    v_payment_number, to_char(NEW.periodo_inicio, 'YYYY-MM'), COALESCE(NEW.total, 0),
    v_member.commission_mode, v_member.commission_pct, v_member.commission_fixed_amount,
    v_amount,
    jsonb_build_object(
      'version', 'internal-v1-2026-09-09', 'mode', v_member.commission_mode,
      'percent', v_member.commission_pct, 'payment_limit', v_member.commission_payment_limit,
      'fixed_amount', v_member.commission_fixed_amount, 'payment_number', v_payment_number,
      'commission_starts_at', v_assignment.commission_starts_at
    )
  ) ON CONFLICT (factura_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facturas_generate_internal_commission ON public.facturas;
CREATE TRIGGER facturas_generate_internal_commission
  AFTER INSERT OR UPDATE ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.generate_internal_commission_from_invoice();

CREATE OR REPLACE FUNCTION public.admin_set_internal_commission_status(
  p_entry_id uuid, p_status text, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('approved', 'void') THEN RAISE EXCEPTION 'Estado no permitido' USING ERRCODE = '22023'; END IF;
  IF p_status = 'void' AND (p_reason IS NULL OR length(btrim(p_reason)) < 3) THEN
    RAISE EXCEPTION 'Indica el motivo de anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE public.internal_commission_entries ice SET
    status = p_status,
    approved_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE ice.approved_by END,
    approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE ice.approved_at END,
    reversal_reason = CASE WHEN p_status = 'void' THEN btrim(p_reason) ELSE ice.reversal_reason END
  WHERE ice.id = p_entry_id AND ice.status IN ('pending', 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'La comisión ya no puede modificarse'; END IF;
  RETURN jsonb_build_object('ok', true, 'entry_id', p_entry_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pay_internal_commissions(
  p_person_id uuid, p_entry_ids uuid[], p_method text DEFAULT NULL,
  p_reference text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_amount numeric(12,2); v_payout_id uuid; v_count integer;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501'; END IF;
  IF p_entry_ids IS NULL OR cardinality(p_entry_ids) = 0 THEN RAISE EXCEPTION 'Selecciona comisiones'; END IF;
  IF p_reference IS NULL OR length(btrim(p_reference)) < 3 THEN
    RAISE EXCEPTION 'La referencia o comprobante es obligatorio' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.internal_commission_entries ice
  WHERE ice.id = ANY(p_entry_ids) AND ice.person_id = p_person_id
  ORDER BY ice.id FOR UPDATE;

  SELECT COALESCE(sum(ice.commission_amount), 0), count(*)::integer INTO v_amount, v_count
  FROM public.internal_commission_entries ice
  WHERE ice.id = ANY(p_entry_ids) AND ice.person_id = p_person_id AND ice.status = 'approved';
  IF v_count <> cardinality(p_entry_ids) OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Todas las comisiones deben estar aprobadas y pertenecer al integrante';
  END IF;
  INSERT INTO public.internal_commission_payouts(person_id, amount, method, reference, notes)
  VALUES (p_person_id, v_amount, NULLIF(btrim(p_method), ''), NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_notes), ''))
  RETURNING id INTO v_payout_id;
  UPDATE public.internal_commission_entries ice SET status = 'paid', payout_id = v_payout_id, paid_at = now()
  WHERE ice.id = ANY(p_entry_ids) AND ice.person_id = p_person_id AND ice.status = 'approved';
  RETURN jsonb_build_object('ok', true, 'payout_id', v_payout_id, 'amount', v_amount, 'entries', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_team_workspace()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501'; END IF;
  WITH latest_subscription AS MATERIALIZED (
    SELECT DISTINCT ON (s.empresa_id) s.empresa_id, s.status, s.stripe_subscription_id
    FROM public.subscriptions s ORDER BY s.empresa_id, s.updated_at DESC, s.created_at DESC
  ), member_rows AS MATERIALIZED (
    SELECT cp.id, cp.name, cp.email, cp.phone, cp.manager_id, cp.is_active, cp.notes,
      tm.user_id, tm.job_title, tm.access_level, tm.access_scope, tm.status,
      tm.commission_mode, tm.commission_pct, tm.commission_payment_limit,
      tm.commission_fixed_amount, tm.permissions, tm.invited_at, tm.last_access_at,
      manager.name AS manager_name,
      (SELECT count(*) FROM public.commission_people report WHERE report.manager_id = cp.id AND report.is_active = true) AS reports_count,
      (SELECT count(*) FROM public.admin_trial_crm_leads lead WHERE lead.assigned_to = cp.id AND lead.stage NOT IN ('no_interesado','descartado','convertido')) AS crm_leads,
      (SELECT count(*) FROM public.commission_client_attributions cca WHERE cca.managed_by_id = cp.id) AS managed_companies,
      (SELECT count(*) FROM public.commission_client_attributions cca WHERE cca.commissioned_by_id = cp.id) AS commissioned_companies,
      (SELECT count(*) FROM public.admin_trial_crm_activities act WHERE act.created_by = tm.user_id AND act.created_at >= now() - interval '30 days') AS activities_30d,
      COALESCE((SELECT sum(ice.commission_amount) FROM public.internal_commission_entries ice WHERE ice.person_id = cp.id AND ice.status IN ('pending','approved')),0) AS commission_pending,
      COALESCE((SELECT sum(ice.commission_amount) FROM public.internal_commission_entries ice WHERE ice.person_id = cp.id AND ice.status = 'paid'),0) AS commission_paid
    FROM public.commission_people cp
    JOIN public.platform_team_members tm ON tm.person_id = cp.id
    LEFT JOIN public.commission_people manager ON manager.id = cp.manager_id
    WHERE cp.person_type = 'internal'
  ), company_rows AS MATERIALIZED (
    SELECT e.id, e.nombre, e.licencia, e.email, e.telefono, e.created_at,
      cca.captured_by_id, cca.managed_by_id, cca.commissioned_by_id, cca.commission_starts_at,
      captured.name AS captured_by_name, managed.name AS managed_by_name, commissioned.name AS commissioned_by_name,
      (pa.id IS NOT NULL) AS has_partner, ls.status AS subscription_status,
      ls.stripe_subscription_id,
      COALESCE((SELECT sum(f.total) FROM public.facturas f WHERE f.empresa_id = e.id AND f.estado = 'pagada'),0) AS paid_total
    FROM public.empresas e
    LEFT JOIN public.commission_client_attributions cca ON cca.empresa_id = e.id
    LEFT JOIN public.commission_people captured ON captured.id = cca.captured_by_id
    LEFT JOIN public.commission_people managed ON managed.id = cca.managed_by_id
    LEFT JOIN public.commission_people commissioned ON commissioned.id = cca.commissioned_by_id
    LEFT JOIN public.partner_atribuciones pa ON pa.empresa_id = e.id
    LEFT JOIN latest_subscription ls ON ls.empresa_id = e.id
    WHERE COALESCE(e.is_partner_sandbox, false) = false
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'active_members', (SELECT count(*) FROM member_rows WHERE status = 'active' AND is_active = true),
      'invited_members', (SELECT count(*) FROM member_rows WHERE status = 'invited'),
      'crm_leads', (SELECT COALESCE(sum(crm_leads),0) FROM member_rows),
      'managed_companies', (SELECT count(*) FROM company_rows WHERE managed_by_id IS NOT NULL),
      'unassigned_companies', (SELECT count(*) FROM company_rows WHERE managed_by_id IS NULL),
      'commission_pending', (SELECT COALESCE(sum(commission_amount),0) FROM public.internal_commission_entries WHERE status IN ('pending','approved')),
      'commission_paid', (SELECT COALESCE(sum(commission_amount),0) FROM public.internal_commission_entries WHERE status = 'paid')
    ),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.is_active DESC, m.name) FROM member_rows m),'[]'::jsonb),
    'companies', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.nombre) FROM company_rows c),'[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
        SELECT ice.*, cp.name AS person_name, e.nombre AS empresa_nombre
        FROM public.internal_commission_entries ice
        JOIN public.commission_people cp ON cp.id = ice.person_id
        JOIN public.empresas e ON e.id = ice.empresa_id
        ORDER BY ice.created_at DESC LIMIT 1000
      ) x
    ),'[]'::jsonb),
    'activities', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
        SELECT a.id, a.empresa_id, e.nombre AS empresa_nombre, a.activity_type, a.outcome,
          a.note, a.new_stage, a.created_at, cp.id AS person_id, cp.name AS person_name
        FROM public.admin_trial_crm_activities a
        JOIN public.empresas e ON e.id = a.empresa_id
        LEFT JOIN public.platform_team_members tm ON tm.user_id = a.created_by
        LEFT JOIN public.commission_people cp ON cp.id = tm.person_id
        WHERE tm.person_id IS NOT NULL ORDER BY a.created_at DESC LIMIT 500
      ) x
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_portal_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_me uuid; v_result jsonb;
BEGIN
  SELECT tm.person_id INTO v_me
  FROM public.platform_team_members tm JOIN public.commission_people cp ON cp.id = tm.person_id
  WHERE tm.user_id = auth.uid() AND tm.status IN ('invited','active') AND cp.is_active = true;
  IF v_me IS NULL THEN RAISE EXCEPTION 'Acceso de equipo no disponible' USING ERRCODE = '42501'; END IF;

  UPDATE public.platform_team_members tm SET last_access_at = now(), status = 'active'
  WHERE tm.person_id = v_me;

  WITH visible AS MATERIALIZED (SELECT public.get_team_visible_people(auth.uid()) AS id),
  member_rows AS MATERIALIZED (
    SELECT cp.id, cp.name, cp.email, cp.phone, cp.manager_id, manager.name AS manager_name,
      tm.job_title, tm.access_level, tm.access_scope, tm.commission_mode,
      tm.commission_pct, tm.commission_payment_limit, tm.commission_fixed_amount
    FROM visible v JOIN public.commission_people cp ON cp.id = v.id
    JOIN public.platform_team_members tm ON tm.person_id = cp.id
    LEFT JOIN public.commission_people manager ON manager.id = cp.manager_id
  ), lead_rows AS MATERIALIZED (
    SELECT e.id AS empresa_id, e.nombre, e.licencia, e.email, e.telefono,
      lead.stage, lead.assigned_to, cp.name AS assigned_name, lead.next_follow_up_at,
      lead.last_contact_at, lead.contact_attempts, lead.notes, lead.lost_at, lead.lost_reason
    FROM public.admin_trial_crm_leads lead
    JOIN visible v ON v.id = lead.assigned_to
    JOIN public.empresas e ON e.id = lead.empresa_id
    LEFT JOIN public.commission_people cp ON cp.id = lead.assigned_to
  ), company_rows AS MATERIALIZED (
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
  ), commission_rows AS MATERIALIZED (
    SELECT ice.*, cp.name AS person_name, e.nombre AS empresa_nombre
    FROM public.internal_commission_entries ice
    JOIN visible v ON v.id = ice.person_id
    JOIN public.commission_people cp ON cp.id = ice.person_id
    JOIN public.empresas e ON e.id = ice.empresa_id
  )
  SELECT jsonb_build_object(
    'generated_at', now(), 'me_id', v_me,
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
        ) ORDER BY a.created_at DESC LIMIT 300
      ) x
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_save(
  p_empresa_id uuid, p_stage text, p_next_follow_up_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL, p_activity_type text DEFAULT 'note', p_outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_previous_stage text; v_assigned_to uuid; v_is_contact boolean;
BEGIN
  IF p_stage NOT IN ('sin_contactar','por_contactar','contactado','interesado','seguimiento','no_localizado','no_interesado') THEN
    RAISE EXCEPTION 'Etapa no disponible' USING ERRCODE = '22023';
  END IF;
  IF p_activity_type NOT IN ('note','call','whatsapp','email','stage') THEN
    RAISE EXCEPTION 'Actividad no disponible' USING ERRCODE = '22023';
  END IF;
  SELECT lead.stage, lead.assigned_to INTO v_previous_stage, v_assigned_to
  FROM public.admin_trial_crm_leads lead WHERE lead.empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND OR v_assigned_to NOT IN (SELECT public.get_team_visible_people(auth.uid())) THEN
    RAISE EXCEPTION 'Este prospecto no pertenece a tu cartera' USING ERRCODE = '42501';
  END IF;
  IF p_stage = 'no_interesado' AND (p_note IS NULL OR length(btrim(p_note)) < 5) THEN
    RAISE EXCEPTION 'Escribe el motivo de pérdida con al menos 5 caracteres' USING ERRCODE = '22023';
  END IF;
  v_is_contact := p_activity_type IN ('call','whatsapp','email');
  UPDATE public.admin_trial_crm_leads lead SET
    stage = p_stage,
    next_follow_up_at = CASE WHEN p_stage = 'no_interesado' THEN NULL ELSE p_next_follow_up_at END,
    last_contact_at = CASE WHEN v_is_contact THEN now() ELSE lead.last_contact_at END,
    contact_attempts = lead.contact_attempts + CASE WHEN v_is_contact THEN 1 ELSE 0 END,
    notes = COALESCE(NULLIF(btrim(p_note),''), lead.notes),
    lost_at = CASE WHEN p_stage = 'no_interesado' THEN now() ELSE NULL END,
    lost_by = CASE WHEN p_stage = 'no_interesado' THEN auth.uid() ELSE NULL END,
    lost_reason = CASE WHEN p_stage = 'no_interesado' THEN btrim(p_note) ELSE NULL END,
    updated_by = auth.uid()
  WHERE lead.empresa_id = p_empresa_id;
  IF p_stage = 'no_interesado' THEN
    UPDATE public.cupones coupon SET activo = false
    WHERE coupon.id = (SELECT lead.coupon_id FROM public.admin_trial_crm_leads lead WHERE lead.empresa_id = p_empresa_id);
  END IF;
  INSERT INTO public.admin_trial_crm_activities(
    empresa_id, activity_type, outcome, note, previous_stage, new_stage, created_by
  ) VALUES (
    p_empresa_id, p_activity_type, NULLIF(btrim(p_outcome),''), NULLIF(btrim(p_note),''),
    v_previous_stage, p_stage, auth.uid()
  );
  RETURN jsonb_build_object('ok',true,'empresa_id',p_empresa_id,'stage',p_stage);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_log_contact(p_empresa_id uuid, p_channel text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_stage text; v_assigned_to uuid; v_new_stage text;
BEGIN
  IF p_channel NOT IN ('call','whatsapp','email') THEN RAISE EXCEPTION 'Canal inválido'; END IF;
  SELECT lead.stage, lead.assigned_to INTO v_stage, v_assigned_to
  FROM public.admin_trial_crm_leads lead WHERE lead.empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND OR v_assigned_to NOT IN (SELECT public.get_team_visible_people(auth.uid())) THEN
    RAISE EXCEPTION 'Este prospecto no pertenece a tu cartera' USING ERRCODE='42501';
  END IF;
  v_new_stage := CASE WHEN v_stage='sin_contactar' THEN 'por_contactar' ELSE v_stage END;
  UPDATE public.admin_trial_crm_leads lead SET stage=v_new_stage, last_contact_at=now(),
    contact_attempts=lead.contact_attempts+1, updated_by=auth.uid()
  WHERE lead.empresa_id=p_empresa_id;
  INSERT INTO public.admin_trial_crm_activities(empresa_id,activity_type,outcome,previous_stage,new_stage,created_by)
  VALUES(p_empresa_id,p_channel,'Contacto iniciado desde Mi equipo',v_stage,v_new_stage,auth.uid());
  RETURN jsonb_build_object('ok',true);
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_team_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_team_visible_people(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_my_team_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_team_member(uuid,text,text,text,text,uuid,text,text,text,text,numeric,integer,numeric,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_link_team_account(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_team_company_assignment(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_internal_commission_status(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_pay_internal_commissions(uuid,uuid[],text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_team_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_portal_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_crm_save(uuid,text,timestamptz,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_crm_log_contact(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_platform_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_visible_people(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_team_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_team_member(uuid,text,text,text,text,uuid,text,text,text,text,numeric,integer,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_team_account(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_team_company_assignment(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_internal_commission_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pay_internal_commissions(uuid,uuid[],text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_team_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_team_portal_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_save(uuid,text,timestamptz,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_log_contact(uuid,text) TO authenticated;

COMMIT;
