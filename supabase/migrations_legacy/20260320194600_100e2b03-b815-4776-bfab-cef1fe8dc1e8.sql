
-- Fix calc_audit_stock_teorico: correct column checks for entrada/salida
CREATE OR REPLACE FUNCTION public.calc_audit_stock_teorico(p_linea_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_producto_id uuid;
  v_almacen_id uuid;
  v_apertura timestamptz;
  v_cantidad_esperada numeric;
  v_net_movements numeric;
BEGIN
  SELECT al.producto_id, al.cantidad_esperada, a.almacen_id, a.created_at
  INTO v_producto_id, v_cantidad_esperada, v_almacen_id, v_apertura
  FROM auditoria_lineas al
  JOIN auditorias a ON a.id = al.auditoria_id
  WHERE al.id = p_linea_id;

  IF v_producto_id IS NULL OR v_almacen_id IS NULL THEN
    RETURN v_cantidad_esperada;
  END IF;

  -- entrada: stock arrives at almacen_destino_id → positive
  -- salida: stock leaves from almacen_origen_id → negative  
  -- transferencia: arrives at destino (+), leaves from origen (-)
  SELECT COALESCE(SUM(
    CASE 
      WHEN tipo = 'entrada' AND almacen_destino_id = v_almacen_id THEN cantidad
      WHEN tipo = 'entrada' AND almacen_origen_id = v_almacen_id THEN cantidad
      WHEN tipo = 'salida' AND almacen_origen_id = v_almacen_id THEN -cantidad
      WHEN tipo = 'salida' AND almacen_destino_id = v_almacen_id THEN -cantidad
      WHEN tipo = 'transferencia' AND almacen_destino_id = v_almacen_id THEN cantidad
      WHEN tipo = 'transferencia' AND almacen_origen_id = v_almacen_id THEN -cantidad
      ELSE 0
    END
  ), 0)
  INTO v_net_movements
  FROM movimientos_inventario
  WHERE producto_id = v_producto_id
    AND created_at > v_apertura
    AND (almacen_origen_id = v_almacen_id OR almacen_destino_id = v_almacen_id)
    AND (referencia_tipo IS NULL OR referencia_tipo != 'auditoria');

  RETURN v_cantidad_esperada + v_net_movements;
END;
$$;
