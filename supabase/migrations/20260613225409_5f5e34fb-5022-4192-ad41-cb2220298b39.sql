
CREATE TABLE public.empresa_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  wa_bot_enabled boolean NOT NULL DEFAULT false,
  wa_bot_activated_at timestamptz,
  wa_bot_activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  wa_bot_monthly_price numeric DEFAULT 0,
  wa_bot_notes text,
  wa_bot_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.empresa_addons TO authenticated;
GRANT ALL ON public.empresa_addons TO service_role;
ALTER TABLE public.empresa_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_addons read by own empresa"
  ON public.empresa_addons FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "empresa_addons insert by empresa or admin"
  ON public.empresa_addons FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "empresa_addons update super admin only"
  ON public.empresa_addons FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.wa_bot_authorized_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone_e164 text NOT NULL,
  nombre text,
  permisos jsonb NOT NULL DEFAULT '{"reportes":true,"stock":true,"clientes":true,"cobros":true}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, phone_e164)
);
CREATE INDEX idx_wa_bot_auth_phone ON public.wa_bot_authorized_numbers (phone_e164) WHERE activo;
CREATE INDEX idx_wa_bot_auth_empresa ON public.wa_bot_authorized_numbers (empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_bot_authorized_numbers TO authenticated;
GRANT ALL ON public.wa_bot_authorized_numbers TO service_role;
ALTER TABLE public.wa_bot_authorized_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_bot_numbers read by empresa"
  ON public.wa_bot_authorized_numbers FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "wa_bot_numbers insert by empresa"
  ON public.wa_bot_authorized_numbers FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "wa_bot_numbers update by empresa"
  ON public.wa_bot_authorized_numbers FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "wa_bot_numbers delete by empresa"
  ON public.wa_bot_authorized_numbers FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TABLE public.wa_bot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  phone text NOT NULL,
  inbound_text text,
  intent text,
  params jsonb,
  outcome text NOT NULL DEFAULT 'ok',
  response_summary text,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_bot_logs_empresa_created ON public.wa_bot_logs (empresa_id, created_at DESC);
CREATE INDEX idx_wa_bot_logs_phone_created ON public.wa_bot_logs (phone, created_at DESC);

GRANT SELECT ON public.wa_bot_logs TO authenticated;
GRANT ALL ON public.wa_bot_logs TO service_role;
ALTER TABLE public.wa_bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_bot_logs read by empresa"
  ON public.wa_bot_logs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_wa_bot_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_empresa_addons_updated
  BEFORE UPDATE ON public.empresa_addons
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_bot_set_updated_at();

CREATE TRIGGER trg_wa_bot_auth_updated
  BEFORE UPDATE ON public.wa_bot_authorized_numbers
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_bot_set_updated_at();
