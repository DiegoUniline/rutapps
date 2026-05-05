ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_empresas_demo_expires_at
  ON public.empresas (demo_expires_at)
  WHERE demo_expires_at IS NOT NULL;