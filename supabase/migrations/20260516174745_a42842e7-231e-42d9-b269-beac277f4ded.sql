
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
  v_already_done int;
BEGIN
  -- Reversión: si pasamos de 'hecho' a otro estado
  IF TG_OP = 'UPDATE' AND OLD.status = 'hecho' AND NEW.status IS DISTINCT FROM 'hecho' THEN
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id
        AND referencia_tipo IN ('entrega_hecho', 'entrega')
        AND tipo = 'salida'
    LOOP
      IF v_linea.almacen_origen_id IS NOT NULL THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad + v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo IN ('entrega_hecho', 'entrega')
      AND tipo = 'salida';
    RETURN NEW;
  END IF;

  -- Solo aplicar si pasa a 'hecho'
  IF NEW.status IS DISTINCT FROM 'hecho' THEN
    RETURN NEW;
  END IF;

  -- Evitar duplicar si el trigger ya corrió
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'entrega_hecho' AND referencia_id = NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  -- Vendedor que entregó
  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);

  -- Almacén del camión
  SELECT almacen_id INTO v_almacen_id
  FROM public.profiles
  WHERE id = v_vendedor_id;

  IF v_almacen_id IS NULL THEN
    v_almacen_id := NEW.almacen_id;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_entrega_hecho_inventory: no almacen for entrega %', NEW.id;
    RETURN NEW;
  END IF;

  -- CRÍTICO: si la app móvil (versión vieja) ya descontó desde este almacén, NO duplicar.
  -- Detecta cualquier salida previa con referencia_tipo='entrega' del mismo almacén.
  SELECT COUNT(*) INTO v_already_done
  FROM public.movimientos_inventario
  WHERE referencia_id = NEW.id
    AND referencia_tipo = 'entrega'
    AND tipo = 'salida'
    AND almacen_origen_id = v_almacen_id;
  IF v_already_done > 0 THEN
    -- Marcamos un movimiento "ancla" de control para que la idempotencia funcione hacia adelante
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
      vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
    )
    SELECT NEW.empresa_id, 'salida', el.producto_id, 0, v_almacen_id,
           v_vendedor_id, 'entrega_hecho', NEW.id,
           'Anclaje (descuento previo por app móvil)', CURRENT_DATE
    FROM public.entrega_lineas el
    WHERE el.entrega_id = NEW.id AND el.hecho = true
      AND COALESCE(el.cantidad_entregada, 0) > 0
    LIMIT 1;
    RETURN NEW;
  END IF;

  -- Aplicar descuento normal
  FOR v_linea IN
    SELECT id, producto_id, cantidad_entregada, unidad_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id
      AND hecho = true
      AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad, updated_at)
    VALUES (NEW.empresa_id, v_almacen_id, v_linea.producto_id, -v_linea.cantidad_entregada, now())
    ON CONFLICT (almacen_id, producto_id)
    DO UPDATE SET cantidad = public.stock_almacen.cantidad - v_linea.cantidad_entregada, updated_at = now();

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
