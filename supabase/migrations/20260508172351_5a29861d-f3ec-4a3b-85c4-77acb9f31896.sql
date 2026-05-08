DROP POLICY IF EXISTS "Empresa members can view orden ruta" ON public.cliente_orden_ruta;
DROP POLICY IF EXISTS "Empresa members can insert orden ruta" ON public.cliente_orden_ruta;
DROP POLICY IF EXISTS "Empresa members can update orden ruta" ON public.cliente_orden_ruta;
DROP POLICY IF EXISTS "Empresa members can delete orden ruta" ON public.cliente_orden_ruta;

CREATE POLICY "cliente_orden_ruta_tenant_isolation"
ON public.cliente_orden_ruta
FOR ALL
USING ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))
WITH CHECK ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()));