
-- Fix: disable solo_movil permission for all roles that are NOT explicitly solo_movil roles
UPDATE public.role_permisos
SET permitido = false
WHERE modulo = 'solo_movil'
  AND role_id IN (
    SELECT id FROM public.roles WHERE solo_movil IS NOT TRUE
  );
