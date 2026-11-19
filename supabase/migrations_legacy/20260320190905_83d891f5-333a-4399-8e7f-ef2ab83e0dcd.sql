CREATE OR REPLACE FUNCTION public.get_audit_users(p_auditoria_id uuid)
RETURNS TABLE(user_id uuid, nombre text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.nombre
  FROM profiles p
  WHERE p.empresa_id = (
    SELECT a.empresa_id FROM auditorias a WHERE a.id = p_auditoria_id LIMIT 1
  )
  AND p.estado = 'activo'
  ORDER BY p.nombre;
$$;