
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activo';
