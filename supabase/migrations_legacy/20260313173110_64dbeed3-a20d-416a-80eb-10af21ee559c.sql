
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rfc TEXT,
  direccion TEXT,
  email TEXT,
  telefono TEXT,
  tarifa_id UUID REFERENCES public.tarifas(id),
  contacto TEXT,
  notas TEXT,
  status TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.clientes
  FOR ALL USING (empresa_id = public.get_my_empresa_id())
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE INDEX idx_clientes_empresa ON public.clientes(empresa_id);
