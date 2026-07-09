-- REVERSA DE LOTES AL CANCELAR (traspaso / compra / venta directa)
--
-- Problema: al confirmar, estos flujos SÍ mueven stock_lotes (los movimientos
-- llevan lote_id). Pero al CANCELAR, las funciones existentes solo reversan el
-- stock general (stock_almacen) e insertan movimientos SIN lote_id, así que
-- stock_lotes queda descuadrado (el lote se queda "atorado").
--
-- Solución SEGURA y aislada: NO se tocan las funciones de cancelación que ya
-- existen (ni cancelar_traspaso, ni el cancel de compra, ni
-- restore_cancelled_sale_inventory). Se agregan 3 triggers NUEVOS que, al
-- cancelar, insertan movimientos de COMPENSACIÓN con lote_id → el trigger central
-- trg_sync_stock_lote repone stock_lotes al lote/almacén correcto. Solo afectan
-- stock_lotes (no hay trigger que mueva stock_almacen desde movimientos), por lo
-- que el stock general se sigue reversando exactamente igual que hoy.
--
-- Productos sin lote: los filtros exigen lote_id IS NOT NULL → no hacen nada.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) TRASPASO cancelado → devolver el lote de destino a origen.
--    confirmar_traspaso emitió movimientos tipo='traspaso' con lote_id
--    (origen→destino). Al cancelar, insertamos el mismo movimiento con
--    origen/destino INVERTIDOS → el trigger mueve stock_lotes de vuelta.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revertir_lote_traspaso_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov RECORD;
BEGIN
  -- Solo al pasar de confirmado → cancelado (un traspaso en borrador nunca movió lote).
  IF NOT (OLD.status = 'confirmado' AND NEW.status = 'cancelado') THEN RETURN NEW; END IF;
  -- Idempotencia: si ya se compensó, no repetir.
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = NEW.id AND referencia_tipo = 'traspaso_cancel_lote') THEN
    RETURN NEW;
  END IF;

  FOR v_mov IN
    SELECT producto_id, cantidad, lote_id, almacen_origen_id, almacen_destino_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'traspaso'
      AND tipo = 'traspaso' AND lote_id IS NOT NULL
  LOOP
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
    VALUES
      (NEW.empresa_id, 'traspaso', v_mov.producto_id, v_mov.cantidad,
       v_mov.almacen_destino_id, v_mov.almacen_origen_id, v_mov.lote_id,
       'traspaso_cancel_lote', NEW.id, CURRENT_DATE, 'Reversa lote · cancelación traspaso');
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revertir_lote_traspaso_cancel ON public.traspasos;
CREATE TRIGGER trg_revertir_lote_traspaso_cancel
AFTER UPDATE OF status ON public.traspasos
FOR EACH ROW EXECUTE FUNCTION public.revertir_lote_traspaso_cancel();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) COMPRA cancelada → sacar del lote lo que se había recibido.
--    recibir_compra_linea_parcial emitió entradas con lote_id. Al cancelar,
--    insertamos una salida por cada una (mismo lote/almacén) → stock_lotes baja.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revertir_lote_compra_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov RECORD;
BEGIN
  IF NOT (COALESCE(OLD.status, '') <> 'cancelada' AND NEW.status = 'cancelada') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = NEW.id AND referencia_tipo = 'compra_cancel_lote') THEN
    RETURN NEW;
  END IF;

  FOR v_mov IN
    SELECT producto_id, cantidad, lote_id, almacen_destino_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'compra'
      AND tipo = 'entrada' AND lote_id IS NOT NULL
  LOOP
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
    VALUES
      (NEW.empresa_id, 'salida', v_mov.producto_id, v_mov.cantidad,
       v_mov.almacen_destino_id, v_mov.lote_id,
       'compra_cancel_lote', NEW.id, CURRENT_DATE, 'Reversa lote · cancelación compra');
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revertir_lote_compra_cancel ON public.compras;
CREATE TRIGGER trg_revertir_lote_compra_cancel
AFTER UPDATE OF status ON public.compras
FOR EACH ROW EXECUTE FUNCTION public.revertir_lote_compra_cancel();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) VENTA DIRECTA cancelada / vuelta a borrador → devolver el lote vendido.
--    apply_immediate_sale_inventory emitió salidas 'venta' con lote_id. Se repone
--    stock_lotes con una entrada por lote. Idempotente por "neto pendiente" (igual
--    que restore_cancelled_sale_inventory, para soportar ciclos cancelar/borrador).
--    Se gatilla en los mismos casos que la reversa general (venta_directa
--    entregada, con almacén) para no descuadrar.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revertir_lote_venta_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_tipo text;
  v_rec RECORD;
  v_net numeric;
BEGIN
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('cancelado', 'borrador') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT ((COALESCE(OLD.entrega_inmediata, false) = true) OR (OLD.status = 'entregado')) THEN RETURN NEW; END IF;
  IF NEW.almacen_id IS NULL THEN RETURN NEW; END IF;

  v_ref_tipo := CASE WHEN NEW.status = 'cancelado' THEN 'cancelacion_venta_lote' ELSE 'reverso_borrador_lote' END;

  FOR v_rec IN
    SELECT producto_id, lote_id, MAX(almacen_origen_id) AS almacen_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'venta'
      AND tipo = 'salida' AND lote_id IS NOT NULL
    GROUP BY producto_id, lote_id
  LOOP
    -- Neto pendiente del lote = salidas 'venta' − reversas de lote previas.
    SELECT COALESCE(SUM(CASE
             WHEN tipo = 'salida' AND referencia_tipo = 'venta' THEN cantidad
             WHEN tipo = 'entrada' AND referencia_tipo IN ('cancelacion_venta_lote', 'reverso_borrador_lote') THEN -cantidad
             ELSE 0 END), 0)
    INTO v_net
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND producto_id = v_rec.producto_id AND lote_id = v_rec.lote_id;

    IF v_net > 0 THEN
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
      VALUES
        (NEW.empresa_id, 'entrada', v_rec.producto_id, v_net, v_rec.almacen_id, v_rec.lote_id,
         v_ref_tipo, NEW.id, COALESCE(NEW.fecha, CURRENT_DATE),
         'Reversa lote · ' || (CASE WHEN NEW.status = 'cancelado' THEN 'cancelación' ELSE 'vuelta a borrador' END) || ' venta');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revertir_lote_venta_cancel ON public.ventas;
CREATE TRIGGER trg_revertir_lote_venta_cancel
AFTER UPDATE OF status ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.revertir_lote_venta_cancel();
