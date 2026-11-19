REVOKE EXECUTE ON FUNCTION public.is_diego_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_diego_super_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_diego_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_diego_super_admin(uuid) TO service_role;