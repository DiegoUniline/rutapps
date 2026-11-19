DROP POLICY IF EXISTS cll_select_empresa ON public.compra_linea_lotes;
DROP POLICY IF EXISTS cll_insert_empresa ON public.compra_linea_lotes;
DROP POLICY IF EXISTS cll_update_empresa ON public.compra_linea_lotes;
DROP POLICY IF EXISTS cll_delete_empresa ON public.compra_linea_lotes;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_linea_lotes TO authenticated;
GRANT ALL ON public.compra_linea_lotes TO service_role;

ALTER TABLE public.compra_linea_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.compra_linea_lotes
FOR ALL TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));