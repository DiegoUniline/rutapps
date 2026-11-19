-- Create pedido sugerido table (suggested order per client)
CREATE TABLE public.cliente_pedido_sugerido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, producto_id)
);

-- Enable RLS
ALTER TABLE public.cliente_pedido_sugerido ENABLE ROW LEVEL SECURITY;

-- Tenant isolation via client
CREATE POLICY "Tenant isolation" ON public.cliente_pedido_sugerido
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM clientes c WHERE c.id = cliente_pedido_sugerido.cliente_id AND c.empresa_id = get_my_empresa_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM clientes c WHERE c.id = cliente_pedido_sugerido.cliente_id AND c.empresa_id = get_my_empresa_id()
  ));