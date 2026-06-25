
-- Tienda config (1 per empresa)
CREATE TABLE public.tienda_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  activa BOOLEAN NOT NULL DEFAULT false,
  nombre_tienda TEXT NOT NULL,
  banner_url TEXT,
  logo_url TEXT,
  color_primario TEXT DEFAULT '#0061e8',
  color_secundario TEXT DEFAULT '#ff7a00',
  whatsapp_pedidos TEXT,
  lista_precios_default_id UUID REFERENCES public.lista_precios(id) ON DELETE SET NULL,
  permitir_invitados BOOLEAN NOT NULL DEFAULT true,
  mensaje_bienvenida TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tienda_config TO authenticated;
GRANT SELECT ON public.tienda_config TO anon;
GRANT ALL ON public.tienda_config TO service_role;

ALTER TABLE public.tienda_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tienda config visible publicamente si activa"
ON public.tienda_config FOR SELECT
TO anon, authenticated
USING (activa = true);

CREATE POLICY "Empresa admin manage tienda config"
ON public.tienda_config FOR ALL
TO authenticated
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX idx_tienda_config_slug ON public.tienda_config(slug);

-- Tienda clientes (login del cliente final)
CREATE TABLE public.tienda_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  telefono TEXT,
  verificado BOOLEAN NOT NULL DEFAULT false,
  ultimo_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tienda_clientes TO authenticated;
GRANT ALL ON public.tienda_clientes TO service_role;

ALTER TABLE public.tienda_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa admin ve tienda clientes"
ON public.tienda_clientes FOR ALL
TO authenticated
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX idx_tienda_clientes_empresa_email ON public.tienda_clientes(empresa_id, email);

-- update_at triggers
CREATE OR REPLACE FUNCTION public.tienda_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_tienda_config_updated_at BEFORE UPDATE ON public.tienda_config
FOR EACH ROW EXECUTE FUNCTION public.tienda_update_updated_at();

CREATE TRIGGER trg_tienda_clientes_updated_at BEFORE UPDATE ON public.tienda_clientes
FOR EACH ROW EXECUTE FUNCTION public.tienda_update_updated_at();
