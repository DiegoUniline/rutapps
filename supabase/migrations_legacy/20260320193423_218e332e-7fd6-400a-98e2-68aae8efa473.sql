
-- Add almacen_id to auditorias
ALTER TABLE public.auditorias ADD COLUMN IF NOT EXISTS almacen_id uuid REFERENCES public.almacenes(id);

-- Backfill: for auditorias with filtro_tipo='almacen', set almacen_id from filtro_valor
UPDATE public.auditorias 
SET almacen_id = filtro_valor::uuid 
WHERE filtro_tipo = 'almacen' AND filtro_valor IS NOT NULL AND filtro_valor ~ '^[0-9a-f]{8}-';

-- RPC: Calculate theoretical stock for an audit line
-- Formula: stock_inicial + entradas - salidas (between audit open and now/close)
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
  -- Get line + audit info
  SELECT al.producto_id, al.cantidad_esperada, a.almacen_id, a.created_at
  INTO v_producto_id, v_cantidad_esperada, v_almacen_id, v_apertura
  FROM auditoria_lineas al
  JOIN auditorias a ON a.id = al.auditoria_id
  WHERE al.id = p_linea_id;

  IF v_producto_id IS NULL OR v_almacen_id IS NULL THEN
    RETURN v_cantidad_esperada;
  END IF;

  -- Calculate net movements since audit opened
  -- entrada to this almacen = positive
  -- salida from this almacen = negative
  SELECT COALESCE(SUM(
    CASE 
      WHEN tipo = 'entrada' AND almacen_origen_id = v_almacen_id THEN cantidad
      WHEN tipo = 'salida' AND almacen_origen_id = v_almacen_id THEN -cantidad
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
    -- Exclude movements from this same audit (conteo_fisico adjustments)
    AND (referencia_tipo IS NULL OR referencia_tipo != 'auditoria');

  RETURN v_cantidad_esperada + v_net_movements;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.calc_audit_stock_teorico(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_audit_stock_teorico(uuid) TO anon;
