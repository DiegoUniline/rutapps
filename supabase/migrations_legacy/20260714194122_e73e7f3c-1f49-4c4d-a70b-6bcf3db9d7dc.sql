-- Borrar entrega del pedido PED-0001 y resetear el pedido a como nació
DO $$
DECLARE
  v_venta_id UUID := 'f53533b9-afd6-4f28-ba5b-e05a7c54f9b9';
  v_entrega_id UUID := 'a0d66b36-dc2b-48e3-8646-3eb500621b11';
BEGIN
  DELETE FROM entrega_lineas WHERE entrega_id = v_entrega_id;
  DELETE FROM carga_pedidos WHERE venta_id = v_venta_id;
  DELETE FROM entregas WHERE id = v_entrega_id;

  UPDATE ventas
  SET status = 'confirmado',
      saldo_pendiente = total,
      cerrado_at = NULL,
      cerrado_por = NULL,
      total_efectivo = NULL,
      cerrado_snapshot = NULL
  WHERE id = v_venta_id;
END $$;