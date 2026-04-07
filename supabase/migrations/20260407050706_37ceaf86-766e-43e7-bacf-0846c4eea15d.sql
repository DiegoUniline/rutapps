-- Migration 1: Connect apply_pedido_entregado_inventory trigger + DROP duplicate trigger
-- Drop the DUPLICATE trigger that causes double stock deduction
DROP TRIGGER IF EXISTS trg_apply_direct_sale_entregado ON ventas;
DROP FUNCTION IF EXISTS apply_direct_sale_entregado();

-- Create the missing trigger for pedido → entregado inventory
DROP TRIGGER IF EXISTS trg_apply_pedido_entregado_inventory ON ventas;
CREATE TRIGGER trg_apply_pedido_entregado_inventory
  AFTER UPDATE OF status ON ventas
  FOR EACH ROW EXECUTE FUNCTION apply_pedido_entregado_inventory();