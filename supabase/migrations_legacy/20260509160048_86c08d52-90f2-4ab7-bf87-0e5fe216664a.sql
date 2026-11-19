UPDATE public.subscriptions
SET acceso_bloqueado = false,
    status = CASE WHEN status IN ('suspended','past_due','cancelada') THEN 'active' ELSE status END,
    fecha_vencimiento = COALESCE(fecha_vencimiento, current_period_end),
    updated_at = now()
WHERE acceso_bloqueado = true
  AND public.tiene_cobertura_vigente(empresa_id) = true;