
-- Assign Administrador role to all owners who don't have any role yet
INSERT INTO public.user_roles (user_id, role_id)
SELECT e.owner_user_id, r.id
FROM public.empresas e
JOIN public.roles r ON r.empresa_id = e.id AND r.es_sistema = true AND r.nombre = 'Administrador'
WHERE e.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = e.owner_user_id
  )
ON CONFLICT DO NOTHING;
