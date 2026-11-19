
-- Lista de precios (belongs to a tarifa)
CREATE TABLE public.lista_precios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_id uuid NOT NULL REFERENCES public.tarifas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  nombre text NOT NULL,
  es_principal boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lista_precios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.lista_precios FOR ALL
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Precios por producto en cada lista
CREATE TABLE public.lista_precios_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_precio_id uuid NOT NULL REFERENCES public.lista_precios(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  precio numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lista_precio_id, producto_id)
);

ALTER TABLE public.lista_precios_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.lista_precios_lineas FOR ALL
  USING (EXISTS (SELECT 1 FROM lista_precios lp WHERE lp.id = lista_precios_lineas.lista_precio_id AND lp.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM lista_precios lp WHERE lp.id = lista_precios_lineas.lista_precio_id AND lp.empresa_id = get_my_empresa_id()));

-- Producto: toggle precio directo vs listas
ALTER TABLE public.productos ADD COLUMN usa_listas_precio boolean NOT NULL DEFAULT false;

-- Cliente: lista de precios asignada
ALTER TABLE public.clientes ADD COLUMN lista_precio_id uuid REFERENCES public.lista_precios(id);
