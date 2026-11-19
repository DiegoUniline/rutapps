-- ============================================================================
-- LOTES · Fase 2 (paso A) — Recepción de compra hacia un LOTE
--
-- Extiende recibir_compra_linea_parcial con un parámetro OPCIONAL p_lote_id.
-- Cuando se recibe hacia un lote:
--   • además de sumar a stock_almacen (total), suma a stock_lotes (desglose)
--   • guarda lote_id en el movimiento de inventario
-- Con p_lote_id = NULL el comportamiento es EXACTAMENTE el de antes.
--
-- Nota: se DROPea la versión de 7 args y se recrea con 8 (el 8º con DEFAULT
-- NULL) para no dejar dos overloads ambiguos. Las llamadas actuales (7 args con
-- nombre) siguen funcionando porque p_lote_id toma su valor por defecto.
-- ============================================================================

DROP FUNCTION IF EXISTS public.recibir_compra_linea_parcial(uuid, numeric, uuid, uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.recibir_compra_linea_parcial(
  p_linea_id uuid,
  p_piezas numeric,
  p_almacen_id uuid,
  p_empresa_id uuid,
  p_compra_id uuid,
  p_folio text,
  p_user_id uuid,
  p_lote_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_producto_id uuid;
  v_cantidad numeric;
  v_factor numeric;
  v_recibido numeric;
  v_total_piezas numeric;
  v_pendiente numeric;
  v_a_recibir numeric;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_today date := current_date;
  v_pendiente_compra numeric;
  v_sl_id uuid;
  v_sl_qty numeric;
BEGIN
  -- Lock línea y obtener estado
  SELECT producto_id, cantidad, COALESCE(NULLIF(factor_conversion,0), 1), cantidad_recibida
    INTO v_producto_id, v_cantidad, v_factor, v_recibido
  FROM compra_lineas WHERE id = p_linea_id FOR UPDATE;

  IF v_producto_id IS NULL THEN
    RAISE EXCEPTION 'Línea de compra no encontrada';
  END IF;

  v_total_piezas := v_cantidad * v_factor;
  v_pendiente := GREATEST(0, v_total_piezas - v_recibido);

  IF v_pendiente <= 0 THEN
    RETURN; -- nada que recibir
  END IF;

  v_a_recibir := LEAST(COALESCE(p_piezas, v_pendiente), v_pendiente);
  IF v_a_recibir <= 0 THEN
    RETURN;
  END IF;

  -- Si viene lote, validar que sea del mismo producto de la línea.
  IF p_lote_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE id = p_lote_id AND producto_id = v_producto_id) THEN
      RAISE EXCEPTION 'El lote no corresponde al producto de la línea';
    END IF;
  END IF;

  -- Stock TOTAL por almacén (igual que antes)
  IF p_almacen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen WHERE almacen_id = p_almacen_id AND producto_id = v_producto_id FOR UPDATE;

    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) + v_a_recibir, updated_at = now() WHERE id = v_sa_id;
    ELSE
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (p_empresa_id, p_almacen_id, v_producto_id, v_a_recibir);
    END IF;

    -- NUEVO: desglose por LOTE (solo si se recibe hacia un lote)
    IF p_lote_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_sl_id, v_sl_qty
      FROM stock_lotes WHERE almacen_id = p_almacen_id AND lote_id = p_lote_id FOR UPDATE;

      IF v_sl_id IS NOT NULL THEN
        UPDATE stock_lotes SET cantidad = COALESCE(v_sl_qty,0) + v_a_recibir, updated_at = now() WHERE id = v_sl_id;
      ELSE
        INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
        VALUES (p_empresa_id, p_almacen_id, v_producto_id, p_lote_id, v_a_recibir);
      END IF;
    END IF;
  END IF;

  -- Movimiento (ahora con lote_id)
  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
  VALUES (p_empresa_id, 'entrada', v_producto_id, v_a_recibir, p_almacen_id, 'compra', p_compra_id, p_user_id, v_today,
          concat('Compra ', COALESCE(p_folio, p_compra_id::text), ' recepción parcial'), p_lote_id);

  -- Avance en la línea
  UPDATE compra_lineas SET cantidad_recibida = v_recibido + v_a_recibir WHERE id = p_linea_id;

  -- Marcar compra recibida si ya no queda pendiente
  SELECT COALESCE(SUM(GREATEST(0, cantidad * COALESCE(NULLIF(factor_conversion,0),1) - cantidad_recibida)), 0)
    INTO v_pendiente_compra
  FROM compra_lineas WHERE compra_id = p_compra_id;

  IF v_pendiente_compra = 0 THEN
    UPDATE compras
       SET status = 'recibida'
     WHERE id = p_compra_id AND status NOT IN ('recibida','pagada','cancelada');
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recibir_compra_linea_parcial(uuid, numeric, uuid, uuid, uuid, text, uuid, uuid) TO authenticated, service_role;
