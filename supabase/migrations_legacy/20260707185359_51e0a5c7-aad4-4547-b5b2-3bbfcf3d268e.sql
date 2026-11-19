
CREATE OR REPLACE FUNCTION public._current_user_nombre()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT nombre FROM public.profiles WHERE user_id = auth.uid() LIMIT 1), 'Sistema');
$$;
