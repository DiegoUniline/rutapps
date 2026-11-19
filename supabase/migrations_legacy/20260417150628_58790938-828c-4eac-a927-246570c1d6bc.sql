CREATE OR REPLACE FUNCTION public.get_empresa_user_emails(p_empresa_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id AS user_id, u.email::text
  FROM auth.users u
  WHERE u.id IN (
    SELECT p.user_id FROM public.profiles p WHERE p.empresa_id = p_empresa_id
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.user_id = auth.uid() AND me.empresa_id = p_empresa_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_empresa_user_emails(uuid) TO authenticated;