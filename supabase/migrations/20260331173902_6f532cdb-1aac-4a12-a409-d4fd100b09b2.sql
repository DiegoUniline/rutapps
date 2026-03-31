
ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS es_granel boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS unidad_granel text NOT NULL DEFAULT 'kg';
