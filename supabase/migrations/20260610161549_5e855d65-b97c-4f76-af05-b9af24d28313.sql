ALTER TABLE public.pago_comisiones
  ADD COLUMN IF NOT EXISTS gasto_id uuid REFERENCES public.gastos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pago_comisiones_gasto_id ON public.pago_comisiones(gasto_id);