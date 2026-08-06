CREATE OR REPLACE FUNCTION public.has_admin_pin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = p_user_id
      AND pin_code IS NOT NULL
      AND length(btrim(pin_code)) > 0
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_admin_pin(uuid) TO authenticated;