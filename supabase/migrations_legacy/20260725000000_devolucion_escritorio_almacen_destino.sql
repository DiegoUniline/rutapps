-- ─────────────────────────────────────────────────────────────────────────────
-- DEVOLUCIONES DESDE ESCRITORIO: almacén destino elegible + marca de reembolso
--
-- Hoy el reingreso de una devolución lo rutea el trigger automáticamente por el
-- MOTIVO (dañado/vencido/caducado → Mermas; el resto → almacén vendible del
-- usuario). Para el flujo de escritorio queremos ELEGIR el almacén destino
-- (vendible o mermas) explícitamente.
--
-- Cambios (aditivos y retrocompatibles):
--   - devoluciones.almacen_destino_id: si viene, el trigger lo respeta (gana
--     sobre el ruteo automático). La app móvil no lo setea → sigue igual.
--   - devoluciones.reembolso_efectivo: marca "se devolvió el dinero en efectivo".
--
-- La baja de saldo NO se hace aquí: se registra desde el front como un cobro
-- tipo 'nota_credito' aplicado a la venta (reusa aplicar_cobro), así el motor de
-- saldos no se toca.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS almacen_destino_id uuid REFERENCES public.almacenes(id),
  ADD COLUMN IF NOT EXISTS reembolso_efectivo boolean NOT NULL DEFAULT false;

-- Trigger de inventario: respeta almacen_destino_id explícito si viene.
CREATE OR REPLACE FUNCTION public.apply_devolucion_linea_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_dev record;
  v_almacen_id uuid;
  v_merma_almacen uuid;
  v_existing int;
  v_legacy int;
BEGIN
  -- Cargar la devolución (incluye el almacén destino explícito si lo hay)
  SELECT id, empresa_id, user_id, vendedor_id, almacen_destino_id INTO v_dev
  FROM public.devoluciones WHERE id = NEW.devolucion_id;
  IF v_dev.id IS NULL THEN RETURN NEW; END IF;

  -- Almacén destino automático: el del usuario que registró (fallback al vendedor).
  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.user_id;
  IF v_almacen_id IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
    SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.vendedor_id;
  END IF;

  -- Ruteo automático por motivo (producto NO vendible → Almacén Mermas).
  IF NEW.motivo::text IN ('danado', 'vencido', 'caducado') THEN
    SELECT id INTO v_merma_almacen
    FROM public.almacenes
    WHERE empresa_id = v_dev.empresa_id AND es_merma = true
    LIMIT 1;
    IF v_merma_almacen IS NOT NULL THEN
      v_almacen_id := v_merma_almacen;
    END IF;
  END IF;

  -- NUEVO (escritorio): si la devolución trae almacén destino explícito, GANA
  -- sobre el ruteo automático. Retrocompatible: móvil no lo setea → sin cambios.
  IF v_dev.almacen_destino_id IS NOT NULL THEN
    v_almacen_id := v_dev.almacen_destino_id;
    IF v_almacen_id <> COALESCE(v_merma_almacen, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      v_merma_almacen := NULL;  -- para la nota del movimiento
    END IF;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_devolucion_linea_inventory: no almacen for devolucion %', v_dev.id;
    RETURN NEW;
  END IF;

  -- Idempotencia
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion_aplicada' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id;
  IF v_existing > 0 THEN RETURN NEW; END IF;

  -- Legacy: app vieja ya reingresó (referencia_tipo='devolucion') → ancla y salir.
  SELECT COUNT(*) INTO v_legacy
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id AND tipo = 'entrada';
  IF v_legacy > 0 THEN
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
      referencia_tipo, referencia_id, user_id, notas, fecha
    ) VALUES (
      v_dev.empresa_id, 'entrada', NEW.producto_id, 0, v_almacen_id,
      'devolucion_aplicada', v_dev.id, v_dev.user_id, 'Ancla (reingreso previo por app móvil)', CURRENT_DATE
    );
    RETURN NEW;
  END IF;

  -- Reingreso real al almacén elegido (vendible o mermas)
  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  VALUES (v_dev.empresa_id, v_almacen_id, NEW.producto_id, NEW.cantidad)
  ON CONFLICT (almacen_id, producto_id)
    DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (
    empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
    referencia_tipo, referencia_id, user_id, notas, fecha
  ) VALUES (
    v_dev.empresa_id, 'entrada', NEW.producto_id, NEW.cantidad, v_almacen_id,
    'devolucion_aplicada', v_dev.id, v_dev.user_id,
    CASE WHEN v_merma_almacen IS NOT NULL THEN 'Devolución a MERMAS (trigger BD)'
         ELSE 'Devolución (trigger BD)' END,
    CURRENT_DATE
  );

  RETURN NEW;
END;
$function$;
