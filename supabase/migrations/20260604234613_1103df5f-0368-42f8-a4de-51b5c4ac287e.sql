ALTER TABLE public.facturas
ADD COLUMN IF NOT EXISTS concepto text;

UPDATE public.facturas
SET concepto = 'Suscripción Rutapp'
WHERE concepto IS NULL;