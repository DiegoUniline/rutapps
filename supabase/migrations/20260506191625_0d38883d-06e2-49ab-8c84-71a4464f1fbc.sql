DROP POLICY IF EXISTS "Empresa puede ver sus presentaciones" ON public.producto_presentaciones;
DROP POLICY IF EXISTS "Empresa puede crear sus presentaciones" ON public.producto_presentaciones;
DROP POLICY IF EXISTS "Empresa puede actualizar sus presentaciones" ON public.producto_presentaciones;
DROP POLICY IF EXISTS "Empresa puede eliminar sus presentaciones" ON public.producto_presentaciones;

CREATE POLICY "Tenant isolation presentaciones"
ON public.producto_presentaciones
FOR ALL
TO authenticated
USING ((empresa_id = public.get_my_empresa_id()) OR public.is_super_admin(auth.uid()))
WITH CHECK ((empresa_id = public.get_my_empresa_id()) OR public.is_super_admin(auth.uid()));