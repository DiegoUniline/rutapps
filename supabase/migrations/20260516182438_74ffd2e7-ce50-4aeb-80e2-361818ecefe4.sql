ALTER TABLE public.compra_lineas
  ADD COLUMN IF NOT EXISTS factor_conversion numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS piezas_total numeric;

-- Backfill piezas_total para registros existentes
UPDATE public.compra_lineas
SET piezas_total = cantidad * COALESCE(factor_conversion, 1)
WHERE piezas_total IS NULL;