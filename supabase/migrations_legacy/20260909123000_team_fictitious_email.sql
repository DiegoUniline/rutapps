BEGIN;

ALTER TABLE public.platform_team_members
  ADD COLUMN IF NOT EXISTS email_is_fictitious boolean NOT NULL DEFAULT false;

-- El super admin puede persistir si el correo es solo un identificador de acceso.
-- La contraseña y la confirmación del usuario siguen administrándose en Auth.

COMMIT;
