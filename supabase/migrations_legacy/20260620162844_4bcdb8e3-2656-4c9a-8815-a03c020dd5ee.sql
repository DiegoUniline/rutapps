
ALTER TABLE public.internal_notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS internal_notifications_empresa_dedupe_uidx
  ON public.internal_notifications (empresa_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
