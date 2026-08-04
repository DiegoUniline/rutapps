ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
UPDATE public.ventas SET creado_por = vendedor_id WHERE creado_por IS NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_creado_por ON public.ventas(creado_por);