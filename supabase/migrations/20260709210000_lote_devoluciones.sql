-- LOTE EN DEVOLUCIONES (FEFO-in a vendible) — reversa segura y aislada.
--
-- apply_devolucion_linea_inventory reingresa a stock_almacen (vendible o mermas)
-- sin lote_id → stock_lotes no sube (descuadre en el almacén vendible).
--
-- Fix aislado (no se toca apply_devolucion_linea_inventory): trigger que, al
-- devolver un producto con lote a un almacén VENDIBLE, acredita el lote del
-- producto con caducidad más próxima (FEFO-in: se vende primero). Si la
-- devolución va a un almacén de MERMAS (motivo danado/vencido/caducado), se
-- omite (los almacenes es_merma están excluidos de la paridad).
-- Solo afecta stock_lotes. Productos sin lote / sin lotes definidos: no-op.

CREATE OR REPLACE FUNCTION public.aplicar_lote_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dev RECORD;
  v_almacen uuid;
  v_merma uuid;
  v_maneja boolean;
  v_lote uuid;
BEGIN
  SELECT COALESCE(maneja_lote, false) INTO v_maneja FROM public.productos WHERE id = NEW.producto_id;
  IF NOT v_maneja THEN RETURN NEW; END IF;

  SELECT id, empresa_id, user_id, vendedor_id INTO v_dev
  FROM public.devoluciones WHERE id = NEW.devolucion_id;
  IF v_dev.id IS NULL THEN RETURN NEW; END IF;

  -- Almacén destino (mismo criterio que apply_devolucion_linea_inventory).
  SELECT almacen_id INTO v_almacen FROM public.profiles WHERE id = v_dev.user_id;
  IF v_almacen IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
    SELECT almacen_id INTO v_almacen FROM public.profiles WHERE id = v_dev.vendedor_id;
  END IF;

  -- Motivo de producto malo → va a Mermas (bote, excluido de paridad) → no se traza lote.
  IF NEW.motivo::text IN ('danado', 'vencido', 'caducado') THEN
    SELECT id INTO v_merma FROM public.almacenes
    WHERE empresa_id = v_dev.empresa_id AND es_merma = true LIMIT 1;
    IF v_merma IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF v_almacen IS NULL THEN RETURN NEW; END IF;

  -- Idempotencia.
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = v_dev.id AND referencia_tipo = 'devolucion_lote' AND producto_id = NEW.producto_id) THEN
    RETURN NEW;
  END IF;

  -- Lote de caducidad más próxima del producto (FEFO-in).
  SELECT id INTO v_lote FROM public.lotes
  WHERE producto_id = NEW.producto_id AND empresa_id = v_dev.empresa_id AND COALESCE(activo, true) = true
  ORDER BY fecha_caducidad ASC NULLS LAST, created_at ASC
  LIMIT 1;
  IF v_lote IS NULL THEN RETURN NEW; END IF;  -- producto sin lotes definidos

  INSERT INTO public.movimientos_inventario
    (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (v_dev.empresa_id, 'entrada', NEW.producto_id, NEW.cantidad, v_almacen, v_lote,
          'devolucion_lote', v_dev.id, v_dev.user_id, CURRENT_DATE, 'Devolución lote (FEFO-in)');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aplicar_lote_devolucion ON public.devolucion_lineas;
CREATE TRIGGER trg_aplicar_lote_devolucion
AFTER INSERT ON public.devolucion_lineas
FOR EACH ROW EXECUTE FUNCTION public.aplicar_lote_devolucion();
