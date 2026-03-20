
-- Add cerrada_at timestamp to auditoria_lineas
ALTER TABLE public.auditoria_lineas ADD COLUMN IF NOT EXISTS cerrada_at timestamptz DEFAULT NULL;

-- Update close_audit_line to set cerrada_at
CREATE OR REPLACE FUNCTION public.close_audit_line(p_linea_id uuid, p_cerrada boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auditoria_id uuid;
  v_producto_id uuid;
  v_cantidad_esperada numeric;
  v_total_scans numeric;
BEGIN
  SELECT auditoria_id, producto_id, cantidad_esperada
  INTO v_auditoria_id, v_producto_id, v_cantidad_esperada
  FROM auditoria_lineas WHERE id = p_linea_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Line not found'; END IF;

  -- Sum scans
  SELECT COALESCE(SUM(cantidad), 0) INTO v_total_scans
  FROM auditoria_escaneos WHERE linea_id = p_linea_id;

  IF p_cerrada THEN
    -- Try to recalculate expected via teorico engine
    BEGIN
      PERFORM calc_audit_stock_teorico(v_auditoria_id);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- ignore if function doesn't exist
    END;

    -- Re-read cantidad_esperada after recalc
    SELECT cantidad_esperada INTO v_cantidad_esperada
    FROM auditoria_lineas WHERE id = p_linea_id;

    UPDATE auditoria_lineas SET
      cerrada = true,
      cerrada_at = now(),
      cantidad_real = v_total_scans,
      diferencia = v_total_scans - v_cantidad_esperada
    WHERE id = p_linea_id;
  ELSE
    UPDATE auditoria_lineas SET
      cerrada = false,
      cerrada_at = NULL
    WHERE id = p_linea_id;
  END IF;
END;
$$;
