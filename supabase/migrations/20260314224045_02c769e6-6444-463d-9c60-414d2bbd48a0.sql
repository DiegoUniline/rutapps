-- Compras table
CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  almacen_id uuid REFERENCES public.almacenes(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  folio text,
  subtotal numeric DEFAULT 0,
  iva_total numeric DEFAULT 0,
  total numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'borrador',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.compras FOR ALL TO public
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Compra lineas
CREATE TABLE public.compra_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad numeric NOT NULL DEFAULT 1,
  precio_unitario numeric NOT NULL DEFAULT 0,
  subtotal numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compra_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.compra_lineas FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_lineas.compra_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_lineas.compra_id AND c.empresa_id = get_my_empresa_id()));

-- Producto lotes
CREATE TABLE public.producto_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  almacen_id uuid REFERENCES public.almacenes(id) ON DELETE SET NULL,
  lote text NOT NULL,
  fecha_produccion date,
  fecha_caducidad date,
  cantidad numeric NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.producto_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.producto_lotes FOR ALL TO public
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());