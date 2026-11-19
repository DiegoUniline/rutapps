update public.subscriptions
set status = 'active',
    acceso_bloqueado = false,
    updated_at = now()
where status = 'suspended'
  and current_period_end is not null
  and current_period_end > now();