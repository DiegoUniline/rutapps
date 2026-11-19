-- ============================================================================
-- LOTES · Fix RLS — usar el patrón canónico de la app
--
-- Las políticas originales usaban `empresa_id IN (SELECT empresa_id FROM
-- profiles WHERE id = auth.uid())`, que NO contempla el override de super-admin
-- (al ver otra empresa como super-admin, el INSERT fallaba con
-- "new row violates row-level security policy"). Se cambian al patrón que usa
-- el resto de tablas: `empresa_id = get_my_empresa_id() OR is_super_admin(...)`.
-- ============================================================================

-- lotes
DROP POLICY IF EXISTS "lotes_select" ON public.lotes;
DROP POLICY IF EXISTS "lotes_insert" ON public.lotes;
DROP POLICY IF EXISTS "lotes_update" ON public.lotes;
DROP POLICY IF EXISTS "lotes_delete" ON public.lotes;
CREATE POLICY "lotes_select" ON public.lotes FOR SELECT
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "lotes_insert" ON public.lotes FOR INSERT
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "lotes_update" ON public.lotes FOR UPDATE
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "lotes_delete" ON public.lotes FOR DELETE
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

-- stock_lotes
DROP POLICY IF EXISTS "stock_lotes_select" ON public.stock_lotes;
DROP POLICY IF EXISTS "stock_lotes_insert" ON public.stock_lotes;
DROP POLICY IF EXISTS "stock_lotes_update" ON public.stock_lotes;
DROP POLICY IF EXISTS "stock_lotes_delete" ON public.stock_lotes;
CREATE POLICY "stock_lotes_select" ON public.stock_lotes FOR SELECT
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "stock_lotes_insert" ON public.stock_lotes FOR INSERT
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "stock_lotes_update" ON public.stock_lotes FOR UPDATE
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "stock_lotes_delete" ON public.stock_lotes FOR DELETE
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
