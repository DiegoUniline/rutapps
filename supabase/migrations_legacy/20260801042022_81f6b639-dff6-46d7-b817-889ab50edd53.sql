-- 1. Otorgar permisos a los roles necesarios (Requerido en Lovable Cloud)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 2. Asegurar que los Super Admins puedan gestionar roles sin restricciones de tenant
-- y que los usuarios autenticados puedan ver los roles de su propia empresa
DROP POLICY IF EXISTS "Tenant isolation" ON public.user_roles;

CREATE POLICY "Tenant isolation" ON public.user_roles 
FOR ALL 
TO authenticated
USING (
  is_super_admin(auth.uid()) 
  OR 
  (user_role_empresa_id(user_id) = get_my_empresa_id())
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR 
  (user_role_empresa_id(user_id) = get_my_empresa_id())
);

-- 3. Asegurar que la tabla tenga RLS habilitado
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;