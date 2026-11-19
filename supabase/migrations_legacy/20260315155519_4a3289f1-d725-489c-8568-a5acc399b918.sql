
-- Allow super admins to insert empresas
CREATE POLICY "Super admins can insert empresas" ON public.empresas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Allow super admins to update all empresas  
CREATE POLICY "Super admins can update all empresas" ON public.empresas
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
