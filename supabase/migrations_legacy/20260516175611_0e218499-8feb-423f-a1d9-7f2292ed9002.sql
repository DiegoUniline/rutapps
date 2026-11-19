-- ============================================================
-- Trigger: apply_entrega_cargado_inventory
-- Descuenta del almacén de origen y entrega al almacén del
-- repartidor cuando una entrega pasa a status='cargado'.
-- Es idempotente y compatible con apps móviles antiguas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_entrega_cargado_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vendedor_id uuid;
  v_almacen_destino uuid;
  v_linea record;
  v_existing int;
  v_already_done int;
BEGIN
  -- Reversión: si pasamos de 'cargado' a otro estado, devolver al origen
  IF TG_OP = 'UPDATE' AND OLD.status = 'cargado' AND NEW.status IS DISTINCT FROM 'cargado' THEN
    -- Devolver stock al origen (revertir salidas) y quitar del destino (revertir entradas)
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id, almacen_destino_id
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id
        AND referencia_tipo IN ('entrega_cargado', 'entrega')
        AND notas ILIKE 'Carga%'
    LOOP
      IF v_linea.almacen_origen_id IS NOT NULL AND v_linea.cantidad > 0 THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad + v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_origen_id
          AND producto_id = v_linea.producto_id;
      END IF;
      IF v_linea.almacen_destino_id IS NOT NULL AND v_linea.cantidad > 0 THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad - v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_destino_id
          AND producto_id = v_linea.producto_id;
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo IN ('entrega_cargado', 'entrega')
      AND notas ILIKE 'Carga%';
    RETURN NEW;
  END IF;

  -- Solo aplicar si pasa a 'cargado'
  IF NEW.status IS DISTINCT FROM 'cargado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'cargado' THEN
    -- Ya estaba cargado, nada que hacer
    RETURN NEW;
  END IF;

  -- Idempotencia: si el trigger ya corrió para esta entrega
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'entrega_cargado' AND referencia_id = NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  -- Vendedor que carga el camión
  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);

  IF v_vendedor_id IS NULL THEN
    RAISE LOG 'apply_entrega_cargado_inventory: no vendedor for entrega %', NEW.id;
    RETURN NEW;
  END IF;

  -- Almacén destino (del repartidor)
  SELECT almacen_id INTO v_almacen_destino
  FROM public.profiles
  WHERE id = v_vendedor_id;

  IF v_almacen_destino IS NULL THEN
    RAISE LOG 'apply_entrega_cargado_inventory: no almacen destino for entrega %', NEW.id;
    RETURN NEW;
  END IF;

  -- CRÍTICO: si la app vieja ya hizo la entrada en este destino para esta entrega, NO duplicar.
  -- Detecta cualquier entrada previa con referencia_tipo='entrega' al mismo destino.
  SELECT COUNT(*) INTO v_already_done
  FROM public.movimientos_inventario
  WHERE referencia_id = NEW.id
    AND referencia_tipo = 'entrega'
    AND tipo = 'entrada'
    AND almacen_destino_id = v_almacen_destino;
  IF v_already_done > 0 THEN
    -- Ancla para idempotencia futura
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
      almacen_destino_id, vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
    )
    SELECT NEW.empresa_id, 'entrada', el.producto_id, 0, el.almacen_origen_id,
           v_almacen_destino, v_vendedor_id, 'entrega_cargado', NEW.id,
           'Carga (anclaje, descuento previo por app móvil)', CURRENT_DATE
    FROM public.entrega_lineas el
    WHERE el.entrega_id = NEW.id AND el.hecho = true
      AND COALESCE(el.cantidad_entregada, 0) > 0
    LIMIT 1;
    RETURN NEW;
  END IF;

  -- Aplicar movimientos reales: salida del origen + entrada al destino
  FOR v_linea IN
    SELECT producto_id, cantidad_entregada, almacen_origen_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id
      AND hecho = true
      AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    -- Salida del origen (si hay)
    IF v_linea.almacen_origen_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad - v_linea.cantidad_entregada, updated_at = now()
      WHERE almacen_id = v_linea.almacen_origen_id
        AND producto_id = v_linea.producto_id;
    END IF;

    -- Entrada al destino (upsert)
    INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (NEW.empresa_id, v_almacen_destino, v_linea.producto_id, v_linea.cantidad_entregada)
    ON CONFLICT (almacen_id, producto_id) DO UPDATE
      SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

    -- Registro del movimiento
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
      almacen_destino_id, vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
    ) VALUES (
      NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad_entregada,
      v_linea.almacen_origen_id, v_almacen_destino, v_vendedor_id,
      'entrega_cargado', NEW.id, 'Carga de camión (trigger BD)', CURRENT_DATE
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_entrega_cargado_inventory ON public.entregas;
CREATE TRIGGER trg_apply_entrega_cargado_inventory
AFTER UPDATE OF status ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.apply_entrega_cargado_inventory();