
-- Trigger: descuenta inventario del almacén del vendedor cuando entrega pasa a 'hecho'
CREATE OR REPLACE FUNCTION public.apply_entrega_hecho_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendedor_id uuid;
  v_almacen_id uuid;
  v_linea record;
  v_existing int;
BEGIN
  -- Solo actuar en transición a 'hecho'
  IF NEW.status IS DISTINCT FROM 'hecho' THEN
    -- Si revertimos desde 'hecho', deshacer movimientos previos
    IF TG_OP = 'UPDATE' AND OLD.status = 'hecho' AND NEW.status <> 'hecho' THEN
      -- Revertir: por cada salida previa de esta entrega, devolver stock y eliminar movimiento
      FOR v_linea IN
        SELECT producto_id, cantidad, almacen_origen_id
        FROM public.movimientos_inventario
        WHERE referencia_tipo = 'entrega_hecho' AND referencia_id = NEW.id
      LOOP
        IF v_linea.almacen_origen_id IS NOT NULL THEN
          UPDATE public.stock_almacen
          SET cantidad = cantidad + v_linea.cantidad, updated_at = now()
          WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
        END IF;
      END LOOP;
      DELETE FROM public.movimientos_inventario
      WHERE referencia_tipo = 'entrega_hecho' AND referencia_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Evitar duplicados si ya se aplicó
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'entrega_hecho' AND referencia_id = NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  -- Vendedor que entregó (vendedor_ruta_id tiene prioridad)
  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);

  -- Almacén del camión = profiles.almacen_id del vendedor
  SELECT almacen_id INTO v_almacen_id
  FROM public.profiles
  WHERE id = v_vendedor_id;

  -- Fallback: almacen_id de la entrega
  IF v_almacen_id IS NULL THEN
    v_almacen_id := NEW.almacen_id;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_entrega_hecho_inventory: no almacen for entrega %', NEW.id;
    RETURN NEW;
  END IF;

  -- Por cada línea surtida y entregada, descontar del almacén del vendedor
  FOR v_linea IN
    SELECT id, producto_id, cantidad_entregada, unidad_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id
      AND hecho = true
      AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    -- Upsert stock
    INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad, updated_at)
    VALUES (NEW.empresa_id, v_almacen_id, v_linea.producto_id, -v_linea.cantidad_entregada, now())
    ON CONFLICT (almacen_id, producto_id)
    DO UPDATE SET cantidad = public.stock_almacen.cantidad - v_linea.cantidad_entregada, updated_at = now();

    -- Registrar kardex
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, unidad_id,
      almacen_origen_id, vendedor_destino_id,
      referencia_tipo, referencia_id, notas, fecha
    ) VALUES (
      NEW.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad_entregada, v_linea.unidad_id,
      v_almacen_id, v_vendedor_id,
      'entrega_hecho', NEW.id,
      'Entrega a cliente (folio ' || COALESCE(NEW.folio, '—') || ')',
      CURRENT_DATE
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_entrega_hecho_inventory ON public.entregas;
CREATE TRIGGER trg_apply_entrega_hecho_inventory
AFTER UPDATE OF status ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.apply_entrega_hecho_inventory();
