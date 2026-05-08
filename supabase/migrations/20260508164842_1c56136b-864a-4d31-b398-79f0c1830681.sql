CREATE UNIQUE INDEX IF NOT EXISTS uniq_entrega_activa_por_pedido
ON public.entregas (pedido_id)
WHERE pedido_id IS NOT NULL AND status IN ('borrador','asignado','cargado');