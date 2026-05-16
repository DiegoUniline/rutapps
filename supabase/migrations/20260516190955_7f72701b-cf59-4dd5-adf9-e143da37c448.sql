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
  v_surtir_done boolean;
BEGIN
  -- Reversión: si pasamos de 'cargado' a otro estado, devolver al origen
  IF TG_OP = 'UPDATE' AND OLD.status = 'cargado' AND NEW.status IS DISTINCT FROM 'cargado' THEN
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id, almacen_destino_id, notas
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id
        AND referencia_tipo IN ('entrega_cargado', 'entrega')
        AND notas ILIKE 'Carga%'
    LOOP
      -- Solo revertir origen si la reversión realmente afectó stock (no para anclajes)
      IF v_linea.almacen_origen_id IS NOT NULL AND v_linea.cantidad > 0
         AND v_linea.notas NOT ILIKE '%anclaje%' AND v_linea.notas NOT ILIKE '%surtir%' THEN
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

  IF NEW.status IS DISTINCT FROM 'cargado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'cargado' THEN
    RETURN NEW;
  END IF;

  -- Idempotencia: si el trigger ya corrió
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'entrega_cargado' AND referencia_id = NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  IF v_vendedor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT almacen_id INTO v_almacen_destino FROM public.profiles WHERE id = v_vendedor_id;
  IF v_almacen_destino IS NULL THEN
    RETURN NEW;
  END IF;

  -- Detectar si surtir_linea_entrega ya descontó del origen (salida con referencia_tipo='entrega')
  SELECT EXISTS(
    SELECT 1 FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo = 'entrega'
      AND tipo = 'salida'
      AND cantidad > 0
  ) INTO v_surtir_done;

  -- Aplicar movimientos: si surtir ya descontó, solo sumar al destino + registrar entrada
  FOR v_linea IN
    SELECT producto_id, cantidad_entregada, almacen_origen_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id
      AND hecho = true
      AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    -- Solo descontar del origen si surtir NO lo hizo
    IF NOT v_surtir_done AND v_linea.almacen_origen_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad - v_linea.cantidad_entregada, updated_at = now()
      WHERE almacen_id = v_linea.almacen_origen_id
        AND producto_id = v_linea.producto_id;
    END IF;

    -- Entrada al destino (siempre)
    INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (NEW.empresa_id, v_almacen_destino, v_linea.producto_id, v_linea.cantidad_entregada)
    ON CONFLICT (almacen_id, producto_id) DO UPDATE
      SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

    -- Registro del movimiento (kardex)
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
      almacen_destino_id, vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
    ) VALUES (
      NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad_entregada,
      v_linea.almacen_origen_id, v_almacen_destino, v_vendedor_id,
      'entrega_cargado', NEW.id,
      CASE WHEN v_surtir_done
        THEN 'Carga a camión (origen ya descontado por surtir)'
        ELSE 'Carga de camión (trigger BD)'
      END,
      CURRENT_DATE
    );
  END LOOP;

  RETURN NEW;
END;
$function$;