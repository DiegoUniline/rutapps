-- Un perfil archivado no debe poder seguir resolviendo su empresa ni su propio
-- perfil usando un access token emitido antes de la baja. Esta política es
-- RESTRICTIVE, por lo que se combina con las políticas SELECT/UPDATE existentes.
DROP POLICY IF EXISTS "Active app users only" ON public.profiles;
CREATE POLICY "Active app users only"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.is_active_app_user(auth.uid())
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  public.is_active_app_user(auth.uid())
  OR public.is_super_admin(auth.uid())
);
