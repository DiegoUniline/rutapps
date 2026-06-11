
-- Fix apply_entrega_hecho_inventory: use per-line net movement instead of presence-based check
CREATE OR REPLACE FUNCTION public.apply_entrega_hecho_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vendedor_id uuid;
  v_almacen_id uuid;
  v_linea record;
  v_neto numeric;
  v_pendiente numeric;
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
      IF v_linea.almacen_origen_id IS NOT NULL AND v_linea.cantidad > 0 THEN
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

  -- Vendedor que entregó
  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);

  -- Almacén del camión (o fallback al de la entrega)
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

  -- Por cada línea entregada, calcular el movimiento NETO actual en este almacén
  -- considerando todos los tipos de movimientos de esta entrega.
  -- Si neto < cantidad_entregada → descontar la diferencia (pendiente).
  -- Si neto >= cantidad_entregada → ya descontado (PWA viejo o re-trigger): solo anclaje.
  FOR v_linea IN
    SELECT id, producto_id, cantidad_entregada, unidad_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id
      AND hecho = true
      AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'salida' AND almacen_origen_id  = v_almacen_id THEN cantidad ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN tipo = 'entrada' AND almacen_destino_id = v_almacen_id THEN cantidad ELSE 0 END), 0)
    INTO v_neto
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo IN ('entrega', 'entrega_cargado', 'entrega_hecho')
      AND producto_id = v_linea.producto_id;

    v_pendiente := v_linea.cantidad_entregada - v_neto;

    IF v_pendiente > 0 THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad, updated_at)
      VALUES (NEW.empresa_id, v_almacen_id, v_linea.producto_id, -v_pendiente, now())
      ON CONFLICT (almacen_id, producto_id)
      DO UPDATE SET cantidad = public.stock_almacen.cantidad - v_pendiente, updated_at = now();

      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, unidad_id,
        almacen_origen_id, vendedor_destino_id,
        referencia_tipo, referencia_id, notas, fecha
      ) VALUES (
        NEW.empresa_id, 'salida', v_linea.producto_id, v_pendiente, v_linea.unidad_id,
        v_almacen_id, v_vendedor_id,
        'entrega_hecho', NEW.id,
        'Entrega a cliente (folio ' || COALESCE(NEW.folio, '—') || ')',
        CURRENT_DATE
      );
    ELSE
      -- Ya descontado: insertar anclaje de control (idempotencia)
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, unidad_id,
        almacen_origen_id, vendedor_destino_id,
        referencia_tipo, referencia_id, notas, fecha
      )
      SELECT NEW.empresa_id, 'salida', v_linea.producto_id, 0, v_linea.unidad_id,
             v_almacen_id, v_vendedor_id, 'entrega_hecho', NEW.id,
             'Anclaje (descuento previo)', CURRENT_DATE
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario
        WHERE referencia_id = NEW.id
          AND referencia_tipo = 'entrega_hecho'
          AND producto_id = v_linea.producto_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;


-- ============================================================
-- BACKFILL: corregir entregas 'hecho' donde el neto no descontó
-- Aplica a TODA empresa (la lógica es genérica e idempotente).
-- ============================================================
DO $$
DECLARE
  v_entrega record;
  v_linea record;
  v_almacen_id uuid;
  v_vendedor_id uuid;
  v_neto numeric;
  v_pendiente numeric;
BEGIN
  FOR v_entrega IN
    SELECT e.id, e.empresa_id, e.folio, e.vendedor_id, e.vendedor_ruta_id, e.almacen_id
    FROM public.entregas e
    WHERE e.status = 'hecho'
  LOOP
    v_vendedor_id := COALESCE(v_entrega.vendedor_ruta_id, v_entrega.vendedor_id);

    SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_vendedor_id;
    IF v_almacen_id IS NULL THEN v_almacen_id := v_entrega.almacen_id; END IF;
    IF v_almacen_id IS NULL THEN CONTINUE; END IF;

    FOR v_linea IN
      SELECT id, producto_id, cantidad_entregada, unidad_id
      FROM public.entrega_lineas
      WHERE entrega_id = v_entrega.id
        AND hecho = true
        AND COALESCE(cantidad_entregada, 0) > 0
    LOOP
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'salida' AND almacen_origen_id  = v_almacen_id THEN cantidad ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN tipo = 'entrada' AND almacen_destino_id = v_almacen_id THEN cantidad ELSE 0 END), 0)
      INTO v_neto
      FROM public.movimientos_inventario
      WHERE referencia_id = v_entrega.id
        AND referencia_tipo IN ('entrega', 'entrega_cargado', 'entrega_hecho')
        AND producto_id = v_linea.producto_id;

      v_pendiente := v_linea.cantidad_entregada - v_neto;

      IF v_pendiente > 0 THEN
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad, updated_at)
        VALUES (v_entrega.empresa_id, v_almacen_id, v_linea.producto_id, -v_pendiente, now())
        ON CONFLICT (almacen_id, producto_id)
        DO UPDATE SET cantidad = public.stock_almacen.cantidad - v_pendiente, updated_at = now();

        INSERT INTO public.movimientos_inventario (
          empresa_id, tipo, producto_id, cantidad, unidad_id,
          almacen_origen_id, vendedor_destino_id,
          referencia_tipo, referencia_id, notas, fecha
        ) VALUES (
          v_entrega.empresa_id, 'salida', v_linea.producto_id, v_pendiente, v_linea.unidad_id,
          v_almacen_id, v_vendedor_id,
          'entrega_hecho', v_entrega.id,
          'Backfill: ajuste por neto faltante (folio ' || COALESCE(v_entrega.folio, '—') || ')',
          CURRENT_DATE
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;
