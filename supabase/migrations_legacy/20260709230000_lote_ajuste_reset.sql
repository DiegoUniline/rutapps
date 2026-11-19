-- LOTE EN "REINICIO A CEROS" (ajustes de inventario).
--
-- El "Reinicio a ceros" pone stock_almacen = 0 de TODOS los productos (incluidos
-- los de lote) e inserta una salida referencia_tipo='ajuste' con notas
-- 'Reinicio a ceros...', sin lote_id → stock_lotes NO baja → descuadre.
--
-- (El ajuste normal ya está bien: la pantalla separa mundos — productos con lote
-- se ajustan eligiendo lote vía asignar_lote_masivo (que SET stock_lotes), y los
-- sin lote por la vía normal. Por eso aquí SOLO tocamos el reinicio a ceros.)
--
-- Fix aislado: trigger que, al ver una salida de 'ajuste' de reinicio a ceros de
-- un producto con lote y sin lote_id, consume su lote por FEFO (lo deja en 0
-- también). No toca asignar_lote_masivo. Solo afecta stock_lotes.

CREATE OR REPLACE FUNCTION public.aplicar_lote_ajuste_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_maneja boolean;
  v_pending numeric;
  v_lote RECORD;
  v_take numeric;
BEGIN
  IF NEW.lote_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.referencia_tipo <> 'ajuste' THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'salida' OR NEW.almacen_origen_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.notas, '') NOT ILIKE 'Reinicio a ceros%' THEN RETURN NEW; END IF;

  SELECT COALESCE(maneja_lote, false) INTO v_maneja FROM public.productos WHERE id = NEW.producto_id;
  IF NOT v_maneja THEN RETURN NEW; END IF;

  v_pending := COALESCE(NEW.cantidad, 0);
  FOR v_lote IN
    SELECT sl.lote_id, sl.cantidad AS existencia
    FROM public.stock_lotes sl JOIN public.lotes l ON l.id = sl.lote_id
    WHERE sl.almacen_id = NEW.almacen_origen_id AND sl.producto_id = NEW.producto_id AND sl.cantidad > 0
    ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
    FOR UPDATE OF sl
  LOOP
    EXIT WHEN v_pending <= 0;
    v_take := LEAST(v_lote.existencia, v_pending);
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
    VALUES (NEW.empresa_id, 'salida', NEW.producto_id, v_take, NEW.almacen_origen_id, v_lote.lote_id,
            'ajuste_lote', NEW.referencia_id, COALESCE(NEW.fecha, CURRENT_DATE), 'Reinicio a ceros lote (FEFO)');
    v_pending := v_pending - v_take;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aplicar_lote_ajuste_reset ON public.movimientos_inventario;
CREATE TRIGGER trg_aplicar_lote_ajuste_reset
AFTER INSERT ON public.movimientos_inventario
FOR EACH ROW
WHEN (NEW.referencia_tipo = 'ajuste' AND NEW.lote_id IS NULL)
EXECUTE FUNCTION public.aplicar_lote_ajuste_reset();
