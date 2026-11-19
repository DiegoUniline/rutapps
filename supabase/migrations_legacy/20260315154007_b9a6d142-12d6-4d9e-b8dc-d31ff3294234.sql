
-- Fix super_admins RLS to avoid infinite recursion by using is_super_admin function
DROP POLICY IF EXISTS "Super admins full access on super_admins" ON public.super_admins;

CREATE POLICY "Super admins full access on super_admins" ON public.super_admins
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Also need super admins to read ALL empresas (currently empresa RLS limits to own)
-- Add policy for super admins to see all empresas
CREATE POLICY "Super admins can view all empresas" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Super admins can manage all subscriptions (fix WITH CHECK to also allow empresa self-read)  
DROP POLICY IF EXISTS "Super admins full access on subscriptions" ON public.subscriptions;
CREATE POLICY "Empresa can read own subscription" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id());
CREATE POLICY "Super admins manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Super admins can view all profiles
CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
