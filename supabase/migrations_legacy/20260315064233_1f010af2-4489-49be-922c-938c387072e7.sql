
CREATE TABLE public.carga_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id uuid NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(carga_id, venta_id)
);

ALTER TABLE public.carga_pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.carga_pedidos
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM cargas c WHERE c.id = carga_pedidos.carga_id AND c.empresa_id = get_my_empresa_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cargas c WHERE c.id = carga_pedidos.carga_id AND c.empresa_id = get_my_empresa_id()
  ));
