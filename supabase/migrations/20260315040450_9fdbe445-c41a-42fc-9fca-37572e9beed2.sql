
-- Enum for promotion types
CREATE TYPE public.tipo_promocion AS ENUM ('descuento_porcentaje', 'descuento_monto', 'producto_gratis', 'precio_especial', 'volumen');

-- Enum for what the promo applies to
CREATE TYPE public.aplica_promocion AS ENUM ('todos', 'producto', 'clasificacion', 'cliente', 'zona');

-- Main promotions table
CREATE TABLE public.promociones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo tipo_promocion NOT NULL DEFAULT 'descuento_porcentaje',
  aplica_a aplica_promocion NOT NULL DEFAULT 'todos',
  activa BOOLEAN NOT NULL DEFAULT true,
  -- Value fields
  valor NUMERIC NOT NULL DEFAULT 0, -- percentage, fixed amount, or special price
  cantidad_minima NUMERIC DEFAULT 0, -- min qty to trigger
  cantidad_gratis NUMERIC DEFAULT 0, -- qty given free (for producto_gratis type)
  producto_gratis_id UUID REFERENCES public.productos(id),
  -- Scope filters (which products/clients it applies to)
  producto_ids UUID[] DEFAULT '{}',
  clasificacion_ids UUID[] DEFAULT '{}',
  cliente_ids UUID[] DEFAULT '{}',
  zona_ids UUID[] DEFAULT '{}',
  -- Validity
  vigencia_inicio DATE,
  vigencia_fin DATE,
  -- Priority (higher = evaluated first)
  prioridad INTEGER NOT NULL DEFAULT 0,
  acumulable BOOLEAN NOT NULL DEFAULT false, -- can stack with other promos
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY "Tenant isolation" ON public.promociones
  FOR ALL
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Log of applied promotions per venta_linea
CREATE TABLE public.promocion_aplicada (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  venta_linea_id UUID REFERENCES public.venta_lineas(id) ON DELETE CASCADE,
  promocion_id UUID NOT NULL REFERENCES public.promociones(id),
  descripcion TEXT,
  descuento_aplicado NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.promocion_aplicada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.promocion_aplicada
  FOR ALL
  USING (EXISTS (SELECT 1 FROM ventas v WHERE v.id = promocion_aplicada.venta_id AND v.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM ventas v WHERE v.id = promocion_aplicada.venta_id AND v.empresa_id = get_my_empresa_id()));
