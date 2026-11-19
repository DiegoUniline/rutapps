ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'subscription_renewal';

COMMENT ON COLUMN public.facturas.tipo IS
  'Origen de la factura: subscription_renewal modifica el ciclo; additional_charge nunca modifica plan, usuarios, vencimiento ni acceso.';

CREATE INDEX IF NOT EXISTS idx_facturas_empresa_tipo_estado
  ON public.facturas (empresa_id, tipo, estado);
