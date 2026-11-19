-- Rutear devoluciones de producto NO vendible al Almacén Mermas.
--
-- Antes: apply_devolucion_linea_inventory SIEMPRE reingresaba al almacén del
-- vendedor (vendible), sin importar el motivo. Así, producto dañado/vencido/
-- caducado inflaba el stock vendible (caso reportado: reposición dejaba el
-- stock igual porque el malo volvía a vendible en vez de irse a mermas).
--
-- Ahora: si el motivo indica producto malo (danado/vencido/caducado), el
-- reingreso va al Almacén Mermas de la empresa (es_merma=true). Los buenos
-- (no_vendido, cambio, error_pedido, otro) siguen yendo a vendible.
--
-- Opción B: un solo Almacén Mermas por empresa; el vendedor queda registrado en
-- el movimiento (user_id) para el corte. Backward-compatible: si la empresa no
-- tiene almacén de mermas, cae al comportamiento anterior (vendible).

-- 1) Asegurar que TODA empresa tenga su Almacén Mermas (las creadas antes del
--    trigger create_almacen_mermas no lo tenían).
INSERT INTO public.almacenes (empresa_id, nombre, tipo, activo, es_merma)
SELECT e.id, 'Mermas', 'almacen', true, true
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.almacenes a WHERE a.empresa_id = e.id AND a.es_merma = true
);

-- 2) Trigger con ruteo a mermas por motivo.
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
  -- Cargar la devolución
  SELECT id, empresa_id, user_id, vendedor_id INTO v_dev
  FROM public.devoluciones WHERE id = NEW.devolucion_id;
  IF v_dev.id IS NULL THEN RETURN NEW; END IF;

  -- Almacén destino: el del usuario que registró (fallback al vendedor).
  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.user_id;
  IF v_almacen_id IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
    SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.vendedor_id;
  END IF;

  -- NUEVO: si el motivo es de producto NO vendible (dañado/vencido/caducado),
  -- rutear al Almacén Mermas de la empresa. Si no existe, se conserva el vendible.
  IF NEW.motivo::text IN ('danado', 'vencido', 'caducado') THEN
    SELECT id INTO v_merma_almacen
    FROM public.almacenes
    WHERE empresa_id = v_dev.empresa_id AND es_merma = true
    LIMIT 1;
    IF v_merma_almacen IS NOT NULL THEN
      v_almacen_id := v_merma_almacen;
    END IF;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_devolucion_linea_inventory: no almacen for devolucion %', v_dev.id;
    RETURN NEW;
  END IF;

  -- Idempotencia: ya existe movimiento del trigger para esta línea/producto
  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion_aplicada' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id;
  IF v_existing > 0 THEN RETURN NEW; END IF;

  -- Legacy: app vieja ya hizo el reingreso (referencia_tipo='devolucion'),
  -- crear ancla y salir (no doblar).
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
