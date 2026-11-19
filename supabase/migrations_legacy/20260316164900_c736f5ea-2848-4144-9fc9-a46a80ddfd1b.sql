
-- CFDI line items for editable drafts
CREATE TABLE public.cfdi_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cfdi_id uuid NOT NULL REFERENCES public.cfdis(id) ON DELETE CASCADE,
  venta_linea_id uuid REFERENCES public.venta_lineas(id) ON DELETE SET NULL,
  producto_id uuid REFERENCES public.productos(id),
  descripcion text NOT NULL DEFAULT '',
  cantidad numeric NOT NULL DEFAULT 1,
  precio_unitario numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  iva_pct numeric NOT NULL DEFAULT 16,
  ieps_pct numeric NOT NULL DEFAULT 0,
  iva_monto numeric NOT NULL DEFAULT 0,
  ieps_monto numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  product_code text NOT NULL DEFAULT '01010101',
  unit_code text NOT NULL DEFAULT 'H87',
  unit_name text NOT NULL DEFAULT 'Pieza',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cfdi_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.cfdi_lineas
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.cfdis c
    WHERE c.id = cfdi_lineas.cfdi_id
    AND c.empresa_id = get_my_empresa_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cfdis c
    WHERE c.id = cfdi_lineas.cfdi_id
    AND c.empresa_id = get_my_empresa_id()
  ));
