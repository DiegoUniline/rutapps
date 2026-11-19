-- ============================================================================
-- LOTES · La identidad del lote ahora incluye la CADUCIDAD
--
-- Antes: un lote era único por (empresa, producto, código).
-- Ahora:  (empresa, producto, código, caducidad).
-- Motivo: el MISMO producto puede recibir el MISMO número de lote con distinta
-- fecha de caducidad (dos entradas físicas) → deben ser dos lotes separados.
--
-- La caducidad NULL ("sin caducidad") se trata como un único valor vía COALESCE
-- a una fecha tope, para que no se puedan crear dos "sin caducidad" repetidos.
-- ============================================================================

-- Quitar la llave vieja (era un CONSTRAINT creado en la tabla).
ALTER TABLE public.lotes DROP CONSTRAINT IF EXISTS uq_lote_codigo;
DROP INDEX IF EXISTS public.uq_lote_codigo;

-- Nueva llave única incluyendo la caducidad.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lote_prod_cod_cad
  ON public.lotes (empresa_id, producto_id, codigo, (COALESCE(fecha_caducidad, '9999-12-31'::date)));

-- ----------------------------------------------------------------------------
-- Actualizar el RPC de asignación masiva: crear/reutilizar el lote ahora se
-- resuelve por (producto, código, caducidad). Distinta caducidad = otro lote.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asignar_lote_masivo(
  p_empresa_id uuid,
  p_almacen_id uuid,
  p_codigo text,
  p_caducidad date,
  p_fabricacion date,
  p_costo numeric,
  p_items jsonb,
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

    UPDATE productos SET maneja_lote = true
      WHERE id = v_producto AND empresa_id = p_empresa_id;

    -- Crear o recuperar por (producto, código, caducidad).
    SELECT id INTO v_lote FROM lotes
     WHERE empresa_id = p_empresa_id AND producto_id = v_producto
       AND codigo = btrim(p_codigo)
       AND COALESCE(fecha_caducidad, '9999-12-31'::date) = COALESCE(p_caducidad, '9999-12-31'::date);

    IF v_lote IS NULL THEN
      INSERT INTO lotes (empresa_id, producto_id, codigo, fecha_caducidad, fecha_fabricacion, costo)
      VALUES (p_empresa_id, v_producto, btrim(p_codigo), p_caducidad, p_fabricacion, p_costo)
      RETURNING id INTO v_lote;
    ELSE
      -- La caducidad ya coincide; solo refrescamos fabricación/costo si vienen.
      UPDATE lotes SET
        fecha_fabricacion = COALESCE(p_fabricacion, fecha_fabricacion),
        costo             = COALESCE(p_costo,       costo)
      WHERE id = v_lote;
    END IF;

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
