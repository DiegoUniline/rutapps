
CREATE TABLE public.visitas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  cliente_id uuid REFERENCES public.clientes(id),
  user_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'venta',
  motivo text,
  notas text,
  gps_lat numeric,
  gps_lng numeric,
  fecha timestamp with time zone NOT NULL DEFAULT now(),
  venta_id uuid REFERENCES public.ventas(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.visitas
  FOR ALL
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());
