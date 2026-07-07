CREATE OR REPLACE FUNCTION public.get_empresa_user_emails(p_empresa_id uuid)
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id::uuid AS user_id, u.email::text
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE p.empresa_id = p_empresa_id
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles me
        WHERE me.user_id = auth.uid() AND me.empresa_id = p_empresa_id
      )
      -- Super admin siempre puede ver los correos, incluso cuando está
      -- impersonando otra empresa (is_super_admin devuelve false en ese caso).
      OR EXISTS (
        SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()
      )
    );
$function$;