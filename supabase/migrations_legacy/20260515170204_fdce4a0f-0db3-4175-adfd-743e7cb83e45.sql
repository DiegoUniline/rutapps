
CREATE TABLE public.partner_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text NOT NULL,
  telefono text,
  motivo text,
  experiencia text,
  redes text,
  status text NOT NULL DEFAULT 'pending',
  notas_admin text,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  processed_at timestamptz,
  processed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_solicitudes_status ON public.partner_solicitudes(status);
CREATE INDEX idx_partner_solicitudes_email ON public.partner_solicitudes(lower(email));

ALTER TABLE public.partner_solicitudes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_partner_solicitud" ON public.partner_solicitudes
FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "super_admin_select_solicitudes" ON public.partner_solicitudes
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY "super_admin_update_solicitudes" ON public.partner_solicitudes
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY "super_admin_delete_solicitudes" ON public.partner_solicitudes
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE TRIGGER trg_partner_solicitudes_updated
BEFORE UPDATE ON public.partner_solicitudes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS email text;
CREATE INDEX IF NOT EXISTS idx_partners_email ON public.partners(lower(email));

CREATE OR REPLACE FUNCTION public.aprobar_solicitud_partner(
  _solicitud_id uuid,
  _slug text,
  _comision_pct numeric DEFAULT 20
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol public.partner_solicitudes%ROWTYPE;
  v_partner_id uuid;
  v_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_sol FROM public.partner_solicitudes WHERE id = _solicitud_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_sol.status <> 'pending' THEN RAISE EXCEPTION 'Solicitud ya procesada'; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_sol.email) LIMIT 1;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = v_user_id AND empresa_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Este correo ya pertenece a una empresa cliente. No puede ser partner.';
  END IF;

  INSERT INTO public.partners (nombre, email, telefono, slug, comision_base_pct, user_id, status)
  VALUES (v_sol.nombre, v_sol.email, v_sol.telefono, _slug, _comision_pct, v_user_id, 'active')
  RETURNING id INTO v_partner_id;

  UPDATE public.partner_solicitudes
  SET status = 'approved', partner_id = v_partner_id, processed_at = now(), processed_by = auth.uid()
  WHERE id = _solicitud_id;

  RETURN v_partner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rechazar_solicitud_partner(
  _solicitud_id uuid,
  _motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE public.partner_solicitudes
  SET status = 'rejected', notas_admin = _motivo, processed_at = now(), processed_by = auth.uid()
  WHERE id = _solicitud_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_partner_client_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'partners' AND NEW.user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.user_id AND empresa_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Este usuario ya es cliente de una empresa, no puede ser partner';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'profiles' AND NEW.empresa_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'Este usuario es partner, no puede pertenecer a una empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_overlap_partners ON public.partners;
CREATE TRIGGER trg_prevent_overlap_partners
BEFORE INSERT OR UPDATE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.prevent_partner_client_overlap();

DROP TRIGGER IF EXISTS trg_prevent_overlap_profiles ON public.profiles;
CREATE TRIGGER trg_prevent_overlap_profiles
BEFORE INSERT OR UPDATE OF empresa_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_partner_client_overlap();

CREATE OR REPLACE FUNCTION public.link_partner_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.partners
  SET user_id = NEW.id
  WHERE user_id IS NULL AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_partner_on_signup ON auth.users;
CREATE TRIGGER trg_link_partner_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.link_partner_on_signup();
