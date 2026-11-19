ALTER TABLE public.empresas
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN telefono SET NOT NULL;

ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_email_unique UNIQUE (email),
  ADD CONSTRAINT empresas_telefono_unique UNIQUE (telefono);