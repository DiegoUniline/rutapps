DROP POLICY IF EXISTS "Empresa admin manage tienda config" ON public.tienda_config;
CREATE POLICY "Empresa admin manage tienda config"
ON public.tienda_config
FOR ALL TO authenticated
USING (
  empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_super_admin(auth.uid())
);