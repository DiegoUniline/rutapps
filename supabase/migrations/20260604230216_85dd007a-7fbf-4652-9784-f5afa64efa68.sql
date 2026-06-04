UPDATE public.subscription_plans SET activo = true WHERE nombre IN ('Semestral', 'Anual');
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS referencia_pago text;