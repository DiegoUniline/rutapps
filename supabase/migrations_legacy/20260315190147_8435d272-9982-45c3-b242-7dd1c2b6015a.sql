
-- Add commission percentage to tarifa_lineas
ALTER TABLE public.tarifa_lineas ADD COLUMN comision_pct numeric NOT NULL DEFAULT 0;

-- Table to track commissions generated per venta_linea
CREATE TABLE public.venta_comisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  venta_linea_id uuid NOT NULL REFERENCES public.venta_lineas(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id),
  monto_venta numeric NOT NULL DEFAULT 0,
  comision_pct numeric NOT NULL DEFAULT 0,
  comision_monto numeric NOT NULL DEFAULT 0,
  pagada boolean NOT NULL DEFAULT false,
  pago_comision_id uuid,
  fecha_venta date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venta_comisiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.venta_comisiones
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Table for commission payment batches
CREATE TABLE public.pago_comisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  fecha_corte date NOT NULL,
  total_comisiones numeric NOT NULL DEFAULT 0,
  notas text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pago_comisiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.pago_comisiones
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- FK from venta_comisiones to pago_comisiones
ALTER TABLE public.venta_comisiones 
  ADD CONSTRAINT venta_comisiones_pago_fkey 
  FOREIGN KEY (pago_comision_id) REFERENCES public.pago_comisiones(id);
