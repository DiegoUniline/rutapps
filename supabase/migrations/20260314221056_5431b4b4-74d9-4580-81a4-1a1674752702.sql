
-- Enum for carga status
CREATE TYPE public.status_carga AS ENUM ('pendiente', 'en_ruta', 'completada', 'cancelada');

-- Enum for devolucion tipo
CREATE TYPE public.tipo_devolucion AS ENUM ('almacen', 'tienda');

-- Enum for devolucion motivo
CREATE TYPE public.motivo_devolucion AS ENUM ('no_vendido', 'vencido', 'danado', 'cambio', 'otro');

-- Cargas: load order assigned to a route/vendor
CREATE TABLE public.cargas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  vendedor_id UUID REFERENCES public.vendedores(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.status_carga NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cargas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.cargas
  FOR ALL TO public
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Carga lineas: products in a load
CREATE TABLE public.carga_lineas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carga_id UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  cantidad_cargada NUMERIC NOT NULL DEFAULT 0,
  cantidad_devuelta NUMERIC NOT NULL DEFAULT 0,
  cantidad_vendida NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.carga_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.carga_lineas
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM cargas c WHERE c.id = carga_lineas.carga_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM cargas c WHERE c.id = carga_lineas.carga_id AND c.empresa_id = get_my_empresa_id()));

-- Devoluciones
CREATE TABLE public.devoluciones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  vendedor_id UUID REFERENCES public.vendedores(id),
  cliente_id UUID REFERENCES public.clientes(id),
  carga_id UUID REFERENCES public.cargas(id),
  tipo public.tipo_devolucion NOT NULL DEFAULT 'almacen',
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.devoluciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.devoluciones
  FOR ALL TO public
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Devolucion lineas
CREATE TABLE public.devolucion_lineas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  devolucion_id UUID NOT NULL REFERENCES public.devoluciones(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  cantidad NUMERIC NOT NULL DEFAULT 1,
  motivo public.motivo_devolucion NOT NULL DEFAULT 'no_vendido',
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.devolucion_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.devolucion_lineas
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM devoluciones d WHERE d.id = devolucion_lineas.devolucion_id AND d.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM devoluciones d WHERE d.id = devolucion_lineas.devolucion_id AND d.empresa_id = get_my_empresa_id()));
