
-- Function to recalculate product cost based on calculo_costo setting
CREATE OR REPLACE FUNCTION public.recalc_producto_costo(p_producto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calculo calculo_costo;
  v_new_cost numeric;
  v_empresa_id uuid;
  v_proveedor_id uuid;
BEGIN
  SELECT calculo_costo, empresa_id
    INTO v_calculo, v_empresa_id
    FROM productos WHERE id = p_producto_id;

  IF v_calculo IS NULL OR v_calculo = 'manual' OR v_calculo = 'estandar' THEN
    RETURN; -- no auto-recalc
  END IF;

  IF v_calculo = 'ultimo' THEN
    -- Last purchase cost from any compra (most recent recibida)
    SELECT cl.precio_unitario INTO v_new_cost
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE cl.producto_id = p_producto_id
      AND c.empresa_id = v_empresa_id
      AND c.status IN ('recibida', 'pagada')
    ORDER BY c.fecha DESC, c.created_at DESC
    LIMIT 1;

  ELSIF v_calculo = 'ultimo_compra' THEN
    -- Same as ultimo but only direct purchases (contado)
    SELECT cl.precio_unitario INTO v_new_cost
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE cl.producto_id = p_producto_id
      AND c.empresa_id = v_empresa_id
      AND c.status IN ('recibida', 'pagada')
      AND c.condicion_pago = 'contado'
    ORDER BY c.fecha DESC, c.created_at DESC
    LIMIT 1;

  ELSIF v_calculo = 'ultimo_proveedor' THEN
    -- Last cost from principal supplier
    SELECT pp.proveedor_id INTO v_proveedor_id
    FROM producto_proveedores pp
    JOIN productos p ON p.id = pp.producto_id
    WHERE pp.producto_id = p_producto_id
      AND pp.es_principal = true
    LIMIT 1;

    IF v_proveedor_id IS NOT NULL THEN
      SELECT cl.precio_unitario INTO v_new_cost
      FROM compra_lineas cl
      JOIN compras c ON c.id = cl.compra_id
      WHERE cl.producto_id = p_producto_id
        AND c.empresa_id = v_empresa_id
        AND c.proveedor_id = v_proveedor_id
        AND c.status IN ('recibida', 'pagada')
      ORDER BY c.fecha DESC, c.created_at DESC
      LIMIT 1;
    END IF;

  ELSIF v_calculo = 'promedio' THEN
    -- Weighted average of all purchase costs
    SELECT SUM(cl.precio_unitario * cl.cantidad) / NULLIF(SUM(cl.cantidad), 0)
      INTO v_new_cost
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE cl.producto_id = p_producto_id
      AND c.empresa_id = v_empresa_id
      AND c.status IN ('recibida', 'pagada');
  END IF;

  IF v_new_cost IS NOT NULL THEN
    UPDATE productos SET costo = ROUND(v_new_cost, 2) WHERE id = p_producto_id;
  END IF;
END;
$$;

-- Trigger function: when compras status changes to recibida/pagada, recalc costs
CREATE OR REPLACE FUNCTION public.trg_compra_recalc_costos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Only act when status changes to recibida or pagada
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('recibida', 'pagada')
      AND (OLD.status IS DISTINCT FROM NEW.status)) THEN
    FOR r IN SELECT DISTINCT producto_id FROM compra_lineas WHERE compra_id = NEW.id
    LOOP
      PERFORM recalc_producto_costo(r.producto_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists and recreate trigger
DROP TRIGGER IF EXISTS trg_compra_recalc_costos ON compras;
CREATE TRIGGER trg_compra_recalc_costos
  AFTER UPDATE ON compras
  FOR EACH ROW
  EXECUTE FUNCTION trg_compra_recalc_costos();
