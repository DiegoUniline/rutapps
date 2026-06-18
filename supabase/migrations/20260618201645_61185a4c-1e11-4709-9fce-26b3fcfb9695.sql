
CREATE OR REPLACE FUNCTION public.super_admin_list_empresas()
RETURNS TABLE (
  id uuid,
  nombre text,
  status text,
  current_period_end timestamptz,
  trial_ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.nombre, s.status, s.current_period_end, s.trial_ends_at
  FROM public.empresas e
  LEFT JOIN public.subscriptions s ON s.empresa_id = e.id
  WHERE public.is_super_admin(auth.uid())
  ORDER BY e.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_list_empresas() TO authenticated;
