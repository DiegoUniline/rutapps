CREATE TABLE public.optimizacion_rutas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  user_id uuid NOT NULL,
  dia_filtro text,
  clientes_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.optimizacion_rutas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.optimizacion_rutas_log
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());