
-- 1) Columna para llevar avance de recepción por línea
ALTER TABLE public.compra_lineas
  ADD COLUMN IF NOT EXISTS cantidad_recibida numeric NOT NULL DEFAULT 0;

-- 2) Backfill: compras ya recibidas/pagadas se consideran 100% recibidas
UPDATE public.compra_lineas cl
SET cantidad_recibida = cl.cantidad * COALESCE(NULLIF(cl.factor_conversion,0), 1)
FROM public.compras c
WHERE cl.compra_id = c.id
  AND c.status IN ('recibida','pagada')
  AND cl.cantidad_recibida = 0;

-- 3) Nueva versión del RPC: recepción parcial por línea
CREATE OR REPLACE FUNCTION public.recibir_compra_linea_parcial(
  p_linea_id uuid,
  p_piezas numeric,
  p_almacen_id uuid,
  p_empresa_id uuid,
  p_compra_id uuid,
  p_folio text,
  p_user_id uuid
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

  -- Si p_piezas es NULL o mayor al pendiente, recibimos exactamente el pendiente
  v_a_recibir := LEAST(COALESCE(p_piezas, v_pendiente), v_pendiente);
  IF v_a_recibir <= 0 THEN
    RETURN;
  END IF;

  -- Sumar stock atómicamente
  IF p_almacen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen WHERE almacen_id = p_almacen_id AND producto_id = v_producto_id FOR UPDATE;

    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) + v_a_recibir, updated_at = now() WHERE id = v_sa_id;
    ELSE
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (p_empresa_id, p_almacen_id, v_producto_id, v_a_recibir);
    END IF;
  END IF;

  -- Registrar movimiento
  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'entrada', v_producto_id, v_a_recibir, p_almacen_id, 'compra', p_compra_id, p_user_id, v_today,
          concat('Compra ', COALESCE(p_folio, p_compra_id::text), ' recepción parcial'));

  -- Actualizar avance en la línea
  UPDATE compra_lineas SET cantidad_recibida = v_recibido + v_a_recibir WHERE id = p_linea_id;

  -- Si ya no queda pendiente en ninguna línea, marcar compra recibida (sin tocar pagada/cancelada)
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

GRANT EXECUTE ON FUNCTION public.recibir_compra_linea_parcial(uuid, numeric, uuid, uuid, uuid, text, uuid) TO authenticated, service_role;
