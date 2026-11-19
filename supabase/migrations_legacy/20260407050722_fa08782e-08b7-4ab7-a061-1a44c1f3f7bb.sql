-- Migration 2: Ensure auto_venta_entregado trigger on entregas (safety re-create)
DROP TRIGGER IF EXISTS trg_auto_venta_entregado ON entregas;
CREATE TRIGGER trg_auto_venta_entregado
  AFTER UPDATE OF status ON entregas
  FOR EACH ROW EXECUTE FUNCTION auto_venta_entregado();