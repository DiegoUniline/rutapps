
-- Add direct tax percentage fields and cost-includes-tax flag
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS iva_pct numeric NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS ieps_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_incluye_impuestos boolean NOT NULL DEFAULT false;

-- Migrate existing data: if tiene_iva was true, set iva_pct from tasa_iva if available
UPDATE public.productos p
SET iva_pct = COALESCE((SELECT t.porcentaje FROM public.tasas_iva t WHERE t.id = p.tasa_iva_id), 16)
WHERE p.tiene_iva = true;

UPDATE public.productos p
SET iva_pct = 0
WHERE p.tiene_iva = false;

UPDATE public.productos p
SET ieps_pct = COALESCE((SELECT t.porcentaje FROM public.tasas_ieps t WHERE t.id = p.tasa_ieps_id), 0)
WHERE p.tiene_ieps = true;
