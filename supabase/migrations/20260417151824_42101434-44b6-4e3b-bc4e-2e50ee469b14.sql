-- Idempotent: recreate RPC with super admin support and explicit grant
CREATE OR REPLACE FUNCTION public.get_empresa_user_emails(p_empresa_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id::uuid AS user_id, u.email::text
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE p.empresa_id = p_empresa_id
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles me
        WHERE me.user_id = auth.uid() AND me.empresa_id = p_empresa_id
      )
      OR public.is_super_admin(auth.uid())
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_empresa_user_emails(uuid) TO authenticated;