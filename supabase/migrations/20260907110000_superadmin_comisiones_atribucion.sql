BEGIN;

-- Directorio único para personal interno y partners. Los partners conservan su
-- modelo comercial actual; esta tabla únicamente los integra a la jerarquía.
CREATE TABLE public.commission_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type text NOT NULL CHECK (person_type IN ('internal', 'partner')),
  partner_id uuid UNIQUE REFERENCES public.partners(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  email text,
  phone text,
  manager_id uuid REFERENCES public.commission_people(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_people_partner_consistency CHECK (
    (person_type = 'partner' AND partner_id IS NOT NULL)
    OR (person_type = 'internal' AND partner_id IS NULL)
  ),
  CONSTRAINT commission_people_not_own_manager CHECK (manager_id IS NULL OR manager_id <> id)
);

CREATE UNIQUE INDEX commission_people_internal_email_unique
  ON public.commission_people (lower(email))
  WHERE person_type = 'internal' AND email IS NOT NULL;
CREATE INDEX commission_people_manager_idx ON public.commission_people(manager_id);
CREATE INDEX commission_people_active_idx ON public.commission_people(is_active, person_type);

-- Separa la autoría comercial de la responsabilidad operativa actual.
CREATE TABLE public.commission_client_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  captured_by_id uuid REFERENCES public.commission_people(id) ON DELETE SET NULL,
  managed_by_id uuid REFERENCES public.commission_people(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'manual' CHECK (
    channel IN ('partner_link', 'partner_coupon', 'manual', 'whatsapp', 'web', 'referral', 'organic', 'other')
  ),
  captured_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commission_client_captured_idx
  ON public.commission_client_attributions(captured_by_id);
CREATE INDEX commission_client_managed_idx
  ON public.commission_client_attributions(managed_by_id);

-- Bitácora inmutable: una reasignación nunca borra la atribución previa.
CREATE TABLE public.commission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('person', 'client_attribution')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  previous_data jsonb,
  new_data jsonb,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commission_audit_entity_idx
  ON public.commission_audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX commission_audit_created_idx
  ON public.commission_audit_log(created_at DESC);

ALTER TABLE public.commission_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_client_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY commission_people_super_admin_all ON public.commission_people
  FOR ALL USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY commission_client_attributions_super_admin_select
  ON public.commission_client_attributions
  FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE POLICY commission_audit_super_admin_select ON public.commission_audit_log
  FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER commission_people_updated_at
  BEFORE UPDATE ON public.commission_people
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER commission_client_attributions_updated_at
  BEFORE UPDATE ON public.commission_client_attributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_commission_manager()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_people
    WHERE id = NEW.manager_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'El encargado seleccionado no existe o está inactivo';
  END IF;

  IF EXISTS (
    WITH RECURSIVE managers(id) AS (
      SELECT NEW.manager_id
      UNION
      SELECT person.manager_id
      FROM public.commission_people person
      JOIN managers current_manager ON person.id = current_manager.id
      WHERE person.manager_id IS NOT NULL
    )
    SELECT 1 FROM managers WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'La jerarquía no puede formar un ciclo';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER commission_people_validate_manager
  BEFORE INSERT OR UPDATE OF manager_id ON public.commission_people
  FOR EACH ROW EXECUTE FUNCTION public.validate_commission_manager();

CREATE OR REPLACE FUNCTION public.audit_commission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type text;
  v_entity_id uuid;
  v_action text;
  v_previous jsonb;
  v_new jsonb;
  v_reason text;
BEGIN
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'commission_people' THEN 'person'
    ELSE 'client_attribution'
  END;
  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'created'
    WHEN 'UPDATE' THEN 'updated'
    ELSE 'deleted'
  END;
  v_previous := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_reason := NULLIF(current_setting('app.commission_change_reason', true), '');

  INSERT INTO public.commission_audit_log (
    entity_type, entity_id, action, previous_data, new_data, reason, changed_by
  ) VALUES (
    v_entity_type, v_entity_id, v_action, v_previous, v_new, v_reason, auth.uid()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER commission_people_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.commission_people
  FOR EACH ROW EXECUTE FUNCTION public.audit_commission_change();

CREATE TRIGGER commission_client_attributions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.commission_client_attributions
  FOR EACH ROW EXECUTE FUNCTION public.audit_commission_change();

-- Mantiene a Partners como fuente de verdad de sus datos de identidad y estado.
CREATE OR REPLACE FUNCTION public.sync_partner_to_commission_people()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.commission_people (
    id, person_type, partner_id, name, email, phone, is_active, notes, created_at, updated_at
  ) VALUES (
    NEW.id, 'partner', NEW.id, NEW.nombre, NEW.email, NEW.telefono,
    NEW.estado = 'activo', NEW.notas, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT (partner_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER partners_sync_commission_people
  AFTER INSERT OR UPDATE OF nombre, email, telefono, estado ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.sync_partner_to_commission_people();

CREATE OR REPLACE FUNCTION public.sync_partner_attribution_to_commissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  SELECT id INTO v_person_id
  FROM public.commission_people
  WHERE partner_id = NEW.partner_id;

  IF v_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.commission_client_attributions (
    empresa_id, captured_by_id, managed_by_id, channel, captured_at, notes
  ) VALUES (
    NEW.empresa_id,
    v_person_id,
    v_person_id,
    CASE NEW.metodo
      WHEN 'link' THEN 'partner_link'
      WHEN 'cupon' THEN 'partner_coupon'
      ELSE 'manual'
    END,
    NEW.created_at,
    'Atribuido automáticamente desde el programa de partners'
  )
  ON CONFLICT (empresa_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER partner_attributions_sync_commissions
  AFTER INSERT ON public.partner_atribuciones
  FOR EACH ROW EXECUTE FUNCTION public.sync_partner_attribution_to_commissions();

-- Personal existente: importa partners y sus atribuciones sin cambiar comisiones.
INSERT INTO public.commission_people (
  id, person_type, partner_id, name, email, phone, is_active, notes, created_at, updated_at
)
SELECT
  id, 'partner', id, nombre, email, telefono, estado = 'activo', notas, created_at, updated_at
FROM public.partners
ON CONFLICT (partner_id) DO NOTHING;

INSERT INTO public.commission_client_attributions (
  empresa_id, captured_by_id, managed_by_id, channel, captured_at, notes, created_at, updated_at
)
SELECT
  attribution.empresa_id,
  person.id,
  person.id,
  CASE attribution.metodo
    WHEN 'link' THEN 'partner_link'
    WHEN 'cupon' THEN 'partner_coupon'
    ELSE 'manual'
  END,
  attribution.created_at,
  'Importado de la atribución histórica del partner',
  attribution.created_at,
  attribution.created_at
FROM public.partner_atribuciones attribution
JOIN public.commission_people person ON person.partner_id = attribution.partner_id
ON CONFLICT (empresa_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_save_commission_person(
  p_person_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_notes text DEFAULT NULL,
  p_change_reason text DEFAULT NULL
)
RETURNS public.commission_people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person public.commission_people;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo un super administrador puede gestionar el equipo de comisiones';
  END IF;

  PERFORM set_config('app.commission_change_reason', COALESCE(btrim(p_change_reason), ''), true);

  IF p_person_id IS NULL THEN
    IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
      RAISE EXCEPTION 'El nombre es obligatorio';
    END IF;

    INSERT INTO public.commission_people (
      person_type, name, email, phone, manager_id, is_active, notes
    ) VALUES (
      'internal', btrim(p_name), NULLIF(btrim(p_email), ''), NULLIF(btrim(p_phone), ''),
      p_manager_id, p_is_active, NULLIF(btrim(p_notes), '')
    ) RETURNING * INTO v_person;
  ELSE
    SELECT * INTO v_person FROM public.commission_people WHERE id = p_person_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La persona no existe';
    END IF;

    IF v_person.person_type = 'partner' THEN
      UPDATE public.commission_people SET
        manager_id = p_manager_id,
        notes = NULLIF(btrim(p_notes), '')
      WHERE id = p_person_id
      RETURNING * INTO v_person;
    ELSE
      IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
        RAISE EXCEPTION 'El nombre es obligatorio';
      END IF;
      IF v_person.is_active = true AND p_is_active = false AND (
        EXISTS (SELECT 1 FROM public.commission_people WHERE manager_id = p_person_id AND is_active = true)
        OR EXISTS (SELECT 1 FROM public.commission_client_attributions WHERE managed_by_id = p_person_id)
      ) THEN
        RAISE EXCEPTION 'Reasigna primero sus colaboradores y clientes antes de desactivarlo';
      END IF;
      UPDATE public.commission_people SET
        name = btrim(p_name),
        email = NULLIF(btrim(p_email), ''),
        phone = NULLIF(btrim(p_phone), ''),
        manager_id = p_manager_id,
        is_active = p_is_active,
        notes = NULLIF(btrim(p_notes), '')
      WHERE id = p_person_id
      RETURNING * INTO v_person;
    END IF;
  END IF;

  RETURN v_person;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_commission_client_attribution(
  p_empresa_id uuid,
  p_captured_by_id uuid DEFAULT NULL,
  p_managed_by_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'manual',
  p_captured_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_change_reason text DEFAULT NULL
)
RETURNS public.commission_client_attributions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.commission_client_attributions;
  v_result public.commission_client_attributions;
  v_has_existing boolean;
  v_changed boolean;
  v_capture_changed boolean;
  v_partner_id uuid;
  v_partner_slug text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo un super administrador puede asignar clientes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'La empresa no existe';
  END IF;

  IF p_channel NOT IN ('partner_link', 'partner_coupon', 'manual', 'whatsapp', 'web', 'referral', 'organic', 'other') THEN
    RAISE EXCEPTION 'Canal de captación no válido';
  END IF;

  IF p_captured_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_people WHERE id = p_captured_by_id
  ) THEN
    RAISE EXCEPTION 'La persona que captó al cliente no existe';
  END IF;
  IF p_managed_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_people WHERE id = p_managed_by_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'El encargado actual no existe o está inactivo';
  END IF;

  SELECT * INTO v_existing
  FROM public.commission_client_attributions
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  v_has_existing := FOUND;
  v_capture_changed := NOT v_has_existing OR v_existing.captured_by_id IS DISTINCT FROM p_captured_by_id;

  IF v_capture_changed AND p_captured_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_people WHERE id = p_captured_by_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'No puedes atribuir un cliente nuevo a una persona inactiva';
  END IF;

  IF v_has_existing THEN
    v_changed := v_existing.captured_by_id IS DISTINCT FROM p_captured_by_id
      OR v_existing.managed_by_id IS DISTINCT FROM p_managed_by_id
      OR v_existing.channel IS DISTINCT FROM p_channel
      OR v_existing.notes IS DISTINCT FROM NULLIF(btrim(p_notes), '')
      OR (p_captured_at IS NOT NULL AND v_existing.captured_at IS DISTINCT FROM p_captured_at);

    IF v_changed AND (p_change_reason IS NULL OR length(btrim(p_change_reason)) = 0) THEN
      RAISE EXCEPTION 'Indica el motivo de la reasignación para conservar la auditoría';
    END IF;
  END IF;

  PERFORM set_config('app.commission_change_reason', COALESCE(btrim(p_change_reason), ''), true);

  INSERT INTO public.commission_client_attributions (
    empresa_id, captured_by_id, managed_by_id, channel, captured_at, notes
  ) VALUES (
    p_empresa_id, p_captured_by_id, p_managed_by_id, p_channel,
    COALESCE(p_captured_at, now()), NULLIF(btrim(p_notes), '')
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    captured_by_id = EXCLUDED.captured_by_id,
    managed_by_id = EXCLUDED.managed_by_id,
    channel = EXCLUDED.channel,
    captured_at = CASE
      WHEN p_captured_at IS NULL THEN public.commission_client_attributions.captured_at
      ELSE EXCLUDED.captured_at
    END,
    notes = EXCLUDED.notes
  RETURNING * INTO v_result;

  -- El programa de partners ya genera comisiones sobre partner_atribuciones.
  -- Al cambiar quién captó al cliente, actualizamos únicamente la ruta futura;
  -- las comisiones históricas permanecen ligadas a su factura y partner original.
  IF v_capture_changed THEN
    SELECT person.partner_id, partner.ref_slug
    INTO v_partner_id, v_partner_slug
    FROM public.commission_people person
    LEFT JOIN public.partners partner ON partner.id = person.partner_id
    WHERE person.id = p_captured_by_id;

    IF v_partner_id IS NOT NULL THEN
      INSERT INTO public.partner_atribuciones (empresa_id, partner_id, ref_slug, metodo)
      VALUES (p_empresa_id, v_partner_id, v_partner_slug, 'manual')
      ON CONFLICT (empresa_id) DO UPDATE SET
        partner_id = EXCLUDED.partner_id,
        ref_slug = EXCLUDED.ref_slug,
        metodo = 'manual';
    ELSE
      DELETE FROM public.partner_atribuciones WHERE empresa_id = p_empresa_id;
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_commission_person(uuid, text, text, text, uuid, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_commission_client_attribution(uuid, uuid, uuid, text, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_commission_person(uuid, text, text, text, uuid, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_commission_client_attribution(uuid, uuid, uuid, text, timestamptz, text, text) TO authenticated;

COMMIT;
