-- Fix: 'traspaso' no es un valor válido del enum tipo_movimiento (entrada/salida/transferencia).
-- Sólo se corrige el flujo de traspasos con lotes (confirmar y cancelar).

CREATE OR REPLACE FUNCTION public.revertir_lote_traspaso_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mov RECORD;
BEGIN
  IF NOT (OLD.status = 'confirmado' AND NEW.status = 'cancelado') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = NEW.id AND referencia_tipo = 'traspaso_cancel_lote') THEN RETURN NEW; END IF;
  FOR v_mov IN
    SELECT producto_id, cantidad, lote_id, almacen_origen_id, almacen_destino_id
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND referencia_tipo = 'traspaso'
      AND tipo = 'transferencia'::public.tipo_movimiento AND lote_id IS NOT NULL
    ORDER BY producto_id, lote_id
  LOOP
    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
    VALUES (NEW.empresa_id, 'transferencia'::public.tipo_movimiento, v_mov.producto_id, v_mov.cantidad,
       v_mov.almacen_destino_id, v_mov.almacen_origen_id, v_mov.lote_id,
       'traspaso_cancel_lote', NEW.id, CURRENT_DATE, 'Reversa lote · cancelación traspaso');
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_traspaso(p_traspaso_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_traspaso public.traspasos%ROWTYPE;
  v_linea RECORD;
  v_asignacion RECORD;
  v_origen_id uuid;
  v_destino_id uuid;
  v_stock_id uuid;
  v_stock numeric;
  v_dest_stock_id uuid;
  v_total_lotes numeric;
  v_prod_name text;
  v_allow_negative boolean;
  v_maneja_lote boolean;
  v_folio text;
BEGIN
  SELECT * INTO v_traspaso
  FROM public.traspasos
  WHERE id = p_traspaso_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se puede confirmar un traspaso en borrador'; END IF;
  IF NOT (v_traspaso.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado para confirmar este traspaso';
  END IF;

  v_origen_id := v_traspaso.almacen_origen_id;
  v_destino_id := v_traspaso.almacen_destino_id;

  IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
    SELECT almacen_id INTO v_origen_id FROM public.profiles WHERE id = v_traspaso.vendedor_origen_id;
  END IF;
  IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
    SELECT almacen_id INTO v_destino_id FROM public.profiles WHERE id = v_traspaso.vendedor_destino_id;
  END IF;

  IF v_origen_id IS NULL OR v_destino_id IS NULL THEN RAISE EXCEPTION 'El origen o destino no tiene almacén asignado'; END IF;
  IF v_origen_id = v_destino_id THEN RAISE EXCEPTION 'El origen y destino deben ser diferentes'; END IF;
  v_folio := COALESCE(v_traspaso.folio, '');

  FOR v_linea IN
    SELECT * FROM public.traspaso_lineas WHERE traspaso_id = p_traspaso_id ORDER BY id
  LOOP
    SELECT nombre, COALESCE(vender_sin_stock, false), COALESCE(maneja_lote, false)
    INTO v_prod_name, v_allow_negative, v_maneja_lote
    FROM public.productos
    WHERE id = v_linea.producto_id AND empresa_id = v_traspaso.empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto inválido en el traspaso'; END IF;

    v_stock_id := NULL;
    v_stock := 0;
    SELECT id, cantidad INTO v_stock_id, v_stock
    FROM public.stock_almacen
    WHERE empresa_id = v_traspaso.empresa_id AND almacen_id = v_origen_id AND producto_id = v_linea.producto_id
    FOR UPDATE;

    IF NOT v_allow_negative AND COALESCE(v_stock, 0) < v_linea.cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en origen para "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_stock, 0), v_linea.cantidad;
    END IF;

    IF v_maneja_lote THEN
      SELECT COALESCE(SUM(cantidad), 0) INTO v_total_lotes
      FROM public.traspaso_linea_lotes
      WHERE traspaso_linea_id = v_linea.id;
      IF v_total_lotes <> v_linea.cantidad THEN
        RAISE EXCEPTION 'Asigna lotes por el total de "%". Requerido: %, asignado: %', v_prod_name, v_linea.cantidad, v_total_lotes;
      END IF;

      FOR v_asignacion IN
        SELECT tll.lote_id, tll.cantidad, COALESCE(sl.cantidad, 0) AS disponible
        FROM public.traspaso_linea_lotes tll
        JOIN public.lotes l ON l.id = tll.lote_id
        LEFT JOIN public.stock_lotes sl
          ON sl.empresa_id = tll.empresa_id AND sl.almacen_id = v_origen_id
         AND sl.producto_id = tll.producto_id AND sl.lote_id = tll.lote_id
        WHERE tll.traspaso_linea_id = v_linea.id
          AND tll.empresa_id = v_traspaso.empresa_id
          AND l.producto_id = v_linea.producto_id
        ORDER BY tll.id
        FOR UPDATE OF sl
      LOOP
        IF v_asignacion.disponible < v_asignacion.cantidad THEN
          RAISE EXCEPTION 'Stock insuficiente en el lote de "%". Disponible: %, solicitado: %', v_prod_name, v_asignacion.disponible, v_asignacion.cantidad;
        END IF;
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES
          (v_traspaso.empresa_id, 'transferencia'::public.tipo_movimiento, v_linea.producto_id, v_asignacion.cantidad,
           v_origen_id, v_destino_id, v_asignacion.lote_id, 'traspaso', p_traspaso_id,
           COALESCE(auth.uid(), p_user_id), CURRENT_DATE, 'Traspaso ' || v_folio);
      END LOOP;
    ELSE
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES
        (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad,
         v_origen_id, 'traspaso', p_traspaso_id, COALESCE(auth.uid(), p_user_id), CURRENT_DATE, 'Traspaso ' || v_folio);
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES
        (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad,
         v_destino_id, 'traspaso', p_traspaso_id, COALESCE(auth.uid(), p_user_id), CURRENT_DATE, 'Traspaso ' || v_folio);
    END IF;

    IF v_stock_id IS NULL THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_traspaso.empresa_id, v_origen_id, v_linea.producto_id, -v_linea.cantidad);
    ELSE
      UPDATE public.stock_almacen SET cantidad = COALESCE(cantidad, 0) - v_linea.cantidad, updated_at = now() WHERE id = v_stock_id;
    END IF;

    v_dest_stock_id := NULL;
    SELECT id INTO v_dest_stock_id
    FROM public.stock_almacen
    WHERE empresa_id = v_traspaso.empresa_id AND almacen_id = v_destino_id AND producto_id = v_linea.producto_id
    FOR UPDATE;
    IF v_dest_stock_id IS NULL THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_traspaso.empresa_id, v_destino_id, v_linea.producto_id, v_linea.cantidad);
    ELSE
      UPDATE public.stock_almacen SET cantidad = COALESCE(cantidad, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_dest_stock_id;
    END IF;
  END LOOP;

  UPDATE public.traspasos SET status = 'confirmado' WHERE id = p_traspaso_id;
END;
$function$;