-- Tabla de tasas de retención ISR
CREATE TABLE IF NOT EXISTS public.tasas_isr_ret (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nombre text NOT NULL,
  porcentaje numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasas_isr_ret ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasas_isr_ret_read" ON public.tasas_isr_ret
  FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "tasas_isr_ret_write" ON public.tasas_isr_ret
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

-- Tabla de tasas de retención IVA
CREATE TABLE IF NOT EXISTS public.tasas_iva_ret (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nombre text NOT NULL,
  porcentaje numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasas_iva_ret ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasas_iva_ret_read" ON public.tasas_iva_ret
  FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "tasas_iva_ret_write" ON public.tasas_iva_ret
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id());