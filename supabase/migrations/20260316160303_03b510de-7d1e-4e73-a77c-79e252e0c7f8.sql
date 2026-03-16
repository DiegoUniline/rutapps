
-- Table to track issued CFDIs
CREATE TABLE public.cfdis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  venta_id uuid REFERENCES public.ventas(id),
  -- Facturama data
  facturama_id text,
  folio_fiscal text,
  serie text,
  folio text,
  -- CFDI details
  cfdi_type text NOT NULL DEFAULT 'I',
  currency text NOT NULL DEFAULT 'MXN',
  payment_form text,
  payment_method text,
  expedition_place text,
  -- Receiver
  receiver_rfc text,
  receiver_name text,
  receiver_cfdi_use text,
  receiver_fiscal_regime text,
  receiver_tax_zip_code text,
  -- Totals
  subtotal numeric NOT NULL DEFAULT 0,
  iva_total numeric NOT NULL DEFAULT 0,
  ieps_total numeric NOT NULL DEFAULT 0,
  retenciones_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  -- Files
  pdf_url text,
  xml_url text,
  -- Status: borrador, timbrado, cancelado, error
  status text NOT NULL DEFAULT 'borrador',
  error_detalle text,
  -- Cancellation
  cancel_status text,
  cancel_date timestamptz,
  -- Metadata
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cfdis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.cfdis
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Add fiscal fields to clientes for receiver data
ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS uso_cfdi text,
  ADD COLUMN IF NOT EXISTS cp text;
