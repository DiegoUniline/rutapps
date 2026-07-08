-- REVERTIR SURTIDO DE UNA LÍNEA (des-surtir / cambiar lote)
--
-- En la operación real se corrigen surtidos: elegí mal el lote, quiero surtir
-- de otro, o cancelar el surtido de una línea. Hoy una línea surtida queda
-- congelada. Esta función revierte SOLO la capa de "surtido" (movimientos con
-- referencia_tipo='entrega') de una línea, dejándola pendiente para volver a
-- surtir.
--
-- IMPORTANTE — solo capa de surtido:
--   * Revierte los movimientos 'entrega' (salida de la bodega) de esta
--     entrega+producto: repone stock_almacen en el origen y, si el movimiento
--     trae lote, repone stock_lotes MANUALMENTE (el trigger trg_sync_stock_lote
--     solo repone en INSERT, no en DELETE), y borra el movimiento.
--   * NO toca la capa de 'entrega_hecho' (descuento definitivo del camión). Por
--     eso el frontend solo la ofrece mientras la entrega NO esté en 'hecho'.
--
-- Nota: los movimientos se identifican por (entrega, producto[, lote]), no por
-- id de línea. Se asume que un producto no se repite en dos líneas de la misma
-- entrega (el buscador de productos ya evita duplicados).

CREATE OR REPLACE FUNCTION public.revertir_surtido_linea(
  p_linea_id uuid,
  p_entrega_id uuid,
  p_empresa_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_producto uuid;
  v_hecho boolean;
  v_mov record;
  v_upd int;
BEGIN
  -- Bloquear la línea; si no está surtida, no hay nada que revertir.
  SELECT producto_id, hecho INTO v_producto, v_hecho
  FROM entrega_lineas WHERE id = p_linea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Línea no encontrada'; END IF;

  -- Revertir los movimientos de surtido ('entrega') de esta entrega+producto.
  FOR v_mov IN
    SELECT id, cantidad, lote_id, almacen_origen_id
    FROM movimientos_inventario
    WHERE empresa_id = p_empresa_id
      AND referencia_tipo = 'entrega'
      AND referencia_id = p_entrega_id
      AND producto_id = v_producto
      AND tipo = 'salida'
    FOR UPDATE
  LOOP
    -- Reponer stock del almacén origen.
    IF v_mov.almacen_origen_id IS NOT NULL THEN
      UPDATE stock_almacen
      SET cantidad = cantidad + v_mov.cantidad, updated_at = now()
      WHERE almacen_id = v_mov.almacen_origen_id AND producto_id = v_producto;
      GET DIAGNOSTICS v_upd = ROW_COUNT;
      IF v_upd = 0 THEN
        INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (p_empresa_id, v_mov.almacen_origen_id, v_producto, v_mov.cantidad);
      END IF;
    END IF;

    -- Reponer stock del lote MANUALMENTE (el trigger no repone en DELETE).
    IF v_mov.lote_id IS NOT NULL AND v_mov.almacen_origen_id IS NOT NULL THEN
      PERFORM public._aplica_stock_lote(p_empresa_id, v_mov.almacen_origen_id, v_producto, v_mov.lote_id, v_mov.cantidad);
    END IF;

    DELETE FROM movimientos_inventario WHERE id = v_mov.id;
  END LOOP;

  -- Dejar la línea pendiente.
  UPDATE entrega_lineas
  SET hecho = false, cantidad_entregada = 0
  WHERE id = p_linea_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revertir_surtido_linea(uuid, uuid, uuid) TO authenticated, service_role;
