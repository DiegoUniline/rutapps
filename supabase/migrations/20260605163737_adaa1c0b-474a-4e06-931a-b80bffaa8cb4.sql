
-- Backfill fecha_vencimiento on pending invoices (3-day grace from emission)
UPDATE public.facturas
SET fecha_vencimiento = fecha_emision + INTERVAL '3 days'
WHERE estado IN ('pendiente','procesando','past_due')
  AND fecha_vencimiento IS NULL
  AND fecha_emision IS NOT NULL;

-- Suspend access for any non-manual subscription that currently has an
-- overdue pending invoice (grace period already exhausted).
UPDATE public.subscriptions s
SET acceso_bloqueado = true,
    status = 'past_due',
    updated_at = now()
WHERE s.es_manual IS NOT TRUE
  AND s.acceso_bloqueado IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.facturas f
    WHERE f.empresa_id = s.empresa_id
      AND f.estado IN ('pendiente','procesando','past_due')
      AND f.fecha_vencimiento < now()
  );
