
-- Enums
CREATE TYPE public.status_producto AS ENUM ('activo', 'inactivo', 'borrador');
CREATE TYPE public.tipo_comision AS ENUM ('porcentaje', 'monto_fijo');
CREATE TYPE public.calculo_costo AS ENUM ('promedio', 'ultimo', 'estandar', 'manual');
CREATE TYPE public.tipo_tarifa AS ENUM ('general', 'por_cliente', 'por_ruta');

-- Empresas
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to get empresa_id for current user
CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Marcas
CREATE TABLE public.marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;

-- Proveedores
CREATE TABLE public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- Clasificaciones
CREATE TABLE public.clasificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clasificaciones ENABLE ROW LEVEL SECURITY;

-- Listas
CREATE TABLE public.listas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.listas ENABLE ROW LEVEL SECURITY;

-- Unidades de medida
CREATE TABLE public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  abreviatura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

-- Tasas IVA
CREATE TABLE public.tasas_iva (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  porcentaje NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasas_iva ENABLE ROW LEVEL SECURITY;

-- Tasas IEPS
CREATE TABLE public.tasas_ieps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  porcentaje NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasas_ieps ENABLE ROW LEVEL SECURITY;

-- Almacenes
CREATE TABLE public.almacenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;

-- Unidades SAT
CREATE TABLE public.unidades_sat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.unidades_sat ENABLE ROW LEVEL SECURITY;

-- Productos
CREATE TABLE public.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  clave_alterna TEXT,
  marca_id UUID REFERENCES public.marcas(id),
  proveedor_id UUID REFERENCES public.proveedores(id),
  costo NUMERIC DEFAULT 0,
  clasificacion_id UUID REFERENCES public.clasificaciones(id),
  lista_id UUID REFERENCES public.listas(id),
  imagen_url TEXT,
  precio_principal NUMERIC DEFAULT 0,
  se_puede_comprar BOOLEAN DEFAULT true,
  se_puede_vender BOOLEAN DEFAULT true,
  vender_sin_stock BOOLEAN DEFAULT false,
  se_puede_inventariar BOOLEAN DEFAULT true,
  es_combo BOOLEAN DEFAULT false,
  min NUMERIC DEFAULT 0,
  max NUMERIC DEFAULT 0,
  manejar_lotes BOOLEAN DEFAULT false,
  unidad_compra_id UUID REFERENCES public.unidades(id),
  unidad_venta_id UUID REFERENCES public.unidades(id),
  factor_conversion NUMERIC DEFAULT 1,
  permitir_descuento BOOLEAN DEFAULT false,
  monto_maximo NUMERIC DEFAULT 0,
  cantidad NUMERIC DEFAULT 0,
  tiene_comision BOOLEAN DEFAULT false,
  tipo_comision public.tipo_comision DEFAULT 'porcentaje',
  pct_comision NUMERIC DEFAULT 0,
  status public.status_producto DEFAULT 'borrador',
  almacenes UUID[] DEFAULT '{}',
  tiene_iva BOOLEAN DEFAULT false,
  tiene_ieps BOOLEAN DEFAULT false,
  tasa_iva_id UUID REFERENCES public.tasas_iva(id),
  tasa_ieps_id UUID REFERENCES public.tasas_ieps(id),
  calculo_costo public.calculo_costo DEFAULT 'promedio',
  codigo_sat TEXT,
  udem_sat_id UUID REFERENCES public.unidades_sat(id),
  contador INTEGER DEFAULT 0,
  contador_tarifas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- Tarifas
CREATE TABLE public.tarifas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo public.tipo_tarifa DEFAULT 'general',
  moneda TEXT DEFAULT 'MXN',
  vigencia_inicio DATE,
  vigencia_fin DATE,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;

-- Tarifa Lineas
CREATE TABLE public.tarifa_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_id UUID NOT NULL REFERENCES public.tarifas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  precio NUMERIC NOT NULL DEFAULT 0,
  precio_minimo NUMERIC DEFAULT 0,
  descuento_max NUMERIC DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tarifa_lineas ENABLE ROW LEVEL SECURITY;

-- Producto-Tarifa junction
CREATE TABLE public.producto_tarifas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  tarifa_id UUID NOT NULL REFERENCES public.tarifas(id) ON DELETE CASCADE,
  UNIQUE(producto_id, tarifa_id)
);
ALTER TABLE public.producto_tarifas ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Empresas
CREATE POLICY "Users can view their empresa" ON public.empresas
  FOR SELECT USING (id = public.get_my_empresa_id());

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Tenant-scoped RLS for all tenant tables
CREATE POLICY "Tenant isolation" ON public.marcas FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.proveedores FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.clasificaciones FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.listas FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.unidades FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.tasas_iva FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.tasas_ieps FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.almacenes FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.productos FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "Tenant isolation" ON public.tarifas FOR ALL USING (empresa_id = public.get_my_empresa_id()) WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Tenant isolation" ON public.tarifa_lineas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tarifas t WHERE t.id = tarifa_id AND t.empresa_id = public.get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tarifas t WHERE t.id = tarifa_id AND t.empresa_id = public.get_my_empresa_id()));

CREATE POLICY "Tenant isolation" ON public.producto_tarifas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND p.empresa_id = public.get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND p.empresa_id = public.get_my_empresa_id()));

-- Unidades SAT: public read
CREATE POLICY "Public read" ON public.unidades_sat FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_productos_empresa ON public.productos(empresa_id);
CREATE INDEX idx_productos_status ON public.productos(status);
CREATE INDEX idx_productos_codigo ON public.productos(codigo);
CREATE INDEX idx_tarifas_empresa ON public.tarifas(empresa_id);
CREATE INDEX idx_tarifa_lineas_tarifa ON public.tarifa_lineas(tarifa_id);
CREATE INDEX idx_tarifa_lineas_producto ON public.tarifa_lineas(producto_id);

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nombre, empresa_id)
  SELECT NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), e.id
  FROM public.empresas e LIMIT 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
