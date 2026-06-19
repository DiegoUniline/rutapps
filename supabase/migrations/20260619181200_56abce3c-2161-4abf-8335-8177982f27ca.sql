-- Trigger idempotente de restauración de stock al cancelar/revertir ventas.
-- Bug previo: si la venta iba confirmado → borrador y volvía a confirmado, no
-- se re-descontaba; luego ir otra vez a borrador volvía a generar entradas,
-- duplicando el stock devuelto. Esta versión calcula el neto pendiente entre
-- salidas (referencia_tipo='venta') y entradas previas de cancelación, y solo
-- emite la diferencia faltante por producto.

CREATE OR REPLACE FUNCTION public.restore_cancelled_sale_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric;
  v_was_delivered boolean;
  v_neto_pendiente numeric;
  v_a_devolver numeric;
BEGIN
  IF NEW.tipo = 'saldo_inicial' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('cancelado', 'borrador') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;

  v_was_delivered := (COALESCE(OLD.entrega_inmediata, false) = true) OR (OLD.status = 'entregado');
  IF NOT v_was_delivered THEN RETURN NEW; END IF;

  IF NEW.almacen_id IS NULL THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT producto_id, SUM(cantidad) AS cantidad
    FROM public.venta_lineas WHERE venta_id = NEW.id
    GROUP BY producto_id
  LOOP
    -- Neto pendiente = salidas previas (venta) - entradas previas (cancelacion_venta) para este producto/venta
    SELECT COALESCE(SUM(CASE
              WHEN tipo = 'salida' AND referencia_tipo = 'venta' THEN cantidad
              WHEN tipo = 'entrada' AND referencia_tipo = 'cancelacion_venta' THEN -cantidad
              ELSE 0
           END), 0)
    INTO v_neto_pendiente
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND producto_id = v_linea.producto_id;

    -- Solo devolver hasta el neto pendiente (nunca devolver de más).
    v_a_devolver := LEAST(GREATEST(v_neto_pendiente, 0), COALESCE(v_linea.cantidad, 0));
    IF v_a_devolver <= 0 THEN CONTINUE; END IF;

    SELECT id, cantidad INTO v_stock_id, v_stock_actual
      FROM public.stock_almacen
      WHERE almacen_id = NEW.almacen_id AND producto_id = v_linea.producto_id
      FOR UPDATE LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stock_almacen
        SET cantidad = COALESCE(v_stock_actual, 0) + v_a_devolver, updated_at = now()
        WHERE id = v_stock_id;
    ELSE
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (NEW.empresa_id, NEW.almacen_id, v_linea.producto_id, v_a_devolver);
    END IF;

    INSERT INTO public.movimientos_inventario
      (id, empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    VALUES
      (gen_random_uuid(), NEW.empresa_id, 'entrada', v_linea.producto_id, v_a_devolver,
       NEW.almacen_id, 'cancelacion_venta', NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id),
       COALESCE(NEW.fecha, current_date), now(),
       concat('Cancelación venta ', COALESCE(NEW.folio, NEW.id::text)));
  END LOOP;

  RETURN NEW;
END;
$function$;