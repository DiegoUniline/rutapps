
-- Enum for sale type
CREATE TYPE public.tipo_venta AS ENUM ('pedido', 'venta_directa');

-- Enum for payment condition
CREATE TYPE public.condicion_pago AS ENUM ('contado', 'credito', 'por_definir');

-- Enum for sale status
CREATE TYPE public.status_venta AS ENUM ('borrador', 'confirmado', 'entregado', 'facturado', 'cancelado');

-- Main ventas table
CREATE TABLE public.ventas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  folio TEXT,
  tipo tipo_venta NOT NULL DEFAULT 'pedido',
  status status_venta NOT NULL DEFAULT 'borrador',
  cliente_id UUID REFERENCES public.clientes(id),
  vendedor_id UUID REFERENCES public.vendedores(id),
  condicion_pago condicion_pago NOT NULL DEFAULT 'contado',
  tarifa_id UUID REFERENCES public.tarifas(id),
  almacen_id UUID REFERENCES public.almacenes(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega DATE,
  entrega_inmediata BOOLEAN DEFAULT false,
  notas TEXT,
  subtotal NUMERIC DEFAULT 0,
  descuento_total NUMERIC DEFAULT 0,
  iva_total NUMERIC DEFAULT 0,
  ieps_total NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Line items
CREATE TABLE public.venta_lineas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES public.productos(id),
  descripcion TEXT,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  unidad_id UUID REFERENCES public.unidades(id),
  precio_unitario NUMERIC NOT NULL DEFAULT 0,
  descuento_pct NUMERIC DEFAULT 0,
  subtotal NUMERIC DEFAULT 0,
  iva_pct NUMERIC DEFAULT 0,
  ieps_pct NUMERIC DEFAULT 0,
  iva_monto NUMERIC DEFAULT 0,
  ieps_monto NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.ventas
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "Tenant isolation" ON public.venta_lineas
  FOR ALL USING (EXISTS (
    SELECT 1 FROM ventas v WHERE v.id = venta_lineas.venta_id AND v.empresa_id = get_my_empresa_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ventas v WHERE v.id = venta_lineas.venta_id AND v.empresa_id = get_my_empresa_id()
  ));
