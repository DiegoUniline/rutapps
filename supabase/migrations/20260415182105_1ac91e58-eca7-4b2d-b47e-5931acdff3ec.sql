
-- Accelerate get_my_empresa_id() RLS calls
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- Clientes composite indexes
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_status ON public.clientes(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_orden ON public.clientes(empresa_id, orden ASC);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_vendedor ON public.clientes(empresa_id, vendedor_id);

-- Productos composite indexes
CREATE INDEX IF NOT EXISTS idx_productos_empresa_status ON public.productos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_productos_empresa_nombre ON public.productos(empresa_id, nombre);

-- Ventas composite indexes
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_fecha ON public.ventas(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_vendedor ON public.ventas(empresa_id, vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_status ON public.ventas(empresa_id, status);

-- Cobros & Gastos
CREATE INDEX IF NOT EXISTS idx_cobros_empresa_fecha ON public.cobros(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_vendedor ON public.gastos(empresa_id, vendedor_id);
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_fecha ON public.gastos(empresa_id, fecha DESC);
