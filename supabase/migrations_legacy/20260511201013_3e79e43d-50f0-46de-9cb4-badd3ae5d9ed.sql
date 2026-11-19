ALTER TYPE public.status_entrega ADD VALUE IF NOT EXISTS 'no_entregado';
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS motivo_no_entrega text;