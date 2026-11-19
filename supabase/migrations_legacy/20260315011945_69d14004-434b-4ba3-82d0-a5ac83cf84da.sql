
-- whatsapp_config
CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  api_url text NOT NULL DEFAULT '',
  api_token text NOT NULL DEFAULT '',
  instance_name text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT false,
  enviar_recibo_pago boolean NOT NULL DEFAULT true,
  aviso_dia_antes boolean NOT NULL DEFAULT false,
  aviso_vencido boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.whatsapp_config FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- whatsapp_log
CREATE TABLE public.whatsapp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  telefono text NOT NULL,
  tipo text NOT NULL,
  mensaje text,
  imagen_url text,
  status text NOT NULL DEFAULT 'sent',
  error_detalle text,
  referencia_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.whatsapp_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.whatsapp_log FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- whatsapp_templates
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  mensaje text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.whatsapp_templates FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());
