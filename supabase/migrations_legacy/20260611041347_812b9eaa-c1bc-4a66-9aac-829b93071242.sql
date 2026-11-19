
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS recibir_notificaciones boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_clientes_portal_token ON public.clientes(portal_token);

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS enviar_recibo_auto boolean NOT NULL DEFAULT true;

ALTER TABLE public.cobros
  ADD COLUMN IF NOT EXISTS notif_email_status text,
  ADD COLUMN IF NOT EXISTS notif_wa_status text,
  ADD COLUMN IF NOT EXISTS notif_error text;
