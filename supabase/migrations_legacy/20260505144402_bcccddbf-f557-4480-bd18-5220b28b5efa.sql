UPDATE public.subscriptions
SET status = 'active',
    acceso_bloqueado = false,
    updated_at = now()
WHERE empresa_id = '66ac277d-c859-4d0e-beeb-f9162e3ade81';