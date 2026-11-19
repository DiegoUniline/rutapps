-- Cancelación de compras transaccional e idempotente.
--
-- Antes, el navegador actualizaba stock, insertaba movimientos, borraba pagos y
-- cambiaba el estado mediante solicitudes independientes. Un error de stock no
-- cancelaba las demás solicitudes y cada reintento podía insertar otra salida.
-- Esta función concentra todo en una transacción PostgreSQL, bloquea la compra
-- y valida inventario/kardex antes de modificar cualquier dato.

CREATE UNIQUE INDEX IF NOT EXISTS uq_movimiento_cancelacion_atomica_compra
  ON public.movimientos_inventario (
    empresa_id,
    referencia_id,
    producto_id,
    almacen_origen_id,
    COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE referencia_tipo = 'compra'
    AND tipo = 'salida'
    AND notas LIKE 'Cancelación atómica compra %';

-- El RPC ya inserta una salida con lote_id. El trigger histórico debe omitir
-- su movimiento auxiliar para que el lote y el kardex no se descuenten dos veces.
CREATE OR REPLACE FUNCTION public.revertir_lote_compra_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
BEGIN
  IF NOT (
    COALESCE(OLD.status, '') <> 'cancelada'
    AND NEW.status = 'cancelada'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.movimientos_inventario mi
    WHERE mi.empresa_id = NEW.empresa_id
      AND mi.referencia_id = NEW.id
      AND mi.referencia_tipo = 'compra'
      AND mi.tipo = 'salida'
      AND mi.notas LIKE 'Cancelación atómica compra %'
  ) THEN
    RETURN NEW;
  END IF;

  -- Compatibilidad con cancelaciones históricas realizadas por clientes que
  -- todavía tengan una versión anterior de la aplicación en caché.
  IF EXISTS (
    SELECT 1
    FROM public.movimientos_inventario mi
    WHERE mi.referencia_id = NEW.id
      AND mi.referencia_tipo = 'compra_cancel_lote'
  ) THEN
    RETURN NEW;
  END IF;

  FOR v_mov IN
    SELECT producto_id, cantidad, lote_id, almacen_destino_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo = 'compra'
      AND tipo = 'entrada'
      AND lote_id IS NOT NULL
  LOOP
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id,
      referencia_tipo, referencia_id, fecha, notas
    ) VALUES (
      NEW.empresa_id, 'salida', v_mov.producto_id, v_mov.cantidad,
      v_mov.almacen_destino_id, v_mov.lote_id, 'compra_cancel_lote', NEW.id,
      CURRENT_DATE, 'Reversa lote · cancelación compra'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.cancelar_compra_segura(p_compra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_actor uuid := auth.uid();
  v_producto record;
  v_lote record;
  v_stock numeric;
  v_stock_lote numeric;
  v_ledger_neto numeric;
  v_lote_total numeric;
  v_sin_lote numeric;
  v_productos integer := 0;
  v_piezas numeric := 0;
  v_pagos_eliminados integer := 0;
  v_epsilon constant numeric := 0.0001;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para cancelar la compra';
  END IF;

  -- El bloqueo serializa dobles clics, reintentos y dos sesiones concurrentes.
  SELECT *
    INTO v_compra
  FROM public.compras
  WHERE id = p_compra_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada';
  END IF;

  IF NOT (
    v_compra.empresa_id = public.get_my_empresa_id()
    OR public.is_super_admin(v_actor)
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para cancelar esta compra';
  END IF;

  -- Idempotencia: la segunda solicitud no mueve inventario ni pagos.
  IF v_compra.status = 'cancelada' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ya_cancelada', true,
      'compra_id', v_compra.id,
      'folio', v_compra.folio,
      'productos_revertidos', 0,
      'piezas_revertidas', 0,
      'pagos_eliminados', 0
    );
  END IF;

  IF v_compra.status = 'borrador' THEN
    RAISE EXCEPTION 'Una compra en borrador debe eliminarse, no cancelarse';
  END IF;

  IF v_compra.almacen_id IS NULL THEN
    RAISE EXCEPTION 'La compra no tiene almacén destino';
  END IF;

  -- Bloquea líneas y pagos para impedir recepción/pago mientras se cancela.
  PERFORM 1
  FROM public.compra_lineas
  WHERE compra_id = v_compra.id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.pago_compras
  WHERE compra_id = v_compra.id
  ORDER BY id
  FOR UPDATE;

  -- Primera pasada: solo validación. No se modifica inventario todavía.
  FOR v_producto IN
    SELECT
      cl.producto_id,
      SUM(GREATEST(0, COALESCE(cl.cantidad_recibida, 0))) AS recibido
    FROM public.compra_lineas cl
    WHERE cl.compra_id = v_compra.id
    GROUP BY cl.producto_id
    HAVING SUM(GREATEST(0, COALESCE(cl.cantidad_recibida, 0))) > v_epsilon
    ORDER BY cl.producto_id
  LOOP
    SELECT sa.cantidad
      INTO v_stock
    FROM public.stock_almacen sa
    WHERE sa.empresa_id = v_compra.empresa_id
      AND sa.almacen_id = v_compra.almacen_id
      AND sa.producto_id = v_producto.producto_id
    FOR UPDATE;

    IF NOT FOUND OR COALESCE(v_stock, 0) + v_epsilon < v_producto.recibido THEN
      RAISE EXCEPTION
        'No se puede cancelar: el producto % tiene % pieza(s) disponibles y deben revertirse %. Parte de la mercancía ya fue utilizada o vendida.',
        COALESCE((
          SELECT p.nombre FROM public.productos p
          WHERE p.id = v_producto.producto_id
        ), v_producto.producto_id::text),
        COALESCE(v_stock, 0),
        v_producto.recibido;
    END IF;

    -- El neto del kardex de esta compra debe coincidir con lo recibido en sus
    -- líneas. Si no coincide, se bloquea en lugar de agravar un descuadre previo.
    SELECT COALESCE(SUM(
      CASE
        WHEN mi.tipo = 'entrada'
          AND mi.almacen_destino_id = v_compra.almacen_id
          THEN mi.cantidad
        WHEN mi.tipo = 'salida'
          AND mi.almacen_origen_id = v_compra.almacen_id
          THEN -mi.cantidad
        ELSE 0
      END
    ), 0)
      INTO v_ledger_neto
    FROM public.movimientos_inventario mi
    WHERE mi.empresa_id = v_compra.empresa_id
      AND mi.referencia_id = v_compra.id
      AND mi.referencia_tipo = 'compra'
      AND mi.producto_id = v_producto.producto_id;

    IF ABS(v_ledger_neto - v_producto.recibido) > v_epsilon THEN
      RAISE EXCEPTION
        'No se puede cancelar porque el kardex previo de % no coincide con la recepción: kardex %, recibido %. Requiere auditoría antes de cancelar.',
        COALESCE((
          SELECT p.nombre FROM public.productos p
          WHERE p.id = v_producto.producto_id
        ), v_producto.producto_id::text),
        v_ledger_neto,
        v_producto.recibido;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (
        SELECT
          mi.lote_id,
          SUM(
            CASE
              WHEN mi.tipo = 'entrada'
                AND mi.almacen_destino_id = v_compra.almacen_id
                THEN mi.cantidad
              WHEN mi.tipo = 'salida'
                AND mi.almacen_origen_id = v_compra.almacen_id
                THEN -mi.cantidad
              ELSE 0
            END
          ) AS neto
        FROM public.movimientos_inventario mi
        WHERE mi.empresa_id = v_compra.empresa_id
          AND mi.referencia_id = v_compra.id
          AND mi.referencia_tipo = 'compra'
          AND mi.producto_id = v_producto.producto_id
          AND mi.lote_id IS NOT NULL
        GROUP BY mi.lote_id
      ) lotes
      WHERE lotes.neto < -v_epsilon
    ) THEN
      RAISE EXCEPTION 'La compra tiene un lote con saldo negativo y requiere auditoría';
    END IF;

    SELECT COALESCE(SUM(lotes.neto), 0)
      INTO v_lote_total
    FROM (
      SELECT
        mi.lote_id,
        SUM(
          CASE
            WHEN mi.tipo = 'entrada'
              AND mi.almacen_destino_id = v_compra.almacen_id
              THEN mi.cantidad
            WHEN mi.tipo = 'salida'
              AND mi.almacen_origen_id = v_compra.almacen_id
              THEN -mi.cantidad
            ELSE 0
          END
        ) AS neto
      FROM public.movimientos_inventario mi
      WHERE mi.empresa_id = v_compra.empresa_id
        AND mi.referencia_id = v_compra.id
        AND mi.referencia_tipo = 'compra'
        AND mi.producto_id = v_producto.producto_id
        AND mi.lote_id IS NOT NULL
      GROUP BY mi.lote_id
    ) lotes
    WHERE lotes.neto > v_epsilon;

    IF v_lote_total > v_producto.recibido + v_epsilon THEN
      RAISE EXCEPTION
        'El desglose por lote supera la recepción del producto y requiere auditoría';
    END IF;

    FOR v_lote IN
      SELECT
        mi.lote_id,
        SUM(
          CASE
            WHEN mi.tipo = 'entrada'
              AND mi.almacen_destino_id = v_compra.almacen_id
              THEN mi.cantidad
            WHEN mi.tipo = 'salida'
              AND mi.almacen_origen_id = v_compra.almacen_id
              THEN -mi.cantidad
            ELSE 0
          END
        ) AS neto
      FROM public.movimientos_inventario mi
      WHERE mi.empresa_id = v_compra.empresa_id
        AND mi.referencia_id = v_compra.id
        AND mi.referencia_tipo = 'compra'
        AND mi.producto_id = v_producto.producto_id
        AND mi.lote_id IS NOT NULL
      GROUP BY mi.lote_id
      HAVING SUM(
        CASE
          WHEN mi.tipo = 'entrada'
            AND mi.almacen_destino_id = v_compra.almacen_id
            THEN mi.cantidad
          WHEN mi.tipo = 'salida'
            AND mi.almacen_origen_id = v_compra.almacen_id
            THEN -mi.cantidad
          ELSE 0
        END
      ) > v_epsilon
      ORDER BY mi.lote_id
    LOOP
      SELECT sl.cantidad
        INTO v_stock_lote
      FROM public.stock_lotes sl
      WHERE sl.empresa_id = v_compra.empresa_id
        AND sl.almacen_id = v_compra.almacen_id
        AND sl.producto_id = v_producto.producto_id
        AND sl.lote_id = v_lote.lote_id
      FOR UPDATE;

      IF NOT FOUND OR COALESCE(v_stock_lote, 0) + v_epsilon < v_lote.neto THEN
        RAISE EXCEPTION
          'No se puede cancelar: un lote relacionado ya no tiene existencias suficientes';
      END IF;
    END LOOP;
  END LOOP;

  -- Segunda pasada: todos los datos ya están validados y bloqueados.
  FOR v_producto IN
    SELECT
      cl.producto_id,
      SUM(GREATEST(0, COALESCE(cl.cantidad_recibida, 0))) AS recibido
    FROM public.compra_lineas cl
    WHERE cl.compra_id = v_compra.id
    GROUP BY cl.producto_id
    HAVING SUM(GREATEST(0, COALESCE(cl.cantidad_recibida, 0))) > v_epsilon
    ORDER BY cl.producto_id
  LOOP
    UPDATE public.stock_almacen
       SET cantidad = cantidad - v_producto.recibido,
           updated_at = now()
     WHERE empresa_id = v_compra.empresa_id
       AND almacen_id = v_compra.almacen_id
       AND producto_id = v_producto.producto_id;

    v_lote_total := 0;
    FOR v_lote IN
      SELECT
        mi.lote_id,
        SUM(
          CASE
            WHEN mi.tipo = 'entrada'
              AND mi.almacen_destino_id = v_compra.almacen_id
              THEN mi.cantidad
            WHEN mi.tipo = 'salida'
              AND mi.almacen_origen_id = v_compra.almacen_id
              THEN -mi.cantidad
            ELSE 0
          END
        ) AS neto
      FROM public.movimientos_inventario mi
      WHERE mi.empresa_id = v_compra.empresa_id
        AND mi.referencia_id = v_compra.id
        AND mi.referencia_tipo = 'compra'
        AND mi.producto_id = v_producto.producto_id
        AND mi.lote_id IS NOT NULL
      GROUP BY mi.lote_id
      HAVING SUM(
        CASE
          WHEN mi.tipo = 'entrada'
            AND mi.almacen_destino_id = v_compra.almacen_id
            THEN mi.cantidad
          WHEN mi.tipo = 'salida'
            AND mi.almacen_origen_id = v_compra.almacen_id
            THEN -mi.cantidad
          ELSE 0
        END
      ) > v_epsilon
      ORDER BY mi.lote_id
    LOOP
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id,
        referencia_tipo, referencia_id, user_id, fecha, notas
      ) VALUES (
        v_compra.empresa_id, 'salida', v_producto.producto_id, v_lote.neto,
        v_compra.almacen_id, v_lote.lote_id, 'compra', v_compra.id, v_actor,
        current_date,
        concat('Cancelación atómica compra ', COALESCE(v_compra.folio, v_compra.id::text))
      );
      v_lote_total := v_lote_total + v_lote.neto;
    END LOOP;

    v_sin_lote := v_producto.recibido - v_lote_total;
    IF v_sin_lote > v_epsilon THEN
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
        referencia_tipo, referencia_id, user_id, fecha, notas
      ) VALUES (
        v_compra.empresa_id, 'salida', v_producto.producto_id, v_sin_lote,
        v_compra.almacen_id, 'compra', v_compra.id, v_actor, current_date,
        concat('Cancelación atómica compra ', COALESCE(v_compra.folio, v_compra.id::text))
      );
    END IF;

    v_productos := v_productos + 1;
    v_piezas := v_piezas + v_producto.recibido;
  END LOOP;

  DELETE FROM public.pago_compras
  WHERE compra_id = v_compra.id;
  GET DIAGNOSTICS v_pagos_eliminados = ROW_COUNT;

  UPDATE public.compras
     SET status = 'cancelada',
         saldo_pendiente = 0
   WHERE id = v_compra.id;

  RETURN jsonb_build_object(
    'ok', true,
    'ya_cancelada', false,
    'compra_id', v_compra.id,
    'folio', v_compra.folio,
    'productos_revertidos', v_productos,
    'piezas_revertidas', v_piezas,
    'pagos_eliminados', v_pagos_eliminados
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_compra_segura(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_compra_segura(uuid) TO authenticated, service_role;
