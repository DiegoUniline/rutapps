-- ============================================================
-- Trigger: apply_devolucion_linea_inventory
-- Reingresa stock al almacén del usuario que registra la
-- devolución, automáticamente al insertar línea.
-- Idempotente y compatible con apps móviles antiguas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_devolucion_linea_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dev record;
  v_almacen_id uuid;
  v_existing int;
  v_legacy int;
BEGIN
  -- Cargar la devolución
  SELECT id, empresa_id, user_id, vendedor_id
  INTO v_dev
  FROM public.devoluciones
  WHERE id = NEW.devolucion_id;

  IF v_dev.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Almacén destino: el del usuario que registró (igual que la app);
  -- fallback al vendedor de la devolución.
  SELECT almacen_id INTO v_almacen_id
  FROM public.profiles
  WHERE id = v_dev.user_id;

  IF v_almacen_id IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
    SELECT almacen_id INTO v_almacen_id
    FROM public.profiles
    WHERE id = v_dev.vendedor_id;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_devolucion_linea_inventory: no almacen for devolucion %', v_dev.id;
    RETURN NEW;
  END IF;

  -- Idempotencia: ya existe movimiento del trigger para esta línea/producto
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion_aplicada'
    AND referencia_id = v_dev.id
    AND producto_id = NEW.producto_id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  -- Legacy: app vieja ya hizo el reingreso (referencia_tipo='devolucion'),
  -- crear ancla y salir.
  SELECT COUNT(*) INTO v_legacy
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion'
    AND referencia_id = v_dev.id
    AND producto_id = NEW.producto_id
    AND tipo = 'entrada';
  IF v_legacy > 0 THEN
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
      referencia_tipo, referencia_id, user_id, notas, fecha
    ) VALUES (
      v_dev.empresa_id, 'entrada', NEW.producto_id, 0, v_almacen_id,
      'devolucion_aplicada', v_dev.id, v_dev.user_id,
      'Ancla (reingreso previo por app móvil)', CURRENT_DATE
    );
    RETURN NEW;
  END IF;

  -- Reingreso real
  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  VALUES (v_dev.empresa_id, v_almacen_id, NEW.producto_id, NEW.cantidad)
  ON CONFLICT (almacen_id, producto_id) DO UPDATE
    SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (
    empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
    referencia_tipo, referencia_id, user_id, notas, fecha
  ) VALUES (
    v_dev.empresa_id, 'entrada', NEW.producto_id, NEW.cantidad, v_almacen_id,
    'devolucion_aplicada', v_dev.id, v_dev.user_id,
    'Devolución (trigger BD)', CURRENT_DATE
  );

  RETURN NEW;
END;
$function$;

-- Reversal: al borrar una línea, restar del stock y borrar movimientos
CREATE OR REPLACE FUNCTION public.reverse_devolucion_linea_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
BEGIN
  FOR v_mov IN
    SELECT id, almacen_destino_id, producto_id, cantidad
    FROM public.movimientos_inventario
    WHERE referencia_id = OLD.devolucion_id
      AND producto_id = OLD.producto_id
      AND referencia_tipo IN ('devolucion_aplicada', 'devolucion')
      AND tipo = 'entrada'
      AND cantidad > 0
  LOOP
    IF v_mov.almacen_destino_id IS NOT NULL THEN
      UPDATE public.stock_almacen
      SET cantidad = cantidad - v_mov.cantidad, updated_at = now()
      WHERE almacen_id = v_mov.almacen_destino_id
        AND producto_id = v_mov.producto_id;
    END IF;
  END LOOP;

  DELETE FROM public.movimientos_inventario
  WHERE referencia_id = OLD.devolucion_id
    AND producto_id = OLD.producto_id
    AND referencia_tipo IN ('devolucion_aplicada', 'devolucion');

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_devolucion_linea_inventory ON public.devolucion_lineas;
CREATE TRIGGER trg_apply_devolucion_linea_inventory
AFTER INSERT ON public.devolucion_lineas
FOR EACH ROW
EXECUTE FUNCTION public.apply_devolucion_linea_inventory();

DROP TRIGGER IF EXISTS trg_reverse_devolucion_linea_inventory ON public.devolucion_lineas;
CREATE TRIGGER trg_reverse_devolucion_linea_inventory
AFTER DELETE ON public.devolucion_lineas
FOR EACH ROW
EXECUTE FUNCTION public.reverse_devolucion_linea_inventory();