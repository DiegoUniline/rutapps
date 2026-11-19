-- Add tarifa_id to productos to support assigning a specific price list (tarifa) per product
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS tarifa_id uuid REFERENCES public.tarifas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_productos_tarifa_id ON public.productos(tarifa_id);