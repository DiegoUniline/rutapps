
-- Gastos table for route salespeople expenses
CREATE TABLE public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  vendedor_id uuid REFERENCES public.vendedores(id),
  user_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  concepto text NOT NULL,
  monto numeric NOT NULL DEFAULT 0,
  foto_url text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.gastos
  FOR ALL TO public
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());
