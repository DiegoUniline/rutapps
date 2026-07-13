-- ============================================================================
-- LOTES · Carga a ruta por lote (FEFO automático)
--
-- Problema: apply_carga_kardex insertaba la salida del almacén y la entrada a la
-- ruta SIN lote_id, así que movía stock_almacen pero NO stock_lotes → el lote se
-- quedaba "atascado" en el almacén origen y no aparecía en la ruta.
--
-- Fix: para productos que manejan lote, repartir la cantidad cargada entre los
-- lotes con existencia en el almacén origen por FEFO (caduca primero) y emitir un
-- par de movimientos (salida origen + entrada ruta) POR LOTE, cada uno con
-- lote_id. El trigger central sync_stock_lote_from_movimiento hace el resto:
-- resta el lote en el almacén y lo suma en la ruta.
--
-- Productos SIN lote: comportamiento idéntico al anterior (una salida + una
-- entrada por línea, sin lote_id). Nada cambia con la bandera de lotes apagada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_carga_kardex(_carga_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  cl RECORD;
  v_maneja boolean;
  v_restante numeric;
  v_lote RECORD;
  v_usar numeric;
BEGIN
  SELECT id, empresa_id, almacen_id, almacen_destino_id, vendedor_id, fecha
    INTO c
  FROM public.cargas
  WHERE id = _carga_id;

  IF c.id IS NULL THEN RETURN; END IF;
  IF c.almacen_id IS NULL OR c.almacen_destino_id IS NULL THEN RETURN; END IF;

  -- Ya registrado: no duplicar.
  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario
    WHERE referencia_tipo = 'carga' AND referencia_id = c.id
  ) THEN
    RETURN;
  END IF;

  FOR cl IN
    SELECT cl.producto_id, cl.cantidad_cargada
    FROM public.carga_lineas cl
    WHERE cl.carga_id = c.id AND cl.cantidad_cargada > 0
  LOOP
    SELECT COALESCE(maneja_lote, false) INTO v_maneja
    FROM public.productos WHERE id = cl.producto_id;

    IF v_maneja THEN
      -- Repartir por FEFO entre los lotes del almacén origen.
      v_restante := cl.cantidad_cargada;
      FOR v_lote IN
        SELECT sl.lote_id, sl.cantidad, l.fecha_caducidad
        FROM public.stock_lotes sl
        JOIN public.lotes l ON l.id = sl.lote_id
        WHERE sl.empresa_id = c.empresa_id
          AND sl.almacen_id = c.almacen_id
          AND sl.producto_id = cl.producto_id
          AND sl.cantidad > 0
          AND COALESCE(l.activo, true) = true
        ORDER BY COALESCE(l.fecha_caducidad, '9999-12-31') ASC, sl.cantidad DESC
      LOOP
        EXIT WHEN v_restante <= 0;
        v_usar := LEAST(v_lote.cantidad, v_restante);

        -- Salida del almacén origen (con lote).
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, vendedor_destino_id,
           referencia_tipo, referencia_id, notas, fecha, lote_id)
        VALUES
          (c.empresa_id, 'salida'::tipo_movimiento, cl.producto_id, v_usar, c.almacen_id, c.vendedor_id,
           'carga', c.id, 'Carga a ruta (asignación de stock)', c.fecha, v_lote.lote_id);

        -- Entrada al almacén de ruta (con lote).
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, vendedor_destino_id,
           referencia_tipo, referencia_id, notas, fecha, lote_id)
        VALUES
          (c.empresa_id, 'entrada'::tipo_movimiento, cl.producto_id, v_usar, c.almacen_destino_id, c.vendedor_id,
           'carga', c.id, 'Carga a ruta (recepción en almacén de ruta)', c.fecha, v_lote.lote_id);

        v_restante := v_restante - v_usar;
      END LOOP;

      -- Si no alcanzó el stock por lote, registra el resto SIN lote para no
      -- perder el kardex ni descuadrar stock_almacen.
      IF v_restante > 0 THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, vendedor_destino_id,
           referencia_tipo, referencia_id, notas, fecha)
        VALUES
          (c.empresa_id, 'salida'::tipo_movimiento, cl.producto_id, v_restante, c.almacen_id, c.vendedor_id,
           'carga', c.id, 'Carga a ruta (sin lote asignado)', c.fecha);

        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, vendedor_destino_id,
           referencia_tipo, referencia_id, notas, fecha)
        VALUES
          (c.empresa_id, 'entrada'::tipo_movimiento, cl.producto_id, v_restante, c.almacen_destino_id, c.vendedor_id,
           'carga', c.id, 'Carga a ruta (sin lote asignado)', c.fecha);
      END IF;

    ELSE
      -- Producto sin lote: comportamiento original (una salida + una entrada).
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, vendedor_destino_id,
         referencia_tipo, referencia_id, notas, fecha)
      VALUES
        (c.empresa_id, 'salida'::tipo_movimiento, cl.producto_id, cl.cantidad_cargada, c.almacen_id, c.vendedor_id,
         'carga', c.id, 'Carga a ruta (asignación de stock)', c.fecha);

      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, vendedor_destino_id,
         referencia_tipo, referencia_id, notas, fecha)
      VALUES
        (c.empresa_id, 'entrada'::tipo_movimiento, cl.producto_id, cl.cantidad_cargada, c.almacen_destino_id, c.vendedor_id,
         'carga', c.id, 'Carga a ruta (recepción en almacén de ruta)', c.fecha);
    END IF;
  END LOOP;
END;
$$;
