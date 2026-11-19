-- DOBLE DESCUENTO DE INVENTARIO (crítico). Confirmado en producción con stock
-- negativo en almacenes de camión/ruta (Tampico, MG, URIVAL, etc.).
--
-- Causa raíz (#13): apply_entrega_hecho_inventory calculaba
--   v_neto = (salidas del camión) − (ENTRADAS al camión)
--   v_pendiente = entregado − v_neto
-- Restar la ENTRADA de carga (entrega_cargado) es incorrecto: esa entrada es el
-- inventario INICIAL del camión, no un descuento. Daba v_pendiente = 2×entregado
-- → descontaba el doble → camión en negativo.
--
-- Causa compañera (#14): apply_entrega_cargado_inventory NO consideraba 'en_ruta'
-- como estado activo, así que la transición normal cargado→en_ruta (al iniciar la
-- jornada) se trataba como REVERSA: borraba el movimiento de carga y descontaba el
-- camión. Luego 'hecho' descontaba otra vez.
--
-- Arreglo:
--  1) hecho: contar SOLO las salidas del camión (una sola deducción).
--  2) cargado: agregar 'en_ruta' a los estados activos (no es reversa).
-- No cambia el flujo de BODEGA (surtir sigue descontando origen una vez).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) apply_entrega_hecho_inventory: descontar el camión UNA sola vez
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_entrega_hecho_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF NEW.status IS DISTINCT FROM 'hecho' THEN RETURN NEW; END IF;

  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_vendedor_id;
  IF v_almacen_id IS NULL THEN v_almacen_id := NEW.almacen_id; END IF;
  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_entrega_hecho_inventory: no almacen for entrega %', NEW.id;
    RETURN NEW;
  END IF;

  FOR v_linea IN
    SELECT id, producto_id, cantidad_entregada, unidad_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id AND hecho = true AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    -- FIX (#13): v_neto = SOLO lo que ya SALIÓ del camión para esta entrega/producto.
    -- Antes se restaba la ENTRADA de carga (entrega_cargado), que es el inventario
    -- inicial del camión, no un descuento → duplicaba la deducción. Ahora
    -- v_pendiente = entregado − (ya descontado) → descuenta la cantidad UNA vez, y
    -- si ya se descontó (re-trigger o app vieja) queda en 0 (anclaje).
    SELECT COALESCE(SUM(CASE WHEN tipo = 'salida' AND almacen_origen_id = v_almacen_id THEN cantidad ELSE 0 END), 0)
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
        empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
        vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
      ) VALUES (
        NEW.empresa_id, 'salida', v_linea.producto_id, v_pendiente, v_linea.unidad_id, v_almacen_id,
        v_vendedor_id, 'entrega_hecho', NEW.id,
        'Entrega a cliente (folio ' || COALESCE(NEW.folio, '—') || ')', CURRENT_DATE
      );
    ELSE
      -- Ya descontado: insertar anclaje de control (idempotencia)
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
        vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
      )
      SELECT NEW.empresa_id, 'salida', v_linea.producto_id, 0, v_linea.unidad_id, v_almacen_id,
        v_vendedor_id, 'entrega_hecho', NEW.id, 'Anclaje (descuento previo)', CURRENT_DATE
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario
        WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_hecho' AND producto_id = v_linea.producto_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) apply_entrega_cargado_inventory: 'en_ruta' es estado activo (no reversa)
--    ÚNICO cambio vs. la versión viva: v_active_statuses incluye 'en_ruta'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_entrega_cargado_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_vendedor_id uuid;
  v_almacen_destino uuid;
  v_linea record;
  v_existing int;
  v_surtir_done boolean;
  v_active_statuses text[] := ARRAY['asignado','cargado','en_ruta'];  -- FIX (#14): + en_ruta
BEGIN
  -- Reversión: cuando salimos de activo hacia un estado previo (no hecho, no activo)
  IF TG_OP = 'UPDATE'
     AND OLD.status::text = ANY(v_active_statuses)
     AND NOT (NEW.status::text = ANY(v_active_statuses))
     AND NEW.status::text <> 'hecho' THEN
    -- FIX (cancelar en bloque): si cancelar_entregas_bulk YA devolvió el stock a
    -- mano (movimiento 'Cancelación…' camión→bodega), NO reversar otra vez, o el
    -- camión se descuenta doble y queda negativo. El cancelar individual no crea
    -- ese movimiento, así que ahí la reversa sí procede normal.
    IF EXISTS (
      SELECT 1 FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id AND notas ILIKE 'Cancelación%'
    ) THEN
      RETURN NEW;
    END IF;
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
        WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
      END IF;
      IF v_linea.almacen_destino_id IS NOT NULL AND v_linea.cantidad > 0 THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad - v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_destino_id AND producto_id = v_linea.producto_id;
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo IN ('entrega_cargado', 'entrega')
      AND notas ILIKE 'Carga%';
    RETURN NEW;
  END IF;

  -- Aplicación: cuando entramos a un estado activo
  IF NOT (NEW.status::text = ANY(v_active_statuses)) THEN RETURN NEW; END IF;
  -- Si ya estábamos en un estado activo y seguimos en otro activo, no re-aplicar
  IF TG_OP = 'UPDATE' AND OLD.status::text = ANY(v_active_statuses) THEN RETURN NEW; END IF;
  -- Idempotencia: si ya hay movimiento entrega_cargado para esta entrega, no duplicar
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'entrega_cargado' AND referencia_id = NEW.id;
  IF v_existing > 0 THEN RETURN NEW; END IF;

  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  IF v_vendedor_id IS NULL THEN RETURN NEW; END IF;
  SELECT almacen_id INTO v_almacen_destino FROM public.profiles WHERE id = v_vendedor_id;
  IF v_almacen_destino IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega' AND tipo = 'salida' AND cantidad > 0
  ) INTO v_surtir_done;

  FOR v_linea IN
    SELECT producto_id, cantidad_entregada, almacen_origen_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id AND hecho = true AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    IF NOT v_surtir_done AND v_linea.almacen_origen_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad - v_linea.cantidad_entregada, updated_at = now()
      WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
    END IF;

    INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (NEW.empresa_id, v_almacen_destino, v_linea.producto_id, v_linea.cantidad_entregada)
    ON CONFLICT (almacen_id, producto_id)
      DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id,
      vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
    ) VALUES (
      NEW.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad_entregada,
      v_linea.almacen_origen_id, v_almacen_destino, v_vendedor_id, 'entrega_cargado', NEW.id,
      CASE WHEN v_surtir_done THEN 'Carga a camión (origen ya descontado por surtir)'
           ELSE 'Carga a ruta (trigger BD, asignación)' END,
      CURRENT_DATE
    );
  END LOOP;

  RETURN NEW;
END;
$function$;
