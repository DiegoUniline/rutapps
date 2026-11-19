-- ────────────────────────────────────────────────────
-- Helpers internos
-- ────────────────────────────────────────────────────

-- Mueve cantidad de un almacén a otro y registra kardex.
-- Si origen es NULL, solo entrada (poco probable aquí).
-- Si destino es NULL, solo salida.
CREATE OR REPLACE FUNCTION public._mover_stock_entre_almacenes(
  p_empresa_id uuid,
  p_producto_id uuid,
  p_cantidad numeric,
  p_almacen_origen uuid,
  p_almacen_destino uuid,
  p_referencia_tipo text,
  p_referencia_id uuid,
  p_user_id uuid,
  p_fecha date,
  p_notas text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_stock_id uuid;
  v_qty numeric;
  v_allow_neg boolean;
  v_prod_name text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RETURN; END IF;

  SELECT nombre, vender_sin_stock INTO v_prod_name, v_allow_neg
  FROM productos WHERE id = p_producto_id;

  -- Salida desde origen
  IF p_almacen_origen IS NOT NULL THEN
    SELECT id, cantidad INTO v_stock_id, v_qty
    FROM stock_almacen
    WHERE almacen_id = p_almacen_origen AND producto_id = p_producto_id
    FOR UPDATE;

    IF v_stock_id IS NULL THEN
      IF NOT COALESCE(v_allow_neg, false) THEN
        RAISE EXCEPTION 'Stock insuficiente para "%" en almacén origen (no existe registro)', COALESCE(v_prod_name, p_producto_id::text);
      END IF;
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (p_empresa_id, p_almacen_origen, p_producto_id, -p_cantidad);
    ELSE
      IF NOT COALESCE(v_allow_neg, false) AND (v_qty - p_cantidad) < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para "%" en almacén origen. Disponible: %, requerido: %', COALESCE(v_prod_name, p_producto_id::text), v_qty, p_cantidad;
      END IF;
      UPDATE stock_almacen SET cantidad = v_qty - p_cantidad, updated_at = now() WHERE id = v_stock_id;
    END IF;

    INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
    VALUES (p_empresa_id, 'salida', p_producto_id, p_cantidad, p_almacen_origen, p_almacen_destino, p_referencia_tipo, p_referencia_id, p_user_id, p_fecha, p_notas);
  END IF;

  -- Entrada al destino
  IF p_almacen_destino IS NOT NULL THEN
    SELECT id, cantidad INTO v_stock_id, v_qty
    FROM stock_almacen
    WHERE almacen_id = p_almacen_destino AND producto_id = p_producto_id
    FOR UPDATE;

    IF v_stock_id IS NULL THEN
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (p_empresa_id, p_almacen_destino, p_producto_id, p_cantidad);
    ELSE
      UPDATE stock_almacen SET cantidad = v_qty + p_cantidad, updated_at = now() WHERE id = v_stock_id;
    END IF;

    INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
    VALUES (p_empresa_id, 'entrada', p_producto_id, p_cantidad, p_almacen_origen, p_almacen_destino, p_referencia_tipo, p_referencia_id, p_user_id, p_fecha, p_notas);
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────
-- 1. PREVIEW: ¿qué va a pasar?
-- ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_entregas_bulk_preview(
  p_entrega_ids uuid[],
  p_target_vendedor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target_almacen uuid;
  v_target_nombre text;
  v_resultado jsonb;
BEGIN
  IF p_target_vendedor_id IS NOT NULL THEN
    SELECT almacen_id, nombre INTO v_target_almacen, v_target_nombre
    FROM profiles WHERE id = p_target_vendedor_id;
  END IF;

  SELECT jsonb_build_object(
    'target_vendedor_id', p_target_vendedor_id,
    'target_vendedor_nombre', v_target_nombre,
    'target_almacen_id', v_target_almacen,
    'entregas', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'totales', jsonb_build_object(
      'total', COUNT(*),
      'con_movimiento', COUNT(*) FILTER (WHERE (t.status IN ('cargado','en_ruta'))),
      'sin_movimiento', COUNT(*) FILTER (WHERE (t.status NOT IN ('cargado','en_ruta','hecho','cancelado'))),
      'bloqueadas', COUNT(*) FILTER (WHERE (t.status IN ('hecho','cancelado'))),
      'unidades_a_mover', COALESCE(SUM(t.unidades_total) FILTER (WHERE t.status IN ('cargado','en_ruta')), 0)
    )
  )
  INTO v_resultado
  FROM (
    SELECT
      e.id,
      e.folio,
      e.status::text AS status,
      e.fecha,
      c.nombre AS cliente_nombre,
      vp.nombre AS vendedor_actual_nombre,
      vp.almacen_id AS vendedor_actual_almacen_id,
      al.nombre AS vendedor_actual_almacen_nombre,
      COALESCE((
        SELECT SUM(el.cantidad_entregada)
        FROM entrega_lineas el
        WHERE el.entrega_id = e.id AND el.hecho = true
      ), 0) AS unidades_total,
      (e.status IN ('cargado','en_ruta')) AS requiere_movimiento,
      (e.status IN ('hecho','cancelado')) AS bloqueada
    FROM entregas e
    LEFT JOIN clientes c ON c.id = e.cliente_id
    LEFT JOIN profiles vp ON vp.id = COALESCE(e.vendedor_ruta_id, e.vendedor_id)
    LEFT JOIN almacenes al ON al.id = vp.almacen_id
    WHERE e.id = ANY(p_entrega_ids)
      AND e.empresa_id = get_my_empresa_id()
  ) t;

  RETURN v_resultado;
END;
$$;

-- ────────────────────────────────────────────────────
-- 2. REASIGNAR BULK
-- ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reasignar_entregas_bulk(
  p_entrega_ids uuid[],
  p_target_vendedor_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa uuid := get_my_empresa_id();
  v_target_almacen uuid;
  v_target_estado text;
  v_target_empresa uuid;
  v_entrega RECORD;
  v_linea RECORD;
  v_origen_almacen uuid;
  v_reasignadas int := 0;
  v_con_movimiento int := 0;
  v_omitidas int := 0;
  v_today date := CURRENT_DATE;
BEGIN
  IF p_entrega_ids IS NULL OR array_length(p_entrega_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay entregas seleccionadas';
  END IF;
  IF p_target_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Debes seleccionar un vendedor destino';
  END IF;

  SELECT almacen_id, estado, empresa_id
  INTO v_target_almacen, v_target_estado, v_target_empresa
  FROM profiles WHERE id = p_target_vendedor_id;

  IF v_target_empresa IS NULL THEN RAISE EXCEPTION 'Vendedor destino no encontrado'; END IF;
  IF v_target_empresa <> v_empresa AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'El vendedor destino no pertenece a tu empresa';
  END IF;
  IF v_target_estado <> 'activo' THEN
    RAISE EXCEPTION 'El vendedor destino no está activo';
  END IF;

  FOR v_entrega IN
    SELECT e.*, p.almacen_id AS actual_almacen_id
    FROM entregas e
    LEFT JOIN profiles p ON p.id = COALESCE(e.vendedor_ruta_id, e.vendedor_id)
    WHERE e.id = ANY(p_entrega_ids)
      AND (e.empresa_id = v_empresa OR is_super_admin(auth.uid()))
    FOR UPDATE OF e
  LOOP
    -- Bloqueadas: hecho/cancelado
    IF v_entrega.status::text IN ('hecho','cancelado') THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    -- ¿Mismo vendedor? saltar
    IF COALESCE(v_entrega.vendedor_ruta_id, v_entrega.vendedor_id) = p_target_vendedor_id THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    -- Si está cargado/en_ruta y hay almacén actual: mover stock
    IF v_entrega.status::text IN ('cargado','en_ruta') THEN
      IF v_entrega.actual_almacen_id IS NULL THEN
        RAISE EXCEPTION 'La entrega % está cargada pero el vendedor actual no tiene almacén asignado', COALESCE(v_entrega.folio, v_entrega.id::text);
      END IF;
      IF v_target_almacen IS NULL THEN
        RAISE EXCEPTION 'El vendedor destino no tiene almacén asignado, no se puede mover el stock cargado de la entrega %', COALESCE(v_entrega.folio, v_entrega.id::text);
      END IF;

      FOR v_linea IN
        SELECT producto_id, cantidad_entregada
        FROM entrega_lineas
        WHERE entrega_id = v_entrega.id AND hecho = true AND cantidad_entregada > 0
      LOOP
        PERFORM _mover_stock_entre_almacenes(
          v_empresa, v_linea.producto_id, v_linea.cantidad_entregada,
          v_entrega.actual_almacen_id, v_target_almacen,
          'entrega', v_entrega.id, p_user_id, v_today,
          concat('Reasignación entrega ', COALESCE(v_entrega.folio, v_entrega.id::text))
        );
      END LOOP;
      v_con_movimiento := v_con_movimiento + 1;
    END IF;

    UPDATE entregas
    SET vendedor_ruta_id = p_target_vendedor_id,
        fecha_asignacion = COALESCE(fecha_asignacion, now())
    WHERE id = v_entrega.id;

    v_reasignadas := v_reasignadas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reasignadas', v_reasignadas,
    'con_movimiento_stock', v_con_movimiento,
    'omitidas', v_omitidas
  );
END;
$$;

-- ────────────────────────────────────────────────────
-- 3. CANCELAR BULK
-- ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_entregas_bulk(
  p_entrega_ids uuid[],
  p_motivo text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa uuid := get_my_empresa_id();
  v_entrega RECORD;
  v_linea RECORD;
  v_canceladas int := 0;
  v_con_devolucion int := 0;
  v_omitidas int := 0;
  v_today date := CURRENT_DATE;
BEGIN
  IF p_entrega_ids IS NULL OR array_length(p_entrega_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay entregas seleccionadas';
  END IF;

  FOR v_entrega IN
    SELECT e.*, p.almacen_id AS actual_almacen_id
    FROM entregas e
    LEFT JOIN profiles p ON p.id = COALESCE(e.vendedor_ruta_id, e.vendedor_id)
    WHERE e.id = ANY(p_entrega_ids)
      AND (e.empresa_id = v_empresa OR is_super_admin(auth.uid()))
    FOR UPDATE OF e
  LOOP
    IF v_entrega.status::text IN ('hecho','cancelado') THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    -- Si está cargado/en_ruta: devolver stock al almacén origen original de cada línea
    IF v_entrega.status::text IN ('cargado','en_ruta') THEN
      IF v_entrega.actual_almacen_id IS NULL THEN
        RAISE EXCEPTION 'La entrega % está cargada pero el vendedor no tiene almacén asignado', COALESCE(v_entrega.folio, v_entrega.id::text);
      END IF;

      FOR v_linea IN
        SELECT producto_id, cantidad_entregada, almacen_origen_id
        FROM entrega_lineas
        WHERE entrega_id = v_entrega.id AND hecho = true AND cantidad_entregada > 0
      LOOP
        IF v_linea.almacen_origen_id IS NULL THEN
          RAISE EXCEPTION 'La línea de la entrega % no tiene almacén origen registrado, no se puede devolver el stock', COALESCE(v_entrega.folio, v_entrega.id::text);
        END IF;
        PERFORM _mover_stock_entre_almacenes(
          v_empresa, v_linea.producto_id, v_linea.cantidad_entregada,
          v_entrega.actual_almacen_id, v_linea.almacen_origen_id,
          'entrega', v_entrega.id, p_user_id, v_today,
          concat('Cancelación entrega ', COALESCE(v_entrega.folio, v_entrega.id::text), ' (devolución a origen)')
        );
      END LOOP;
      v_con_devolucion := v_con_devolucion + 1;
    END IF;

    UPDATE entregas
    SET status = 'cancelado',
        motivo_no_entrega = COALESCE(p_motivo, motivo_no_entrega)
    WHERE id = v_entrega.id;

    v_canceladas := v_canceladas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'canceladas', v_canceladas,
    'con_devolucion_stock', v_con_devolucion,
    'omitidas', v_omitidas
  );
END;
$$;

-- ────────────────────────────────────────────────────
-- 4. REPROGRAMAR BULK (cambiar fecha)
-- ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reprogramar_entregas_bulk(
  p_entrega_ids uuid[],
  p_nueva_fecha date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa uuid := get_my_empresa_id();
  v_actualizadas int := 0;
  v_omitidas int := 0;
BEGIN
  IF p_entrega_ids IS NULL OR array_length(p_entrega_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay entregas seleccionadas';
  END IF;
  IF p_nueva_fecha IS NULL THEN RAISE EXCEPTION 'Debes seleccionar una fecha'; END IF;

  WITH actualizadas AS (
    UPDATE entregas
    SET fecha = p_nueva_fecha
    WHERE id = ANY(p_entrega_ids)
      AND (empresa_id = v_empresa OR is_super_admin(auth.uid()))
      AND status::text NOT IN ('hecho','cancelado')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_actualizadas FROM actualizadas;

  v_omitidas := array_length(p_entrega_ids, 1) - v_actualizadas;

  RETURN jsonb_build_object(
    'reprogramadas', v_actualizadas,
    'omitidas', v_omitidas,
    'nueva_fecha', p_nueva_fecha
  );
END;
$$;