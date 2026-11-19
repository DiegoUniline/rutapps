CREATE INDEX IF NOT EXISTS idx_super_admins_user_id ON public.super_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_venta_lineas_venta_id ON public.venta_lineas(venta_id);
CREATE INDEX IF NOT EXISTS idx_visitas_empresa_cliente ON public.visitas(empresa_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobros_empresa_cliente ON public.cobros(empresa_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobro_aplicaciones_cobro_id ON public.cobro_aplicaciones(cobro_id);
CREATE INDEX IF NOT EXISTS idx_cobro_aplicaciones_venta_id ON public.cobro_aplicaciones(venta_id);