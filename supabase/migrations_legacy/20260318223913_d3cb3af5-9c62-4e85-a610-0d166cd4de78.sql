
-- Super admins can manage ALL notifications across tenants
CREATE POLICY "Super admins manage all notifications"
ON public.notifications FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
