DROP POLICY IF EXISTS "Users can update empresa profiles" ON public.profiles;

CREATE POLICY "Users can update empresa profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  empresa_id = public.get_my_empresa_id()
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  empresa_id = public.get_my_empresa_id()
  OR public.is_super_admin(auth.uid())
);