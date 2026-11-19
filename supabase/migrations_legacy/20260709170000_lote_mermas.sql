-- LOTE EN MERMAS (consumo FEFO de bodega) + reversa al cancelar.
--
-- registrar_merma descuenta bodega (stock_almacen) y acredita el Almacén Mermas,
-- pero sin lote_id → stock_lotes de bodega no baja (descuadre). El Almacén Mermas
-- es un "bote" (no se revende), así que NO se traza lote ahí; solo importa que la
-- bodega descuente el lote correcto por FEFO.
--
-- Fix SEGURO y aislado (no se toca registrar_merma / cancelar_merma):
--   • Trigger al insertar merma_linea: consume el lote de bodega por FEFO (una
--     salida con lote por cada lote consumido → stock_lotes de bodega baja).
--   • Trigger al cancelar la merma: devuelve esos lotes a la bodega.
--   • check_stock_lote_paridad excluye los almacenes de merma (es_merma) para que
--     el "bote" no cuente como descuadre.
-- Solo afecta stock_lotes. Productos sin lote: no-op.

-- 1) Forward: consumir lote de bodega por FEFO al registrar la merma.
CREATE OR REPLACE FUNCTION public.aplicar_lote_merma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_maneja boolean;
  v_origen uuid;
  v_empresa uuid;
  v_pending numeric;
  v_lote RECORD;
  v_take numeric;
BEGIN
  SELECT COALESCE(maneja_lote, false) INTO v_maneja FROM public.productos WHERE id = NEW.producto_id;
  IF NOT v_maneja THEN RETURN NEW; END IF;

  SELECT almacen_origen_id, empresa_id INTO v_origen, v_empresa FROM public.mermas WHERE id = NEW.merma_id;
  IF v_origen IS NULL THEN RETURN NEW; END IF;

  v_pending := COALESCE(NEW.cantidad, 0);
  FOR v_lote IN
    SELECT sl.lote_id, sl.cantidad AS existencia
    FROM public.stock_lotes sl JOIN public.lotes l ON l.id = sl.lote_id
    WHERE sl.almacen_id = v_origen AND sl.producto_id = NEW.producto_id AND sl.cantidad > 0
    ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
    FOR UPDATE OF sl
  LOOP
    EXIT WHEN v_pending <= 0;
    v_take := LEAST(v_lote.existencia, v_pending);
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
    VALUES (v_empresa, 'salida', NEW.producto_id, v_take, v_origen, v_lote.lote_id,
            'merma_lote', NEW.merma_id, CURRENT_DATE, 'Merma lote (FEFO)');
    v_pending := v_pending - v_take;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aplicar_lote_merma ON public.merma_lineas;
CREATE TRIGGER trg_aplicar_lote_merma
AFTER INSERT ON public.merma_lineas
FOR EACH ROW EXECUTE FUNCTION public.aplicar_lote_merma();

-- 2) Reversa: devolver los lotes a bodega al cancelar la merma.
CREATE OR REPLACE FUNCTION public.revertir_lote_merma_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov RECORD;
BEGIN
  IF NOT (COALESCE(OLD.cancelada, false) = false AND NEW.cancelada = true) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = NEW.id AND referencia_tipo = 'merma_cancel_lote') THEN
    RETURN NEW;
  END IF;

  FOR v_mov IN
    SELECT producto_id, cantidad, lote_id, almacen_origen_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'merma_lote' AND tipo = 'salida' AND lote_id IS NOT NULL
  LOOP
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
    VALUES (NEW.empresa_id, 'entrada', v_mov.producto_id, v_mov.cantidad, v_mov.almacen_origen_id, v_mov.lote_id,
            'merma_cancel_lote', NEW.id, CURRENT_DATE, 'Reversa lote · cancelación merma');
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revertir_lote_merma_cancel ON public.mermas;
CREATE TRIGGER trg_revertir_lote_merma_cancel
AFTER UPDATE OF cancelada ON public.mermas
FOR EACH ROW EXECUTE FUNCTION public.revertir_lote_merma_cancel();

-- 3) El chequeo de paridad ignora los almacenes de merma (bote de basura).
CREATE OR REPLACE FUNCTION public.check_stock_lote_paridad(p_empresa_id uuid DEFAULT NULL)
RETURNS TABLE (
  empresa_id uuid,
  almacen_id uuid,
  almacen_nombre text,
  producto_id uuid,
  codigo text,
  nombre text,
  stock_general numeric,
  suma_lotes numeric,
  diferencia numeric,
  caso text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    sa.empresa_id,
    sa.almacen_id,
    a.nombre AS almacen_nombre,
    sa.producto_id,
    p.codigo,
    p.nombre,
    sa.cantidad AS stock_general,
    COALESCE(sl.suma_lotes, 0) AS suma_lotes,
    sa.cantidad - COALESCE(sl.suma_lotes, 0) AS diferencia,
    CASE
      WHEN COALESCE(sl.suma_lotes, 0) = 0 AND sa.cantidad <> 0 THEN 'con_lote_sin_lotes'
      ELSE 'descuadre_real'
    END AS caso
  FROM public.stock_almacen sa
  JOIN public.productos p ON p.id = sa.producto_id AND COALESCE(p.maneja_lote, false) = true
  LEFT JOIN public.almacenes a ON a.id = sa.almacen_id
  LEFT JOIN (
    SELECT almacen_id, producto_id, SUM(cantidad) AS suma_lotes
    FROM public.stock_lotes
    GROUP BY almacen_id, producto_id
  ) sl ON sl.almacen_id = sa.almacen_id AND sl.producto_id = sa.producto_id
  WHERE (p_empresa_id IS NULL OR sa.empresa_id = p_empresa_id)
    AND NOT COALESCE(a.es_merma, false)
    AND sa.cantidad <> COALESCE(sl.suma_lotes, 0)
  ORDER BY caso, p.codigo;
$function$;
