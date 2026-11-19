-- ============================================================================
-- LOTES · Ventas/Pedidos — Paso 1 (cimientos): motor central de stock por lote
--
-- Idea clave: en vez de que cada función de inventario mantenga stock_lotes por
-- su cuenta, se centraliza en UN trigger sobre movimientos_inventario. Cuando un
-- movimiento trae lote_id, el trigger aplica el delta a stock_lotes según los
-- almacenes de origen/destino (igual convención que stock_almacen):
--   • almacen_destino_id  → suma  (entradas, devoluciones, recepción, cancelación)
--   • almacen_origen_id   → resta (salidas por venta, surtido)
-- Así CUALQUIER flujo (venta, cancelación, compra, surtido, traspaso) mueve el
-- lote correcto con solo poner lote_id en su movimiento. Sin duplicar.
--
-- INERTE para lo existente: solo actúa en movimientos con lote_id. Hoy únicamente
-- los produce la recepción de compra (que se adapta abajo para usar el trigger).
-- ============================================================================

-- 1) Trazabilidad de lote en las líneas (para venta directa y surtido).
ALTER TABLE public.venta_lineas   ADD COLUMN IF NOT EXISTS lote_id uuid NULL;
ALTER TABLE public.entrega_lineas ADD COLUMN IF NOT EXISTS lote_id uuid NULL;

-- 2) Helper: aplica un delta a stock_lotes (almacén + lote). Puede quedar en
--    negativo, igual que stock_almacen, para no bloquear operaciones de ruta.
CREATE OR REPLACE FUNCTION public._aplica_stock_lote(
  p_empresa uuid, p_almacen uuid, p_producto uuid, p_lote uuid, p_delta numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF p_lote IS NULL OR p_almacen IS NULL OR COALESCE(p_delta,0) = 0 THEN RETURN; END IF;
  INSERT INTO public.stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
  VALUES (p_empresa, p_almacen, p_producto, p_lote, p_delta)
  ON CONFLICT (almacen_id, lote_id)
    DO UPDATE SET cantidad = public.stock_lotes.cantidad + EXCLUDED.cantidad, updated_at = now();
END;
$function$;

-- 3) Trigger central: mantiene stock_lotes desde cada movimiento con lote_id.
CREATE OR REPLACE FUNCTION public.sync_stock_lote_from_movimiento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lote_id IS NULL THEN RETURN NEW; END IF;
  -- Suma en destino, resta en origen (soporta entrada, salida y traspaso).
  IF NEW.almacen_destino_id IS NOT NULL THEN
    PERFORM public._aplica_stock_lote(NEW.empresa_id, NEW.almacen_destino_id, NEW.producto_id, NEW.lote_id,  COALESCE(NEW.cantidad,0));
  END IF;
  IF NEW.almacen_origen_id IS NOT NULL THEN
    PERFORM public._aplica_stock_lote(NEW.empresa_id, NEW.almacen_origen_id,  NEW.producto_id, NEW.lote_id, -COALESCE(NEW.cantidad,0));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_stock_lote ON public.movimientos_inventario;
CREATE TRIGGER trg_sync_stock_lote
AFTER INSERT ON public.movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_lote_from_movimiento();

-- 4) Adaptar la recepción de compra: ya NO actualiza stock_lotes a mano; ahora
--    lo hace el trigger central a partir del movimiento (que ya lleva lote_id).
--    (El resto de la función queda idéntico.)
DROP FUNCTION IF EXISTS public.recibir_compra_linea_parcial(uuid, numeric, uuid, uuid, uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.recibir_compra_linea_parcial(
  p_linea_id uuid, p_piezas numeric, p_almacen_id uuid, p_empresa_id uuid,
  p_compra_id uuid, p_folio text, p_user_id uuid, p_lote_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_producto_id uuid; v_cantidad numeric; v_factor numeric; v_recibido numeric;
  v_total_piezas numeric; v_pendiente numeric; v_a_recibir numeric;
  v_sa_id uuid; v_sa_qty numeric; v_today date := current_date; v_pendiente_compra numeric;
BEGIN
  SELECT producto_id, cantidad, COALESCE(NULLIF(factor_conversion,0), 1), cantidad_recibida
    INTO v_producto_id, v_cantidad, v_factor, v_recibido
  FROM compra_lineas WHERE id = p_linea_id FOR UPDATE;
  IF v_producto_id IS NULL THEN RAISE EXCEPTION 'Línea de compra no encontrada'; END IF;

  v_total_piezas := v_cantidad * v_factor;
  v_pendiente := GREATEST(0, v_total_piezas - v_recibido);
  IF v_pendiente <= 0 THEN RETURN; END IF;
  v_a_recibir := LEAST(COALESCE(p_piezas, v_pendiente), v_pendiente);
  IF v_a_recibir <= 0 THEN RETURN; END IF;

  IF p_lote_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE id = p_lote_id AND producto_id = v_producto_id) THEN
      RAISE EXCEPTION 'El lote no corresponde al producto de la línea';
    END IF;
  END IF;

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

  -- El movimiento lleva lote_id → el trigger central actualiza stock_lotes.
  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
  VALUES (p_empresa_id, 'entrada', v_producto_id, v_a_recibir, p_almacen_id, 'compra', p_compra_id, p_user_id, v_today,
          concat('Compra ', COALESCE(p_folio, p_compra_id::text), ' recepción parcial'), p_lote_id);

  UPDATE compra_lineas SET cantidad_recibida = v_recibido + v_a_recibir WHERE id = p_linea_id;

  SELECT COALESCE(SUM(GREATEST(0, cantidad * COALESCE(NULLIF(factor_conversion,0),1) - cantidad_recibida)), 0)
    INTO v_pendiente_compra
  FROM compra_lineas WHERE compra_id = p_compra_id;
  IF v_pendiente_compra = 0 THEN
    UPDATE compras SET status = 'recibida' WHERE id = p_compra_id AND status NOT IN ('recibida','pagada','cancelada');
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recibir_compra_linea_parcial(uuid, numeric, uuid, uuid, uuid, text, uuid, uuid) TO authenticated, service_role;
