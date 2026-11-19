-- Al CANCELAR un pedido/entrega ya cargado, el producto se QUEDA en el almacén
-- del vendedor (camión) en vez de regresar a la bodega. Se reconcilia después en
-- la DESCARGA de fin de día (que es donde el vendedor regresa físicamente lo que
-- sobró). Antes:
--   - apply_entrega_cargado_inventory: cualquier salida de estado activo (incluido
--     'cancelado') regresaba el stock a la bodega (almacen_origen) y lo quitaba del
--     camión.
--   - cancelar_entregas_bulk: movía camión→bodega y estampaba 'Cancelación…'.
--   - useCancelarEntrega (front): sumaba a bodega desde el front (doble reingreso).
--
-- Ahora:
--   - Solo el caso NEW.status='cancelado' se queda en el camión (RETURN NEW).
--   - REASIGNAR/REPROGRAMAR (active → borrador/surtido, etc.) SIGUE regresando a
--     bodega, igual que hoy. Y 'hecho' (entrega a cliente) no se toca.
--
-- Cambio quirúrgico: en apply_entrega_cargado_inventory se agrega UN early-return
-- para 'cancelado' al inicio de la rama de reversión. Todo lo demás queda idéntico
-- a la versión viva (20260702160000).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) apply_entrega_cargado_inventory: 'cancelado' deja el stock en el camión
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
  v_active_statuses text[] := ARRAY['asignado','cargado','en_ruta'];
BEGIN
  -- Reversión: cuando salimos de activo hacia un estado previo (no hecho, no activo)
  IF TG_OP = 'UPDATE'
     AND OLD.status::text = ANY(v_active_statuses)
     AND NOT (NEW.status::text = ANY(v_active_statuses))
     AND NEW.status::text <> 'hecho' THEN

    -- NUEVO: al CANCELAR, el producto se queda en el almacén del vendedor (camión).
    -- No se regresa a bodega; la descarga de fin de día lo reconcilia. Reasignar /
    -- reprogramar (cualquier otro estado destino) sí sigue regresando a bodega.
    IF NEW.status::text = 'cancelado' THEN
      RETURN NEW;
    END IF;

    -- (Compat) Si cancelar_entregas_bulk YA devolvió el stock a mano
    -- (movimiento 'Cancelación…'), no reversar otra vez.
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
  IF TG_OP = 'UPDATE' AND OLD.status::text = ANY(v_active_statuses) THEN RETURN NEW; END IF;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) cancelar_entregas_bulk: ya NO devuelve stock a bodega al cancelar.
--    El producto se queda en el camión del vendedor (se reconcilia en la descarga).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_entregas_bulk(p_entrega_ids uuid[], p_motivo text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid := get_my_empresa_id();
  v_entrega RECORD;
  v_canceladas int := 0;
  v_omitidas int := 0;
BEGIN
  IF p_entrega_ids IS NULL OR array_length(p_entrega_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay entregas seleccionadas';
  END IF;

  FOR v_entrega IN
    SELECT e.id, e.status, e.folio, e.motivo_no_entrega
    FROM entregas e
    WHERE e.id = ANY(p_entrega_ids)
      AND (e.empresa_id = v_empresa OR is_super_admin(auth.uid()))
    FOR UPDATE OF e
  LOOP
    IF v_entrega.status::text IN ('hecho','cancelado') THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    -- NUEVO: no se devuelve stock a bodega. El producto cargado se queda en el
    -- almacén del vendedor (camión) y se reconcilia en la descarga. El trigger
    -- apply_entrega_cargado_inventory ve NEW.status='cancelado' y no reversa.
    UPDATE entregas
    SET status = 'cancelado',
        motivo_no_entrega = COALESCE(p_motivo, motivo_no_entrega)
    WHERE id = v_entrega.id;

    v_canceladas := v_canceladas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'canceladas', v_canceladas,
    'con_devolucion_stock', 0,
    'omitidas', v_omitidas
  );
END;
$function$;
