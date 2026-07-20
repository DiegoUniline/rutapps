
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'whatsapi',
  ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT,
  ADD COLUMN IF NOT EXISTS evolution_status TEXT DEFAULT 'desconectado',
  ADD COLUMN IF NOT EXISTS evolution_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS evolution_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evolution_last_qr_at TIMESTAMPTZ;

-- provider allowed values
ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_provider_check;
ALTER TABLE public.whatsapp_config
  ADD CONSTRAINT whatsapp_config_provider_check
  CHECK (provider IN ('whatsapi','evolution'));

-- Empresas ya existentes con token de whatsapi se quedan igual;
-- las que aún no tienen fila caerán en 'whatsapi' por default (sin token = inactivo).
