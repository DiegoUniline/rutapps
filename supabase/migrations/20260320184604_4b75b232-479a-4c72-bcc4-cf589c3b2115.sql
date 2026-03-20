
-- Allow users to update profiles within their same empresa (for admin user management)
CREATE POLICY "Users can update empresa profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (empresa_id = get_my_empresa_id())
WITH CHECK (empresa_id = get_my_empresa_id());
