
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.cfdi_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cobro_id uuid REFERENCES public.cobros(id) ON DELETE SET NULL,
  facturama_id text,
  folio_fiscal text,
  serie text,
  folio text,
  fecha_pago timestamptz NOT NULL,
  forma_pago text NOT NULL,
  moneda text NOT NULL DEFAULT 'MXN',
  tipo_cambio numeric NOT NULL DEFAULT 1,
  monto numeric NOT NULL DEFAULT 0,
  num_operacion text,
  rfc_emisor_cta_ord text,
  nom_banco_ord_ext text,
  cta_ordenante text,
  rfc_emisor_cta_ben text,
  cta_beneficiario text,
  expedition_place text,
  pdf_url text,
  xml_url text,
  cadena_original text,
  sello_cfdi text,
  sello_sat text,
  no_certificado_sat text,
  no_certificado_emisor text,
  fecha_timbrado text,
  status text NOT NULL DEFAULT 'borrador',
  cancel_status text,
  cancel_date timestamptz,
  error_detalle text,
  enviado_at timestamptz,
  enviado_a text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_pagos TO authenticated;
GRANT ALL ON public.cfdi_pagos TO service_role;

ALTER TABLE public.cfdi_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation"
ON public.cfdi_pagos
FOR ALL
TO authenticated
USING ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))
WITH CHECK ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()));

CREATE INDEX idx_cfdi_pagos_empresa ON public.cfdi_pagos(empresa_id);
CREATE INDEX idx_cfdi_pagos_cobro ON public.cfdi_pagos(cobro_id);
CREATE INDEX idx_cfdi_pagos_fecha ON public.cfdi_pagos(fecha_pago DESC);

CREATE TRIGGER trg_cfdi_pagos_updated_at
BEFORE UPDATE ON public.cfdi_pagos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.cfdi_pago_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cfdi_pago_id uuid NOT NULL REFERENCES public.cfdi_pagos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cfdi_id uuid REFERENCES public.cfdis(id) ON DELETE SET NULL,
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  cfdi_relacionado_uuid text NOT NULL,
  serie_dr text,
  folio_dr text,
  moneda_dr text NOT NULL DEFAULT 'MXN',
  tipo_cambio_dr numeric NOT NULL DEFAULT 1,
  num_parcialidad integer NOT NULL DEFAULT 1,
  imp_saldo_ant numeric NOT NULL DEFAULT 0,
  imp_pagado numeric NOT NULL DEFAULT 0,
  imp_saldo_insoluto numeric NOT NULL DEFAULT 0,
  objeto_imp_dr text DEFAULT '02',
  metodo_pago_dr text DEFAULT 'PPD',
  iva_trasladado_dr numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_pago_documentos TO authenticated;
GRANT ALL ON public.cfdi_pago_documentos TO service_role;

ALTER TABLE public.cfdi_pago_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation"
ON public.cfdi_pago_documentos
FOR ALL
TO authenticated
USING ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))
WITH CHECK ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()));

CREATE INDEX idx_cfdi_pago_docs_pago ON public.cfdi_pago_documentos(cfdi_pago_id);
CREATE INDEX idx_cfdi_pago_docs_cfdi ON public.cfdi_pago_documentos(cfdi_id);


ALTER TABLE public.cfdis
  ADD COLUMN IF NOT EXISTS enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS enviado_a text;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS rfc_validado_at timestamptz,
  ADD COLUMN IF NOT EXISTS rfc_validado_status text,
  ADD COLUMN IF NOT EXISTS rfc_validado_detalle jsonb;

ALTER TABLE public.venta_lineas
  ADD COLUMN IF NOT EXISTS facturado_global boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_venta_lineas_facturado_global
  ON public.venta_lineas(facturado_global)
  WHERE facturado_global = false;
