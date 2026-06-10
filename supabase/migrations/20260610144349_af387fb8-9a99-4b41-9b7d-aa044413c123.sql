
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS super_admin_override_empresa_id uuid;
CREATE INDEX IF NOT EXISTS idx_profiles_super_admin_override_empresa_id ON public.profiles(super_admin_override_empresa_id);

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    CASE WHEN EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
      THEN (SELECT super_admin_override_empresa_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    END,
    (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = p_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = p_user_id AND super_admin_override_empresa_id IS NOT NULL
    );
$function$;
