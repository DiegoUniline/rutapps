ALTER TABLE public.pago_comisiones
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pagada',
  ADD COLUMN IF NOT EXISTS fecha_pago date;

UPDATE public.pago_comisiones SET fecha_pago = fecha_corte WHERE fecha_pago IS NULL;