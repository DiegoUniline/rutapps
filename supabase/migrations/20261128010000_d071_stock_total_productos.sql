-- D-071 (dueño, 2026-11-28): menos escrituras a `productos` por el total de existencias (CPU de la BD).
-- Antes: cada cambio en stock_almacen reescribía productos.cantidad al momento (un traspaso o una carga de camión
-- = 2 escrituras aunque el total no cambie) y cada escritura se avisaba por Realtime a todas las pantallas.
-- Ahora: (1) el total se recalcula al cerrar la operación (constraint trigger DEFERRED) y (2) solo se escribe si cambió.
-- No cambia cómo se calcula el stock ni ninguna pantalla. Quien necesite el total dentro de la misma transacción
-- después de mover stock puede usar SET CONSTRAINTS ALL IMMEDIATE (ninguna función lo lee así hoy).

CREATE OR REPLACE FUNCTION public.recalc_producto_stock_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_producto_id uuid;
  v_total numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_producto_id := OLD.producto_id;
  ELSE
    v_producto_id := NEW.producto_id;
  END IF;

  SELECT COALESCE(SUM(cantidad), 0)
  INTO v_total
  FROM stock_almacen
  WHERE producto_id = v_producto_id;

  -- D-071: solo si cambió (un traspaso o una carga no mueven el total).
  UPDATE productos SET cantidad = v_total
   WHERE id = v_producto_id AND cantidad IS DISTINCT FROM v_total;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Al cerrar la operación: los dos lados de un traspaso ya están aplicados y el total no cambia → 0 escrituras.
DROP TRIGGER IF EXISTS trg_recalc_stock_total_almacen ON public.stock_almacen;
CREATE CONSTRAINT TRIGGER trg_recalc_stock_total_almacen
  AFTER INSERT OR DELETE OR UPDATE OF cantidad ON public.stock_almacen
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.recalc_producto_stock_total();

-- Total desfasado (venía de antes): solo empresas que llevan existencias por almacén y tuvieron movimientos en
-- los últimos 30 días. Las empresas sin movimientos (datos importados, sin stock por almacén) no se tocan.
UPDATE public.productos p
   SET cantidad = COALESCE(s.t, 0)
  FROM (
    SELECT p2.id, (SELECT SUM(sa.cantidad) FROM public.stock_almacen sa WHERE sa.producto_id = p2.id) AS t
      FROM public.productos p2
     WHERE EXISTS (SELECT 1 FROM public.movimientos_inventario m
                    WHERE m.empresa_id = p2.empresa_id AND m.created_at > now() - interval '30 days')
       AND EXISTS (SELECT 1 FROM public.stock_almacen sa2 WHERE sa2.empresa_id = p2.empresa_id)
  ) s
 WHERE p.id = s.id AND p.cantidad IS DISTINCT FROM COALESCE(s.t, 0);
