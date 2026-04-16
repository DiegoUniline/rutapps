CREATE TABLE public.cliente_orden_ruta (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  dia text,
  vendedor_id uuid,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cliente_orden_ruta_unique_idx
  ON public.cliente_orden_ruta (cliente_id, COALESCE(dia, ''), COALESCE(vendedor_id::text, ''));

CREATE INDEX cliente_orden_ruta_lookup_idx
  ON public.cliente_orden_ruta (empresa_id, dia, vendedor_id, orden);

ALTER TABLE public.cliente_orden_ruta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa members can view orden ruta"
  ON public.cliente_orden_ruta FOR SELECT
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Empresa members can insert orden ruta"
  ON public.cliente_orden_ruta FOR INSERT
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Empresa members can update orden ruta"
  ON public.cliente_orden_ruta FOR UPDATE
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Empresa members can delete orden ruta"
  ON public.cliente_orden_ruta FOR DELETE
  USING (empresa_id = public.get_my_empresa_id());