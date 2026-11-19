-- Edición segura de compras/facturas ya confirmadas o recibidas.
--
-- El guardado anterior borraba todas las líneas y las insertaba de nuevo. Ese
-- patrón pierde la identidad de cada renglón y no permite reconciliar lo que ya
-- entró al almacén. Esta función conserva las líneas existentes y mueve sólo la
-- diferencia real, dentro de una única transacción y con bloqueos de fila.

CREATE OR REPLACE FUNCTION public._aplicar_delta_compra_edicion(
  p_empresa_id uuid,
  p_compra_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_delta numeric,
  p_user_id uuid,
  p_folio text,
  p_nota text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock numeric;
  v_pendiente numeric;
  v_tomar numeric;
  v_stock_lote numeric;
  v_lote record;
  v_epsilon constant numeric := 0.0001;
BEGIN
  IF p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'La compra no tiene almacén destino';
  END IF;
  IF COALESCE(p_delta, 0) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  VALUES (p_empresa_id, p_almacen_id, p_producto_id, 0)
  ON CONFLICT (almacen_id, producto_id) DO NOTHING;

  SELECT cantidad
    INTO v_stock
  FROM public.stock_almacen
  WHERE almacen_id = p_almacen_id
    AND producto_id = p_producto_id
  FOR UPDATE;

  IF p_delta < 0 AND COALESCE(v_stock, 0) + p_delta < -v_epsilon THEN
    RAISE EXCEPTION
      'No se puede reducir o eliminar este renglón: el almacén tiene % pieza(s) y se necesitan revertir %. Parte de esa mercancía ya fue utilizada o vendida.',
      COALESCE(v_stock, 0), ABS(p_delta);
  END IF;

  UPDATE public.stock_almacen
     SET cantidad = cantidad + p_delta,
         updated_at = now()
   WHERE almacen_id = p_almacen_id
     AND producto_id = p_producto_id;

  IF p_delta > 0 THEN
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
      referencia_tipo, referencia_id, user_id, fecha, notas
    ) VALUES (
      p_empresa_id, 'entrada', p_producto_id, p_delta, p_almacen_id,
      'compra', p_compra_id, p_user_id, current_date,
      concat('Edición compra ', COALESCE(p_folio, p_compra_id::text),
             CASE WHEN p_nota IS NULL THEN '' ELSE ' · ' || p_nota END)
    );
    RETURN;
  END IF;

  -- Al disminuir una recepción antigua, primero se revierte el desglose por
  -- lote que no está respaldado por una asignación activa en
  -- compra_linea_lotes. Las asignaciones activas se preservan y nunca quedan
  -- apuntando a stock que esta edición haya descontado silenciosamente.
  v_pendiente := ABS(p_delta);
  FOR v_lote IN
    WITH neto AS (
      SELECT mi.lote_id,
             SUM(
               CASE WHEN mi.almacen_destino_id = p_almacen_id THEN mi.cantidad ELSE 0 END
               - CASE WHEN mi.almacen_origen_id = p_almacen_id THEN mi.cantidad ELSE 0 END
             ) AS piezas,
             MAX(mi.created_at) AS ultimo_movimiento
      FROM public.movimientos_inventario mi
      WHERE mi.empresa_id = p_empresa_id
        AND mi.referencia_tipo = 'compra'
        AND mi.referencia_id = p_compra_id
        AND mi.producto_id = p_producto_id
        AND mi.lote_id IS NOT NULL
      GROUP BY mi.lote_id
    ), asignado AS (
      SELECT cll.lote_id, SUM(cll.piezas) AS piezas
      FROM public.compra_linea_lotes cll
      WHERE cll.empresa_id = p_empresa_id
        AND cll.compra_id = p_compra_id
        AND cll.producto_id = p_producto_id
        AND cll.almacen_id = p_almacen_id
      GROUP BY cll.lote_id
    )
    SELECT n.lote_id,
           GREATEST(0, n.piezas - COALESCE(a.piezas, 0)) AS disponible
    FROM neto n
    LEFT JOIN asignado a ON a.lote_id = n.lote_id
    WHERE n.piezas - COALESCE(a.piezas, 0) > v_epsilon
    ORDER BY n.ultimo_movimiento DESC, n.lote_id
  LOOP
    EXIT WHEN v_pendiente <= v_epsilon;
    v_tomar := LEAST(v_pendiente, v_lote.disponible);

    SELECT cantidad
      INTO v_stock_lote
    FROM public.stock_lotes
    WHERE almacen_id = p_almacen_id
      AND lote_id = v_lote.lote_id
    FOR UPDATE;

    IF COALESCE(v_stock_lote, 0) + v_epsilon < v_tomar THEN
      RAISE EXCEPTION
        'No se puede reducir la compra: el lote relacionado ya no tiene existencias suficientes.';
    END IF;

    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id,
      referencia_tipo, referencia_id, user_id, fecha, notas
    ) VALUES (
      p_empresa_id, 'salida', p_producto_id, v_tomar, p_almacen_id, v_lote.lote_id,
      'compra', p_compra_id, p_user_id, current_date,
      concat('Reversa por edición compra ', COALESCE(p_folio, p_compra_id::text),
             CASE WHEN p_nota IS NULL THEN '' ELSE ' · ' || p_nota END)
    );
    v_pendiente := v_pendiente - v_tomar;
  END LOOP;

  IF v_pendiente > v_epsilon THEN
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
      referencia_tipo, referencia_id, user_id, fecha, notas
    ) VALUES (
      p_empresa_id, 'salida', p_producto_id, v_pendiente, p_almacen_id,
      'compra', p_compra_id, p_user_id, current_date,
      concat('Reversa por edición compra ', COALESCE(p_folio, p_compra_id::text),
             CASE WHEN p_nota IS NULL THEN '' ELSE ' · ' || p_nota END)
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._aplicar_delta_compra_edicion(uuid, uuid, uuid, uuid, numeric, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._aplicar_delta_compra_edicion(uuid, uuid, uuid, uuid, numeric, uuid, text, text) FROM authenticated;


CREATE OR REPLACE FUNCTION public.guardar_compra_segura(
  p_compra_id uuid,
  p_compra jsonb,
  p_lineas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_linea public.compra_lineas%ROWTYPE;
  v_input record;
  v_producto record;
  v_empresa_id uuid;
  v_almacen_id uuid;
  v_proveedor_id uuid;
  v_actor uuid := auth.uid();
  v_folio text;
  v_status_original text;
  v_status_final text;
  v_condicion text;
  v_descuento_tipo text;
  v_total numeric;
  v_total_pagado numeric := 0;
  v_total_anterior numeric;
  v_total_nuevo numeric;
  v_recibido_anterior numeric;
  v_recibido_deseado numeric;
  v_delta numeric;
  v_loteado numeric;
  v_stock_disponible numeric;
  v_pendiente_inventario numeric;
  v_maneja_lotes_empresa boolean := false;
  v_requiere_lote boolean;
  v_era_completa boolean;
  v_recalc_producto_id uuid;
  v_productos_recalcular uuid[] := ARRAY[]::uuid[];
  v_es_nueva boolean := p_compra_id IS NULL;
  v_creadas integer := 0;
  v_actualizadas integer := 0;
  v_eliminadas integer := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_epsilon constant numeric := 0.0001;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para guardar la compra';
  END IF;
  IF jsonb_typeof(p_compra) <> 'object' THEN
    RAISE EXCEPTION 'Los datos de la compra no son válidos';
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto a la compra';
  END IF;

  IF v_es_nueva THEN
    v_empresa_id := NULLIF(p_compra->>'empresa_id', '')::uuid;
    IF v_empresa_id IS NULL THEN
      RAISE EXCEPTION 'La empresa de la compra es obligatoria';
    END IF;
    IF NOT (v_empresa_id = public.get_my_empresa_id() OR public.is_super_admin(v_actor)) THEN
      RAISE EXCEPTION 'No tienes permiso para crear compras en esta empresa';
    END IF;
    v_status_original := 'borrador';
  ELSE
    SELECT * INTO v_compra
    FROM public.compras
    WHERE id = p_compra_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compra no encontrada';
    END IF;
    v_empresa_id := v_compra.empresa_id;
    IF NOT (v_empresa_id = public.get_my_empresa_id() OR public.is_super_admin(v_actor)) THEN
      RAISE EXCEPTION 'No tienes permiso para editar esta compra';
    END IF;
    IF v_compra.status = 'cancelada' THEN
      RAISE EXCEPTION 'Una compra cancelada no se puede editar';
    END IF;
    v_status_original := v_compra.status;
    v_folio := v_compra.folio;

    -- Serializa la edición con recepciones y pagos concurrentes.
    PERFORM 1 FROM public.compra_lineas WHERE compra_id = p_compra_id FOR UPDATE;
    PERFORM 1 FROM public.pago_compras WHERE compra_id = p_compra_id FOR UPDATE;
  END IF;

  SELECT COALESCE(maneja_lotes, false)
    INTO v_maneja_lotes_empresa
  FROM public.empresas
  WHERE id = v_empresa_id;

  v_almacen_id := NULLIF(p_compra->>'almacen_id', '')::uuid;
  v_proveedor_id := NULLIF(p_compra->>'proveedor_id', '')::uuid;
  IF v_almacen_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_almacen_id AND a.empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Selecciona un almacén destino válido';
  END IF;
  IF v_proveedor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = v_proveedor_id AND p.empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'El proveedor no pertenece a la empresa';
  END IF;

  v_condicion := COALESCE(NULLIF(p_compra->>'condicion_pago', ''), 'contado');
  IF v_condicion NOT IN ('contado', 'credito') THEN
    RAISE EXCEPTION 'La condición de pago no es válida';
  END IF;
  v_descuento_tipo := COALESCE(NULLIF(p_compra->>'descuento_extra_tipo', ''), 'monto');
  IF v_descuento_tipo NOT IN ('monto', 'porcentaje') THEN
    RAISE EXCEPTION 'El tipo de descuento no es válido';
  END IF;
  v_total := GREATEST(0, COALESCE(NULLIF(p_compra->>'total', '')::numeric, 0));

  IF NOT v_es_nueva THEN
    SELECT COALESCE(SUM(pc.monto), 0)
      INTO v_total_pagado
    FROM public.pago_compras pc
    WHERE pc.compra_id = p_compra_id;
    IF v_total + 0.01 < v_total_pagado THEN
      RAISE EXCEPTION
        'El nuevo total (%) no puede ser menor que lo ya pagado (%). Ajusta primero los pagos de la compra.',
        v_total, v_total_pagado;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lineas) AS x(id uuid)
    WHERE x.id IS NOT NULL
    GROUP BY x.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'La factura contiene un renglón duplicado';
  END IF;

  IF v_es_nueva THEN
    INSERT INTO public.compras (
      empresa_id, proveedor_id, almacen_id, fecha, condicion_pago, dias_credito,
      status, subtotal, iva_total, total, saldo_pendiente, descuento_extra,
      descuento_extra_tipo, descuento_extra_motivo, descuento_total, ajuste_total,
      notas, notas_pago, numero_factura, fecha_vencimiento, created_by
    ) VALUES (
      v_empresa_id, v_proveedor_id, v_almacen_id,
      COALESCE(NULLIF(p_compra->>'fecha', '')::date, current_date),
      v_condicion,
      CASE WHEN v_condicion = 'credito' THEN GREATEST(0, COALESCE(NULLIF(p_compra->>'dias_credito', '')::integer, 0)) ELSE 0 END,
      'borrador',
      GREATEST(0, COALESCE(NULLIF(p_compra->>'subtotal', '')::numeric, 0)),
      GREATEST(0, COALESCE(NULLIF(p_compra->>'iva_total', '')::numeric, 0)),
      v_total, v_total, GREATEST(0, COALESCE(NULLIF(p_compra->>'descuento_extra', '')::numeric, 0)),
      v_descuento_tipo, NULLIF(p_compra->>'descuento_extra_motivo', ''),
      GREATEST(0, COALESCE(NULLIF(p_compra->>'descuento_total', '')::numeric, 0)),
      COALESCE(NULLIF(p_compra->>'ajuste_total', '')::numeric, 0),
      NULLIF(p_compra->>'notas', ''), NULLIF(p_compra->>'notas_pago', ''),
      NULLIF(p_compra->>'numero_factura', ''),
      CASE WHEN v_condicion = 'credito' THEN NULLIF(p_compra->>'fecha_vencimiento', '')::date ELSE NULL END,
      v_actor
    )
    RETURNING * INTO v_compra;
    p_compra_id := v_compra.id;
    v_folio := v_compra.folio;
  END IF;

  -- Elimina únicamente los renglones que el usuario quitó. Si tenían loteo,
  -- se borran primero las asignaciones para que su trigger revierta cada lote.
  IF NOT v_es_nueva THEN
    FOR v_linea IN
      SELECT cl.*
      FROM public.compra_lineas cl
      WHERE cl.compra_id = p_compra_id
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_to_recordset(p_lineas) AS x(id uuid)
          WHERE x.id = cl.id
        )
      ORDER BY cl.id
      FOR UPDATE
    LOOP
      v_productos_recalcular := array_append(v_productos_recalcular, v_linea.producto_id);
      v_recibido_anterior := GREATEST(0, COALESCE(v_linea.cantidad_recibida, 0));
      SELECT COALESCE(SUM(cll.piezas), 0)
        INTO v_loteado
      FROM public.compra_linea_lotes cll
      WHERE cll.compra_linea_id = v_linea.id;

      IF v_loteado > 0 THEN
        SELECT sa.cantidad
          INTO v_stock_disponible
        FROM public.stock_almacen sa
        WHERE sa.almacen_id = v_compra.almacen_id
          AND sa.producto_id = v_linea.producto_id
        FOR UPDATE;
        IF COALESCE(v_stock_disponible, 0) + v_epsilon < v_recibido_anterior THEN
          RAISE EXCEPTION
            'No se puede eliminar el renglón: parte de la mercancía ya fue utilizada o vendida';
        END IF;
        IF EXISTS (
          SELECT 1
          FROM (
            SELECT cll.almacen_id, cll.lote_id, SUM(cll.piezas) AS piezas
            FROM public.compra_linea_lotes cll
            WHERE cll.compra_linea_id = v_linea.id
            GROUP BY cll.almacen_id, cll.lote_id
          ) d
          LEFT JOIN public.stock_lotes sl
            ON sl.almacen_id = d.almacen_id AND sl.lote_id = d.lote_id
          WHERE COALESCE(sl.cantidad, 0) + v_epsilon < d.piezas
        ) THEN
          RAISE EXCEPTION 'No se puede eliminar el renglón: parte de sus lotes ya fue utilizada o vendida';
        END IF;
        DELETE FROM public.compra_linea_lotes WHERE compra_linea_id = v_linea.id;
        v_salidas := v_salidas + v_loteado;
      END IF;

      v_delta := GREATEST(0, v_recibido_anterior - v_loteado);
      IF v_delta > v_epsilon THEN
        PERFORM public._aplicar_delta_compra_edicion(
          v_empresa_id, p_compra_id, v_linea.producto_id, v_compra.almacen_id,
          -v_delta, v_actor, v_folio, 'renglón eliminado'
        );
        v_salidas := v_salidas + v_delta;
      END IF;

      DELETE FROM public.compra_lineas WHERE id = v_linea.id;
      v_eliminadas := v_eliminadas + 1;
    END LOOP;
  END IF;

  FOR v_input IN
    SELECT *
    FROM jsonb_to_recordset(p_lineas) AS x(
      id uuid,
      producto_id uuid,
      cantidad numeric,
      precio_unitario numeric,
      subtotal numeric,
      total numeric,
      factor_conversion numeric,
      piezas_total numeric,
      lote_id uuid
    )
  LOOP
    IF v_input.producto_id IS NULL THEN
      RAISE EXCEPTION 'Todos los renglones deben tener un producto';
    END IF;
    IF COALESCE(v_input.cantidad, 0) <= 0 THEN
      RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor que cero';
    END IF;
    IF COALESCE(v_input.factor_conversion, 0) <= 0 THEN
      RAISE EXCEPTION 'El factor de conversión debe ser mayor que cero';
    END IF;
    IF COALESCE(v_input.precio_unitario, 0) < 0 THEN
      RAISE EXCEPTION 'El costo unitario no puede ser negativo';
    END IF;

    SELECT p.id, p.nombre, COALESCE(p.maneja_lote, false) AS maneja_lote
      INTO v_producto
    FROM public.productos p
    WHERE p.id = v_input.producto_id
      AND p.empresa_id = v_empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los productos no pertenece a la empresa';
    END IF;
    v_productos_recalcular := array_append(v_productos_recalcular, v_input.producto_id);

    v_requiere_lote := v_maneja_lotes_empresa AND v_producto.maneja_lote;
    v_total_nuevo := v_input.cantidad * v_input.factor_conversion;

    IF v_input.id IS NULL THEN
      v_recibido_deseado := CASE
        WHEN v_status_original IN ('recibida', 'pagada') AND NOT v_requiere_lote
          THEN v_total_nuevo
        ELSE 0
      END;

      INSERT INTO public.compra_lineas (
        compra_id, producto_id, cantidad, precio_unitario, subtotal, total,
        factor_conversion, piezas_total, cantidad_recibida, piezas_loteadas, lote_id
      ) VALUES (
        p_compra_id, v_input.producto_id, v_input.cantidad,
        COALESCE(v_input.precio_unitario, 0), COALESCE(v_input.subtotal, 0),
        COALESCE(v_input.total, 0), v_input.factor_conversion, v_total_nuevo,
        v_recibido_deseado, 0, v_input.lote_id
      );

      IF v_recibido_deseado > v_epsilon THEN
        PERFORM public._aplicar_delta_compra_edicion(
          v_empresa_id, p_compra_id, v_input.producto_id, v_almacen_id,
          v_recibido_deseado, v_actor, v_folio, 'renglón agregado'
        );
        v_entradas := v_entradas + v_recibido_deseado;
      END IF;
      v_creadas := v_creadas + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_linea
    FROM public.compra_lineas
    WHERE id = v_input.id
      AND compra_id = p_compra_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los renglones fue modificado por otro usuario. Recarga la compra e inténtalo de nuevo.';
    END IF;
    v_productos_recalcular := array_append(v_productos_recalcular, v_linea.producto_id);

    v_recibido_anterior := GREATEST(0, COALESCE(v_linea.cantidad_recibida, 0));
    v_total_anterior := v_linea.cantidad * COALESCE(NULLIF(v_linea.factor_conversion, 0), 1);
    v_era_completa := v_recibido_anterior + v_epsilon >= v_total_anterior;

    SELECT COALESCE(SUM(cll.piezas), 0)
      INTO v_loteado
    FROM public.compra_linea_lotes cll
    WHERE cll.compra_linea_id = v_linea.id;

    IF v_linea.producto_id IS DISTINCT FROM v_input.producto_id AND v_recibido_anterior > v_epsilon THEN
      RAISE EXCEPTION
        'No se puede cambiar el producto "%" porque ya tiene mercancía recibida. Elimina el renglón y agrega el producto correcto.',
        v_producto.nombre;
    END IF;
    IF v_compra.almacen_id IS DISTINCT FROM v_almacen_id AND v_recibido_anterior > v_epsilon THEN
      RAISE EXCEPTION 'No se puede cambiar el almacén de una compra con mercancía recibida';
    END IF;
    IF v_loteado > v_total_nuevo + v_epsilon THEN
      RAISE EXCEPTION
        'No se puede bajar "%" a % pieza(s): ya tiene % pieza(s) asignadas a lotes. Quita primero el loteo excedente.',
        v_producto.nombre, v_total_nuevo, v_loteado;
    END IF;

    v_recibido_deseado := CASE
      WHEN v_status_original IN ('recibida', 'pagada') AND v_era_completa AND NOT v_requiere_lote
        THEN v_total_nuevo
      ELSE LEAST(v_recibido_anterior, v_total_nuevo)
    END;
    v_delta := v_recibido_deseado - v_recibido_anterior;

    IF ABS(v_delta) > v_epsilon THEN
      PERFORM public._aplicar_delta_compra_edicion(
        v_empresa_id, p_compra_id, v_input.producto_id, v_almacen_id,
        v_delta, v_actor, v_folio, 'cantidad corregida'
      );
      IF v_delta > 0 THEN v_entradas := v_entradas + v_delta;
      ELSE v_salidas := v_salidas + ABS(v_delta);
      END IF;
    END IF;

    UPDATE public.compra_lineas
       SET producto_id = v_input.producto_id,
           cantidad = v_input.cantidad,
           precio_unitario = COALESCE(v_input.precio_unitario, 0),
           subtotal = COALESCE(v_input.subtotal, 0),
           total = COALESCE(v_input.total, 0),
           factor_conversion = v_input.factor_conversion,
           piezas_total = v_total_nuevo,
           cantidad_recibida = v_recibido_deseado,
           lote_id = v_input.lote_id
     WHERE id = v_linea.id;
    v_actualizadas := v_actualizadas + 1;
  END LOOP;

  SELECT COALESCE(SUM(GREATEST(
           0,
           cl.cantidad * COALESCE(NULLIF(cl.factor_conversion, 0), 1)
             - COALESCE(cl.cantidad_recibida, 0)
         )), 0)
    INTO v_pendiente_inventario
  FROM public.compra_lineas cl
  WHERE cl.compra_id = p_compra_id;

  v_status_final := CASE
    WHEN v_status_original = 'borrador' THEN 'borrador'
    WHEN v_pendiente_inventario > v_epsilon THEN 'confirmada'
    WHEN v_status_original = 'pagada' AND v_total_pagado + 0.01 >= v_total THEN 'pagada'
    ELSE 'recibida'
  END;

  UPDATE public.compras
     SET proveedor_id = v_proveedor_id,
         almacen_id = v_almacen_id,
         fecha = COALESCE(NULLIF(p_compra->>'fecha', '')::date, current_date),
         condicion_pago = v_condicion,
         dias_credito = CASE WHEN v_condicion = 'credito' THEN GREATEST(0, COALESCE(NULLIF(p_compra->>'dias_credito', '')::integer, 0)) ELSE 0 END,
         status = v_status_final,
         subtotal = GREATEST(0, COALESCE(NULLIF(p_compra->>'subtotal', '')::numeric, 0)),
         iva_total = GREATEST(0, COALESCE(NULLIF(p_compra->>'iva_total', '')::numeric, 0)),
         total = v_total,
         saldo_pendiente = GREATEST(0, v_total - v_total_pagado),
         descuento_extra = GREATEST(0, COALESCE(NULLIF(p_compra->>'descuento_extra', '')::numeric, 0)),
         descuento_extra_tipo = v_descuento_tipo,
         descuento_extra_motivo = NULLIF(p_compra->>'descuento_extra_motivo', ''),
         descuento_total = GREATEST(0, COALESCE(NULLIF(p_compra->>'descuento_total', '')::numeric, 0)),
         ajuste_total = COALESCE(NULLIF(p_compra->>'ajuste_total', '')::numeric, 0),
         notas = NULLIF(p_compra->>'notas', ''),
         notas_pago = NULLIF(p_compra->>'notas_pago', ''),
         numero_factura = NULLIF(p_compra->>'numero_factura', ''),
         fecha_vencimiento = CASE WHEN v_condicion = 'credito' THEN NULLIF(p_compra->>'fecha_vencimiento', '')::date ELSE NULL END
   WHERE id = p_compra_id;

  -- Los triggers de compra_lineas recalculan costos por renglón, pero durante
  -- una edición masiva pueden observar un estado intermedio. Se repite el
  -- cálculo al final, ya con encabezado y líneas definitivos, para no dejar una
  -- valuación basada en media factura.
  FOREACH v_recalc_producto_id IN ARRAY v_productos_recalcular
  LOOP
    PERFORM public.recalc_producto_costo(v_recalc_producto_id);
  END LOOP;

  RETURN jsonb_build_object(
    'compra_id', p_compra_id,
    'status', v_status_final,
    'lineas_creadas', v_creadas,
    'lineas_actualizadas', v_actualizadas,
    'lineas_eliminadas', v_eliminadas,
    'piezas_entrada', v_entradas,
    'piezas_salida', v_salidas
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.guardar_compra_segura(uuid, jsonb, jsonb) TO authenticated, service_role;
