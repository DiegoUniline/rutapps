alter table public.subscriptions
  add column if not exists stripe_sync_error text,
  add column if not exists stripe_sync_error_at timestamptz;