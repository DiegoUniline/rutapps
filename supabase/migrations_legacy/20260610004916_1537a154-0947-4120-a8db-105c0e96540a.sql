DROP POLICY IF EXISTS "metas_venta tenant access" ON public.metas_venta;
CREATE POLICY "metas_venta tenant access" ON public.metas_venta
FOR ALL TO authenticated
USING (
  empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_super_admin(auth.uid())
);