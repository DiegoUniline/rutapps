DO $$
DECLARE eid uuid := '6d849e12-6437-4b24-917d-a89cc9b2fa88';
BEGIN
  DELETE FROM public.entrega_lineas WHERE entrega_id IN (SELECT id FROM public.entregas WHERE empresa_id=eid AND pedido_id IN (SELECT id FROM public.ventas WHERE empresa_id=eid AND tipo='pedido'));
  DELETE FROM public.entregas WHERE empresa_id=eid AND pedido_id IN (SELECT id FROM public.ventas WHERE empresa_id=eid AND tipo='pedido');
  DELETE FROM public.carga_pedidos WHERE venta_id IN (SELECT id FROM public.ventas WHERE empresa_id=eid AND tipo='pedido');
  DELETE FROM public.ventas WHERE empresa_id=eid AND tipo='pedido';
END $$;