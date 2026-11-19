
UPDATE public.subscriptions
SET es_manual = true,
    acceso_bloqueado = false,
    status = 'active',
    updated_at = now()
WHERE empresa_id IN (
  '3add3496-ff9f-477b-b316-b55e3a38170c',
  '6d849e12-6437-4b24-917d-a89cc9b2fa88'
);

DELETE FROM public.facturas
WHERE empresa_id IN (
  '3add3496-ff9f-477b-b316-b55e3a38170c',
  '6d849e12-6437-4b24-917d-a89cc9b2fa88'
)
AND estado IN ('pendiente', 'procesando', 'past_due');
