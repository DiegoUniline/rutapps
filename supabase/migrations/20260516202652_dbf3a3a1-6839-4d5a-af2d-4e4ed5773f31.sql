-- Fix: apply_entrega_cargado_inventory was reverting carga on cargado->hecho transition,
-- causing route stock to go negative. Reversion should only fire when going BACKWARDS
-- (not when advancing to 'hecho').

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
  -- Reversión: SOLO cuando volvemos atrás (no cuando avanzamos a 'hecho')
  IF TG_OP = 'UPDATE' AND OLD.status = 'cargado'
     AND NEW.status IS DISTINCT FROM 'cargado'
     AND NEW.status NOT IN ('hecho') THEN
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id, almacen_destino_id, notas
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id
        AND referencia_tipo IN ('entrega_cargado', 'entrega')
        AND notas ILIKE 'Carga%'
    LOOP
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

  SELECT EXISTS(
    SELECT 1 FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo = 'entrega'
      AND tipo = 'salida'
      AND cantidad > 0
  ) INTO v_surtir_done;

  FOR v_linea IN
    SELECT producto_id, cantidad_entregada, almacen_origen_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id
      AND hecho = true
      AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    IF NOT v_surtir_done AND v_linea.almacen_origen_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad - v_linea.cantidad_entregada, updated_at = now()
      WHERE almacen_id = v_linea.almacen_origen_id
        AND producto_id = v_linea.producto_id;
    END IF;

    INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (NEW.empresa_id, v_almacen_destino, v_linea.producto_id, v_linea.cantidad_entregada)
    ON CONFLICT (almacen_id, producto_id) DO UPDATE
      SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

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

-- Reparación de datos: entregas 'hecho' donde el bug borró la carga.
-- Patrón: existe entrega_hecho (salida desde ruta) pero NO existe entrega_cargado.
DO $$
DECLARE
  v_entrega record;
  v_linea record;
  v_vendedor_id uuid;
  v_almacen_ruta uuid;
BEGIN
  FOR v_entrega IN
    SELECT e.id, e.empresa_id, e.vendedor_ruta_id, e.vendedor_id, e.folio
    FROM public.entregas e
    WHERE e.status = 'hecho'
      AND EXISTS (
        SELECT 1 FROM public.movimientos_inventario m
        WHERE m.referencia_id = e.id AND m.referencia_tipo = 'entrega_hecho' AND m.tipo = 'salida' AND m.cantidad > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario m
        WHERE m.referencia_id = e.id AND m.referencia_tipo = 'entrega_cargado'
      )
  LOOP
    v_vendedor_id := COALESCE(v_entrega.vendedor_ruta_id, v_entrega.vendedor_id);
    IF v_vendedor_id IS NULL THEN CONTINUE; END IF;

    SELECT almacen_id INTO v_almacen_ruta FROM public.profiles WHERE id = v_vendedor_id;
    IF v_almacen_ruta IS NULL THEN CONTINUE; END IF;

    FOR v_linea IN
      SELECT el.producto_id, el.cantidad_entregada, el.almacen_origen_id
      FROM public.entrega_lineas el
      WHERE el.entrega_id = v_entrega.id
        AND el.hecho = true
        AND COALESCE(el.cantidad_entregada, 0) > 0
    LOOP
      -- Sumar a la ruta (corrige negativo dejado por el bug)
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_entrega.empresa_id, v_almacen_ruta, v_linea.producto_id, v_linea.cantidad_entregada)
      ON CONFLICT (almacen_id, producto_id) DO UPDATE
        SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

      -- Restar del origen (corrige doble alta dejada por la reversión bug)
      IF v_linea.almacen_origen_id IS NOT NULL THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad - v_linea.cantidad_entregada, updated_at = now()
        WHERE almacen_id = v_linea.almacen_origen_id
          AND producto_id = v_linea.producto_id;
      END IF;

      -- Restaurar el movimiento entrega_cargado borrado
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
        almacen_destino_id, vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
      ) VALUES (
        v_entrega.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad_entregada,
        v_linea.almacen_origen_id, v_almacen_ruta, v_vendedor_id,
        'entrega_cargado', v_entrega.id,
        'Reparación: carga restaurada (folio ' || COALESCE(v_entrega.folio, '—') || ')',
        CURRENT_DATE
      );
    END LOOP;
  END LOOP;
END $$;