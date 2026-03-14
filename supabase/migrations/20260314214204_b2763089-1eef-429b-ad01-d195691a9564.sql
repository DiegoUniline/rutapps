
-- Cobros table: payment receipts collected on route
CREATE TABLE public.cobros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  monto numeric NOT NULL DEFAULT 0,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago text NOT NULL DEFAULT 'efectivo',
  referencia text,
  notas text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cobros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.cobros
  FOR ALL TO public
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Cobro aplicaciones: links payments to specific invoices/sales
CREATE TABLE public.cobro_aplicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cobro_id uuid NOT NULL REFERENCES public.cobros(id) ON DELETE CASCADE,
  venta_id uuid NOT NULL REFERENCES public.ventas(id),
  monto_aplicado numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cobro_aplicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.cobro_aplicaciones
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.cobros c WHERE c.id = cobro_aplicaciones.cobro_id AND c.empresa_id = get_my_empresa_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cobros c WHERE c.id = cobro_aplicaciones.cobro_id AND c.empresa_id = get_my_empresa_id()
  ));

-- Add saldo_pendiente column to ventas for quick balance tracking
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS saldo_pendiente numeric DEFAULT 0;

-- Enable realtime for cobros
ALTER PUBLICATION supabase_realtime ADD TABLE public.cobros;
