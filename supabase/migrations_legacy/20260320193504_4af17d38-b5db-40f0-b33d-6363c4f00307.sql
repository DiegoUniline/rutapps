
-- Update close_audit_line to recalculate theoretical stock when closing
CREATE OR REPLACE FUNCTION public.close_audit_line(p_linea_id uuid, p_cerrada boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teorico numeric;
  v_contado numeric;
BEGIN
  IF p_cerrada THEN
    -- Calculate theoretical stock considering movements during audit
    v_teorico := calc_audit_stock_teorico(p_linea_id);
    
    -- Get current counted amount
    SELECT COALESCE(cantidad_real, 0) INTO v_contado FROM auditoria_lineas WHERE id = p_linea_id;
    
    -- Update line with recalculated expected and difference
    UPDATE auditoria_lineas 
    SET cerrada = true, 
        cantidad_esperada = v_teorico,
        diferencia = v_contado - v_teorico
    WHERE id = p_linea_id;
  ELSE
    UPDATE auditoria_lineas SET cerrada = false WHERE id = p_linea_id;
  END IF;
END;
$$;

-- Update close_full_audit to recalculate all lines
CREATE OR REPLACE FUNCTION public.close_full_audit(p_auditoria_id uuid, p_cerrada_por text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linea RECORD;
  v_teorico numeric;
BEGIN
  -- Recalculate theoretical stock for all unclosed lines
  FOR v_linea IN 
    SELECT id, COALESCE(cantidad_real, 0) as contado 
    FROM auditoria_lineas 
    WHERE auditoria_id = p_auditoria_id AND cerrada = false
  LOOP
    v_teorico := calc_audit_stock_teorico(v_linea.id);
    UPDATE auditoria_lineas 
    SET cerrada = true,
        cantidad_esperada = v_teorico,
        diferencia = v_linea.contado - v_teorico
    WHERE id = v_linea.id;
  END LOOP;
  
  -- Close the audit
  UPDATE auditorias SET status = 'cerrada', cerrada_por = p_cerrada_por, cerrada_at = now() WHERE id = p_auditoria_id;
END;
$$;
