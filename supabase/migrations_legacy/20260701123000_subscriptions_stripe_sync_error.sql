-- Visibilidad del sync a Stripe: cuando el trabajo diario (billing-cycle) no
-- pueda ajustar la cantidad de una suscripción en Stripe, guarda el error aquí
-- para que el super admin lo vea en el panel (antes fallaba en silencio y la
-- cantidad quedaba vieja, cobrando de más — el caso de MG).
alter table public.subscriptions
  add column if not exists stripe_sync_error text,
  add column if not exists stripe_sync_error_at timestamptz;
