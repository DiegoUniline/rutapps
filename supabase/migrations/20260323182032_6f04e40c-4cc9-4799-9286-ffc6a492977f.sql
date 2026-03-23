
-- Update RLS policies for main tables to allow super_admins to see any empresa's data
-- Instead of changing get_my_empresa_id (which would affect all tables), 
-- we update the specific policies to add a super_admin bypass

-- Drop and recreate policies with super admin bypass
DROP POLICY IF EXISTS "Tenant isolation" ON public.clientes;
CREATE POLICY "Tenant isolation" ON public.clientes
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.ventas;
CREATE POLICY "Tenant isolation" ON public.ventas
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cobros;
CREATE POLICY "Tenant isolation" ON public.cobros
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.productos;
CREATE POLICY "Tenant isolation" ON public.productos
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.stock_almacen;
CREATE POLICY "Tenant isolation" ON public.stock_almacen
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));
