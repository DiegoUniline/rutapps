
-- Allow users to see all profiles within their same empresa
CREATE POLICY "Users can view empresa profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (empresa_id = get_my_empresa_id());
