
-- Add array columns for multi-select
ALTER TABLE public.tarifa_lineas
  ADD COLUMN producto_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN clasificacion_ids uuid[] NOT NULL DEFAULT '{}';

-- Migrate existing data from single columns to arrays
UPDATE public.tarifa_lineas SET producto_ids = ARRAY[producto_id] WHERE producto_id IS NOT NULL;
UPDATE public.tarifa_lineas SET clasificacion_ids = ARRAY[clasificacion_id] WHERE clasificacion_id IS NOT NULL;

-- Drop old FK constraints and columns
ALTER TABLE public.tarifa_lineas DROP CONSTRAINT IF EXISTS tarifa_lineas_producto_id_fkey;
ALTER TABLE public.tarifa_lineas DROP CONSTRAINT IF EXISTS tarifa_lineas_clasificacion_id_fkey;
ALTER TABLE public.tarifa_lineas DROP COLUMN producto_id;
ALTER TABLE public.tarifa_lineas DROP COLUMN clasificacion_id;
