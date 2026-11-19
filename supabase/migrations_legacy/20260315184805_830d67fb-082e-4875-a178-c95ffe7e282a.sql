
CREATE TABLE public.producto_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  es_principal boolean NOT NULL DEFAULT false,
  precio_compra numeric DEFAULT 0,
  tiempo_entrega_dias integer DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(producto_id, proveedor_id)
);

ALTER TABLE public.producto_proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.producto_proveedores
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM productos p WHERE p.id = producto_proveedores.producto_id AND p.empresa_id = get_my_empresa_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM productos p WHERE p.id = producto_proveedores.producto_id AND p.empresa_id = get_my_empresa_id()
  ));
