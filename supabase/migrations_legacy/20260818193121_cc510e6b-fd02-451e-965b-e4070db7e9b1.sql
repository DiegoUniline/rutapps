DROP POLICY IF EXISTS "stock_apartado tenant access" ON public.stock_apartado;

CREATE POLICY "stock_apartado_select" ON public.stock_apartado
FOR SELECT TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "stock_apartado_insert" ON public.stock_apartado
FOR INSERT TO authenticated
WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "stock_apartado_update" ON public.stock_apartado
FOR UPDATE TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "stock_apartado_delete" ON public.stock_apartado
FOR DELETE TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_apartado TO authenticated;
GRANT ALL ON public.stock_apartado TO service_role;