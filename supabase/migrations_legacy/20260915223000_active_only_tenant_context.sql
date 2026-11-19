-- Fuente central de contexto multiempresa para RLS.
-- Un JWT emitido antes de archivar a un usuario deja de resolver empresa en
-- cuanto su perfil deja de estar activo, de modo que las políticas tenant que
-- ya usan get_my_empresa_id() bloquean automáticamente su acceso en toda la BD.
CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.empresa_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.estado = 'activo'
    AND p.archivado_en IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_empresa_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_empresa_id() TO authenticated, service_role;
