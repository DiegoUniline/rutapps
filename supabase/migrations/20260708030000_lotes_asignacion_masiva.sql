-- ============================================================================
-- LOTES · Asignación masiva desde Ajustes de inventario
--
-- RPC que, para una lista de productos, crea (o reutiliza) un lote con el mismo
-- código y FIJA su existencia por almacén a la cantidad indicada (la contada en
-- el ajuste). También marca los productos como maneja_lote = true.
--
-- Semántica: es un SET (no suma). Se usa junto al "Ajuste masivo", que ya deja
-- stock_almacen = cantidad contada; aquí dejamos stock_lotes = misma cantidad,
-- de modo que para ese producto  SUM(stock_lotes) = stock_almacen  (onboarding).
-- NO inserta movimientos: el movimiento del ajuste ya lo registra el flujo de
-- ajuste; aquí solo se etiqueta el stock por lote.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.asignar_lote_masivo(
  p_empresa_id uuid,
  p_almacen_id uuid,
  p_codigo text,
  p_caducidad date,
  p_fabricacion date,
  p_costo numeric,
  p_items jsonb,        -- [{"producto_id":"<uuid>","cantidad":100}, ...]
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_producto uuid;
  v_cant numeric;
  v_lote uuid;
  v_count int := 0;
BEGIN
  IF p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Falta el almacén';
  END IF;
  IF p_codigo IS NULL OR btrim(p_codigo) = '' THEN
    RAISE EXCEPTION 'El código de lote es obligatorio';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_producto := (v_item->>'producto_id')::uuid;
    v_cant := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_producto IS NULL THEN CONTINUE; END IF;

    -- El producto pasa a manejar lote.
    UPDATE productos SET maneja_lote = true
      WHERE id = v_producto AND empresa_id = p_empresa_id;

    -- Crear o recuperar el lote (único por empresa+producto+código).
    SELECT id INTO v_lote FROM lotes
     WHERE empresa_id = p_empresa_id AND producto_id = v_producto AND codigo = btrim(p_codigo);

    IF v_lote IS NULL THEN
      INSERT INTO lotes (empresa_id, producto_id, codigo, fecha_caducidad, fecha_fabricacion, costo)
      VALUES (p_empresa_id, v_producto, btrim(p_codigo), p_caducidad, p_fabricacion, p_costo)
      RETURNING id INTO v_lote;
    ELSE
      UPDATE lotes SET
        fecha_caducidad   = COALESCE(p_caducidad,  fecha_caducidad),
        fecha_fabricacion = COALESCE(p_fabricacion, fecha_fabricacion),
        costo             = COALESCE(p_costo,       costo)
      WHERE id = v_lote;
    END IF;

    -- FIJA la existencia del lote en el almacén = cantidad contada.
    INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
    VALUES (p_empresa_id, p_almacen_id, v_producto, v_lote, v_cant)
    ON CONFLICT (almacen_id, lote_id)
      DO UPDATE SET cantidad = EXCLUDED.cantidad, updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.asignar_lote_masivo(uuid, uuid, text, date, date, numeric, jsonb, uuid) TO authenticated, service_role;
