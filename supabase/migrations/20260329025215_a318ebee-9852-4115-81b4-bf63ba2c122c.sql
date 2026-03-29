
-- Add owner_user_id to empresas
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS owner_user_id uuid;

-- Populate owner as the earliest profile per empresa
UPDATE public.empresas e
SET owner_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (empresa_id) empresa_id, user_id
  FROM public.profiles
  ORDER BY empresa_id, created_at ASC
) sub
WHERE sub.empresa_id = e.id
  AND e.owner_user_id IS NULL;

-- Also auto-assign Administrador role to owners who don't have any role
INSERT INTO public.user_roles (user_id, role_id)
SELECT e.owner_user_id, r.id
FROM public.empresas e
JOIN public.roles r ON r.empresa_id = e.id AND r.es_sistema = true AND r.nombre = 'Administrador'
WHERE e.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = e.owner_user_id
  )
ON CONFLICT DO NOTHING;
