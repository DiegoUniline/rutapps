
-- Add IEPS type: 'porcentaje' or 'cuota' (fixed amount per unit)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS ieps_tipo text NOT NULL DEFAULT 'porcentaje';
