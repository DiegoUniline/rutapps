
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS tiempo_entrega_dias integer DEFAULT 0;
