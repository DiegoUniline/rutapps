
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
    RETURN;
  END IF;

  IF v_calculo = 'ultimo' THEN
    SELECT cl.precio_unitario / NULLIF(COALESCE(cl.factor_conversion, 1), 0)
      INTO v_new_cost
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE cl.producto_id = p_producto_id
      AND c.empresa_id = v_empresa_id
      AND c.status IN ('recibida', 'pagada')
    ORDER BY c.fecha DESC, c.created_at DESC
    LIMIT 1;

  ELSIF v_calculo = 'ultimo_compra' THEN
    SELECT cl.precio_unitario / NULLIF(COALESCE(cl.factor_conversion, 1), 0)
      INTO v_new_cost
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE cl.producto_id = p_producto_id
      AND c.empresa_id = v_empresa_id
      AND c.status IN ('recibida', 'pagada')
      AND c.condicion_pago = 'contado'
    ORDER BY c.fecha DESC, c.created_at DESC
    LIMIT 1;

  ELSIF v_calculo = 'ultimo_proveedor' THEN
    SELECT pp.proveedor_id INTO v_proveedor_id
    FROM producto_proveedores pp
    WHERE pp.producto_id = p_producto_id
      AND pp.es_principal = true
    LIMIT 1;

    IF v_proveedor_id IS NOT NULL THEN
      SELECT cl.precio_unitario / NULLIF(COALESCE(cl.factor_conversion, 1), 0)
        INTO v_new_cost
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
    -- Promedio ponderado por PIEZAS totales (cantidad * factor_conversion)
    -- Costo por pieza = precio_unitario / factor_conversion
    SELECT
      SUM(cl.precio_unitario * cl.cantidad)
      / NULLIF(SUM(cl.cantidad * COALESCE(cl.factor_conversion, 1)), 0)
      INTO v_new_cost
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE cl.producto_id = p_producto_id
      AND c.empresa_id = v_empresa_id
      AND c.status IN ('recibida', 'pagada');
  END IF;

  IF v_new_cost IS NOT NULL THEN
    UPDATE productos SET costo = ROUND(v_new_cost, 4) WHERE id = p_producto_id;
  END IF;
END;
$$;
