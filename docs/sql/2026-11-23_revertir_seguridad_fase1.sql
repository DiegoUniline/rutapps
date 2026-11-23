-- REVERTIR seguridad fase 1 (20261123020000). Solo con «CONFIRMO revertir seguridad fase 1».
-- Restaura los 22 cuerpos tal como estaban en producción el 2026-11-23 (md5 verificado) y
-- devuelve EXECUTE a authenticated en las 62 funciones internas. No toca la tabla
-- cliente_orden_ruta_dia_respaldo (volver a exponerla requiere decisión aparte) ni borra el
-- helper fn_assert_empresa (queda sin uso; borrarlo es DROP → CONFIRMO aparte).
BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_cobro(p_empresa_id uuid, p_cliente_id uuid, p_monto numeric, p_metodo text, p_referencia text, p_fecha date, p_aplicaciones jsonb, p_turno_id uuid, p_origen text, p_notas text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cobro_id uuid;
  v_app jsonb;
  v_total_app numeric := 0;
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_origen text := NULLIF(lower(btrim(p_origen)), '');
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto del cobro debe ser mayor a 0';
  END IF;

  FOR v_app IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb))
  LOOP
    v_total_app := v_total_app + COALESCE((v_app->>'monto_aplicado')::numeric, 0);
  END LOOP;

  IF v_total_app > p_monto + 0.01 THEN
    RAISE EXCEPTION 'Suma de aplicaciones (%) excede monto del cobro (%)', v_total_app, p_monto;
  END IF;

  IF v_origen = 'pos' THEN
    IF p_turno_id IS NULL THEN
      RAISE EXCEPTION 'Un cobro POS requiere un turno activo';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.caja_turnos t
      WHERE t.id = p_turno_id
        AND t.empresa_id = p_empresa_id
        AND t.cajero_id = v_user_id
        AND t.status = 'abierto'
    ) THEN
      RAISE EXCEPTION 'El turno POS no está abierto o no corresponde a la empresa y cajero';
    END IF;
  ELSIF p_turno_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sólo los cobros con origen POS pueden asociarse a un turno';
  END IF;

  INSERT INTO public.cobros (
    empresa_id,
    cliente_id,
    user_id,
    monto,
    metodo_pago,
    referencia,
    fecha,
    notas,
    status,
    turno_id,
    origen
  ) VALUES (
    p_empresa_id,
    p_cliente_id,
    v_user_id,
    p_monto,
    p_metodo,
    p_referencia,
    p_fecha,
    p_notas,
    'activo',
    p_turno_id,
    v_origen
  )
  RETURNING id INTO v_cobro_id;

  FOR v_app IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb))
  LOOP
    IF COALESCE((v_app->>'monto_aplicado')::numeric, 0) > 0 THEN
      INSERT INTO public.cobro_aplicaciones (cobro_id, venta_id, monto_aplicado)
      VALUES (
        v_cobro_id,
        (v_app->>'venta_id')::uuid,
        (v_app->>'monto_aplicado')::numeric
      );
    END IF;
  END LOOP;

  RETURN v_cobro_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_saldo_inicial(p_empresa_id uuid, p_cliente_id uuid, p_monto numeric, p_fecha date DEFAULT CURRENT_DATE, p_concepto text DEFAULT 'Saldo anterior'::text, p_user_id uuid DEFAULT NULL::uuid, p_fecha_vencimiento date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id uuid;
  v_folio text;
BEGIN
  SELECT 'SAL-' || public.folio_lpad((COALESCE(MAX(
    CASE WHEN folio ~ '^SAL-[0-9]+$'
      THEN CAST(SUBSTRING(folio FROM 5) AS BIGINT)
      ELSE 0
    END
  ), 0) + 1)::TEXT, 4, '0')
  INTO v_folio
  FROM public.ventas
  WHERE empresa_id = p_empresa_id;

  INSERT INTO public.ventas (
    empresa_id, cliente_id, total, saldo_pendiente,
    subtotal, iva_total, ieps_total,
    tipo, es_saldo_inicial, fecha, concepto,
    status, condicion_pago, folio, vendedor_id, fecha_vencimiento
  ) VALUES (
    p_empresa_id, p_cliente_id, p_monto, p_monto,
    p_monto, 0, 0,
    'saldo_inicial', true, p_fecha, p_concepto,
    'confirmado', 'credito', v_folio, NULL, p_fecha_vencimiento
  ) RETURNING id INTO v_venta_id;

  RETURN v_venta_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.saldo_clientes_a_la_fecha(p_empresa_id uuid, p_fecha date)
 RETURNS TABLE(cliente_id uuid, cliente text, cargos numeric, abonos numeric, saldo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cargos AS (
    SELECT v.cliente_id, COALESCE(SUM(v.total),0) AS monto
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id AND v.fecha <= p_fecha
      AND v.status::text <> 'cancelado' AND v.cliente_id IS NOT NULL
    GROUP BY v.cliente_id
  ),
  abonos AS (
    SELECT c.cliente_id, COALESCE(SUM(c.monto),0) AS monto
    FROM public.cobros c
    WHERE c.empresa_id = p_empresa_id AND c.fecha <= p_fecha
      AND COALESCE(c.status,'activo') <> 'cancelado' AND c.cliente_id IS NOT NULL
    GROUP BY c.cliente_id
  ),
  ids AS (SELECT cliente_id FROM cargos UNION SELECT cliente_id FROM abonos)
  SELECT i.cliente_id, cl.nombre, COALESCE(ca.monto,0), COALESCE(ab.monto,0),
         COALESCE(ca.monto,0) - COALESCE(ab.monto,0)
  FROM ids i
  JOIN public.clientes cl ON cl.id = i.cliente_id
  LEFT JOIN cargos ca ON ca.cliente_id = i.cliente_id
  LEFT JOIN abonos ab ON ab.cliente_id = i.cliente_id
  WHERE cl.empresa_id = p_empresa_id
  ORDER BY (COALESCE(ca.monto,0) - COALESCE(ab.monto,0)) DESC, cl.nombre;
$function$;

CREATE OR REPLACE FUNCTION public.verify_admin_pin(p_user_id uuid, p_pin text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = p_user_id 
    AND pin_code = p_pin
    AND pin_code IS NOT NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_admin_pin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = p_user_id
      AND pin_code IS NOT NULL
      AND length(btrim(pin_code)) > 0
  );
$function$;

CREATE OR REPLACE FUNCTION public.surtir_linea_entrega(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_cantidad_surtida numeric, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_new_qty numeric;
  v_already boolean;
BEGIN
  -- IDEMPOTENCIA: bloquear la línea y salir si ya fue surtida.
  SELECT hecho INTO v_already
  FROM entrega_lineas
  WHERE id = p_linea_id
  FOR UPDATE;

  IF COALESCE(v_already, false) THEN
    RETURN; -- ya surtida: no-op
  END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  v_new_qty := COALESCE(v_sa_qty, 0) - p_cantidad_surtida;

  IF NOT COALESCE(v_vender_sin_stock, false) THEN
    IF v_sa_id IS NULL OR v_new_qty < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén. Disponible: %, solicitado: %', COALESCE(v_sa_qty, 0), p_cantidad_surtida;
    END IF;
  END IF;

  IF v_sa_id IS NOT NULL THEN
    UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
  END IF;

  UPDATE entrega_lineas SET cantidad_entregada = p_cantidad_surtida, almacen_origen_id = p_almacen_origen_id, hecho = true WHERE id = p_linea_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'salida', p_producto_id, p_cantidad_surtida, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega');
END;
$function$;

CREATE OR REPLACE FUNCTION public.surtir_linea_entrega_parcial(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_cantidad_pedida numeric, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_disponible numeric;
  v_surtir numeric;
  v_already boolean;
BEGIN
  -- IDEMPOTENCIA: bloquear la línea y salir si ya fue surtida.
  SELECT hecho INTO v_already
  FROM entrega_lineas
  WHERE id = p_linea_id
  FOR UPDATE;

  IF COALESCE(v_already, false) THEN
    RETURN 0; -- ya surtida: no-op
  END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  v_disponible := COALESCE(v_sa_qty, 0);

  IF COALESCE(v_vender_sin_stock, false) THEN
    -- Puede ir a negativo: surtir lo pedido completo.
    v_surtir := p_cantidad_pedida;
  ELSE
    -- Clamp al disponible: surtir el máximo que alcance.
    v_surtir := LEAST(p_cantidad_pedida, v_disponible);
  END IF;

  -- Nada que surtir (0 disponible o pedido 0) → dejar la línea PENDIENTE.
  IF v_surtir <= 0 THEN
    RETURN 0;
  END IF;

  IF v_sa_id IS NOT NULL THEN
    UPDATE stock_almacen SET cantidad = v_disponible - v_surtir, updated_at = now() WHERE id = v_sa_id;
  END IF;

  UPDATE entrega_lineas
  SET cantidad_entregada = v_surtir, almacen_origen_id = p_almacen_origen_id, hecho = true
  WHERE id = p_linea_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'salida', p_producto_id, v_surtir, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega');

  RETURN v_surtir;
END;
$function$;

CREATE OR REPLACE FUNCTION public.surtir_linea_entrega_lotes(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid, p_asignacion jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric := 0;
  v_item jsonb;
  v_lote uuid;
  v_cant numeric;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_vender_sin_stock boolean;
  v_today date := current_date;
BEGIN
  SELECT COALESCE(SUM((x->>'cantidad')::numeric), 0) INTO v_total
  FROM jsonb_array_elements(COALESCE(p_asignacion, '[]'::jsonb)) x;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Asignación de lotes vacía'; END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  IF v_sa_id IS NULL THEN
    IF NOT COALESCE(v_vender_sin_stock, false) THEN
      RAISE EXCEPTION 'Sin stock en el almacén origen';
    END IF;
    INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (p_empresa_id, p_almacen_origen_id, p_producto_id, -v_total);
  ELSE
    IF NOT COALESCE(v_vender_sin_stock, false) AND COALESCE(v_sa_qty,0) - v_total < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén. Disponible: %, solicitado: %', COALESCE(v_sa_qty,0), v_total;
    END IF;
    UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) - v_total, updated_at = now() WHERE id = v_sa_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_asignacion, '[]'::jsonb))
  LOOP
    v_lote := (v_item->>'lote_id')::uuid;
    v_cant := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_lote IS NULL OR v_cant <= 0 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE id = v_lote AND producto_id = p_producto_id) THEN
      RAISE EXCEPTION 'Un lote no corresponde al producto';
    END IF;
    INSERT INTO movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
    VALUES
      (p_empresa_id, 'salida', p_producto_id, v_cant, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega (lote)', v_lote);
  END LOOP;

  UPDATE entrega_lineas
  SET cantidad_entregada = v_total, almacen_origen_id = p_almacen_origen_id, hecho = true
  WHERE id = p_linea_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revertir_surtido_linea(p_linea_id uuid, p_entrega_id uuid, p_empresa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_producto uuid;
  v_hecho boolean;
  v_mov record;
  v_upd int;
BEGIN
  SELECT producto_id, hecho INTO v_producto, v_hecho
  FROM entrega_lineas WHERE id = p_linea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Línea no encontrada'; END IF;

  FOR v_mov IN
    SELECT id, cantidad, lote_id, almacen_origen_id
    FROM movimientos_inventario
    WHERE empresa_id = p_empresa_id
      AND referencia_tipo = 'entrega'
      AND referencia_id = p_entrega_id
      AND producto_id = v_producto
      AND tipo = 'salida'
    FOR UPDATE
  LOOP
    IF v_mov.almacen_origen_id IS NOT NULL THEN
      UPDATE stock_almacen
      SET cantidad = cantidad + v_mov.cantidad, updated_at = now()
      WHERE almacen_id = v_mov.almacen_origen_id AND producto_id = v_producto;
      GET DIAGNOSTICS v_upd = ROW_COUNT;
      IF v_upd = 0 THEN
        INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (p_empresa_id, v_mov.almacen_origen_id, v_producto, v_mov.cantidad);
      END IF;
    END IF;

    IF v_mov.lote_id IS NOT NULL AND v_mov.almacen_origen_id IS NOT NULL THEN
      PERFORM public._aplica_stock_lote(p_empresa_id, v_mov.almacen_origen_id, v_producto, v_mov.lote_id, v_mov.cantidad);
    END IF;

    DELETE FROM movimientos_inventario WHERE id = v_mov.id;
  END LOOP;

  UPDATE entrega_lineas
  SET hecho = false, cantidad_entregada = 0
  WHERE id = p_linea_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recibir_compra_linea_parcial(p_linea_id uuid, p_piezas numeric, p_almacen_id uuid, p_empresa_id uuid, p_compra_id uuid, p_folio text, p_user_id uuid, p_lote_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_producto_id uuid; v_cantidad numeric; v_factor numeric; v_recibido numeric;
  v_total_piezas numeric; v_pendiente numeric; v_a_recibir numeric;
  v_sa_id uuid; v_sa_qty numeric; v_today date := current_date;
  v_pendiente_compra numeric; v_sl_id uuid; v_sl_qty numeric;
BEGIN
  SELECT producto_id, cantidad, COALESCE(NULLIF(factor_conversion,0), 1), cantidad_recibida
    INTO v_producto_id, v_cantidad, v_factor, v_recibido
  FROM compra_lineas WHERE id = p_linea_id FOR UPDATE;

  IF v_producto_id IS NULL THEN RAISE EXCEPTION 'Línea de compra no encontrada'; END IF;

  v_total_piezas := v_cantidad * v_factor;
  v_pendiente := GREATEST(0, v_total_piezas - v_recibido);
  IF v_pendiente <= 0 THEN RETURN; END IF;

  v_a_recibir := LEAST(COALESCE(p_piezas, v_pendiente), v_pendiente);
  IF v_a_recibir <= 0 THEN RETURN; END IF;

  IF p_lote_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE id = p_lote_id AND producto_id = v_producto_id) THEN
      RAISE EXCEPTION 'El lote no corresponde al producto de la línea';
    END IF;
  END IF;

  IF p_almacen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen WHERE almacen_id = p_almacen_id AND producto_id = v_producto_id FOR UPDATE;
    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) + v_a_recibir, updated_at = now() WHERE id = v_sa_id;
    ELSE
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (p_empresa_id, p_almacen_id, v_producto_id, v_a_recibir);
    END IF;

    IF p_lote_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_sl_id, v_sl_qty
      FROM stock_lotes WHERE almacen_id = p_almacen_id AND lote_id = p_lote_id FOR UPDATE;
      IF v_sl_id IS NOT NULL THEN
        UPDATE stock_lotes SET cantidad = COALESCE(v_sl_qty,0) + v_a_recibir, updated_at = now() WHERE id = v_sl_id;
      ELSE
        INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
        VALUES (p_empresa_id, p_almacen_id, v_producto_id, p_lote_id, v_a_recibir);
      END IF;
    END IF;
  END IF;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
  VALUES (p_empresa_id, 'entrada', v_producto_id, v_a_recibir, p_almacen_id, 'compra', p_compra_id, p_user_id, v_today,
          concat('Compra ', COALESCE(p_folio, p_compra_id::text), ' recepción parcial'), p_lote_id);

  UPDATE compra_lineas SET cantidad_recibida = v_recibido + v_a_recibir WHERE id = p_linea_id;

  SELECT COALESCE(SUM(GREATEST(0, cantidad * COALESCE(NULLIF(factor_conversion,0),1) - cantidad_recibida)), 0)
    INTO v_pendiente_compra
  FROM compra_lineas WHERE compra_id = p_compra_id;

  IF v_pendiente_compra = 0 THEN
    UPDATE compras SET status = 'recibida'
     WHERE id = p_compra_id AND status NOT IN ('recibida','pagada','cancelada');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.asignar_lote_masivo(p_empresa_id uuid, p_almacen_id uuid, p_codigo text, p_caducidad date, p_fabricacion date, p_costo numeric, p_items jsonb, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb; v_producto uuid; v_cant numeric; v_lote uuid; v_count int := 0;
BEGIN
  IF p_almacen_id IS NULL THEN RAISE EXCEPTION 'Falta el almacén'; END IF;
  IF p_codigo IS NULL OR btrim(p_codigo) = '' THEN RAISE EXCEPTION 'El código de lote es obligatorio'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_producto := (v_item->>'producto_id')::uuid;
    v_cant := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_producto IS NULL THEN CONTINUE; END IF;
    UPDATE productos SET maneja_lote = true WHERE id = v_producto AND empresa_id = p_empresa_id;
    SELECT id INTO v_lote FROM lotes
     WHERE empresa_id = p_empresa_id AND producto_id = v_producto AND codigo = btrim(p_codigo)
       AND COALESCE(fecha_caducidad,'9999-12-31'::date) = COALESCE(p_caducidad,'9999-12-31'::date);
    IF v_lote IS NULL THEN
      INSERT INTO lotes (empresa_id, producto_id, codigo, fecha_caducidad, fecha_fabricacion, costo)
      VALUES (p_empresa_id, v_producto, btrim(p_codigo), p_caducidad, p_fabricacion, p_costo) RETURNING id INTO v_lote;
    ELSE
      UPDATE lotes SET fecha_fabricacion = COALESCE(p_fabricacion, fecha_fabricacion), costo = COALESCE(p_costo, costo) WHERE id = v_lote;
    END IF;
    INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
    VALUES (p_empresa_id, p_almacen_id, v_producto, v_lote, v_cant)
    ON CONFLICT (almacen_id, lote_id) DO UPDATE SET cantidad = EXCLUDED.cantidad, updated_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.cancelar_traspaso(p_traspaso_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_traspaso traspasos%ROWTYPE;
  v_linea RECORD;
  v_today date := CURRENT_DATE;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_new_qty numeric;
  v_prod_name text;
  v_allow_negative boolean;
  v_vendedor_almacen_id uuid;
BEGIN
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status = 'cancelado' THEN RAISE EXCEPTION 'Este traspaso ya está cancelado'; END IF;

  IF v_traspaso.status = 'confirmado' THEN
    FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
      SELECT nombre, vender_sin_stock INTO v_prod_name, v_allow_negative FROM productos WHERE id = v_linea.producto_id;

      -- === RETURN TO ORIGIN ===
      IF v_traspaso.almacen_origen_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_origen_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
        ELSE
          INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_traspaso.almacen_origen_id, v_linea.producto_id, v_linea.cantidad);
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, ''));
      END IF;

      IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
        SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_origen_id;
        IF v_vendedor_almacen_id IS NOT NULL THEN
          SELECT id, cantidad INTO v_sa_id, v_sa_qty
          FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

          IF v_sa_id IS NOT NULL THEN
            UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
          ELSE
            INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_vendedor_almacen_id, v_linea.producto_id, v_linea.cantidad);
          END IF;

          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (devuelto a ruta)');
        END IF;
      END IF;

      -- === DEDUCT FROM DESTINATION ===
      IF v_traspaso.almacen_destino_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_destino_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
          IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
            RAISE EXCEPTION 'Stock insuficiente en destino para cancelar "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
          END IF;
          UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, ''));
      END IF;

      IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
        SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_destino_id;
        IF v_vendedor_almacen_id IS NOT NULL THEN
          SELECT id, cantidad INTO v_sa_id, v_sa_qty
          FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

          IF v_sa_id IS NOT NULL THEN
            v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
            IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
              RAISE EXCEPTION 'Stock insuficiente en ruta destino para cancelar "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
            END IF;
            UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
          END IF;

          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (retirado de ruta)');
        END IF;
      END IF;

    END LOOP;
  END IF;

  UPDATE traspasos SET status = 'cancelado' WHERE id = p_traspaso_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_pedido_parcial(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ventas
  SET cerrado_at = NULL, cerrado_por = NULL, total_efectivo = NULL, cerrado_snapshot = NULL
  WHERE id = p_venta_id AND cerrado_at IS NOT NULL;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_pedido_parcial(p_venta_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_excedente text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta      public.ventas%ROWTYPE;
  v_orig_base  numeric;
  v_deliv_base numeric;
  v_cobrable   numeric;
  v_cobros     numeric;
  v_saldo      numeric;
  v_snapshot   jsonb;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  IF v_venta.tipo::text <> 'pedido' THEN
    RAISE EXCEPTION 'Solo se pueden cerrar pedidos'; END IF;
  IF v_venta.politica_cobro IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Solo aplica a pedidos con política de cobro por entregado'; END IF;
  IF v_venta.cerrado_at IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'; END IF;
  IF v_venta.status::text IN ('cancelado','facturado') THEN
    RAISE EXCEPTION 'No se puede cerrar un pedido cancelado o facturado'; END IF;
  IF COALESCE(v_venta.es_saldo_inicial,false) THEN
    RAISE EXCEPTION 'No aplica a saldos iniciales'; END IF;

  SELECT COALESCE(SUM(base), 0), COALESCE(SUM(base * ratio), 0)
    INTO v_orig_base, v_deliv_base
  FROM (
    SELECT
      (COALESCE(vl.subtotal,0) + COALESCE(vl.iva_monto,0) + COALESCE(vl.ieps_monto,0)) AS base,
      CASE WHEN vl.cantidad > 0
           THEN LEAST(COALESCE(ent.entregado, 0), vl.cantidad) / vl.cantidad
           ELSE 0 END AS ratio
    FROM public.venta_lineas vl
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(el.cantidad_entregada), 0) AS entregado
      FROM public.entrega_lineas el
      JOIN public.entregas e ON e.id = el.entrega_id
      WHERE e.pedido_id = p_venta_id
        AND e.status::text NOT IN ('cancelado','no_entregado')
        AND el.producto_id = vl.producto_id
    ) ent ON true
    WHERE vl.venta_id = p_venta_id
  ) q;

  IF COALESCE(v_deliv_base, 0) <= 0 THEN
    RAISE EXCEPTION 'No hay nada entregado: cancela el pedido en vez de cerrarlo';
  END IF;

  v_cobrable := CASE WHEN COALESCE(v_orig_base,0) > 0
                     THEN ROUND(COALESCE(v_venta.total,0) * (v_deliv_base / v_orig_base), 2)
                     ELSE 0 END;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';

  v_saldo := GREATEST(0, v_cobrable - v_cobros);

  v_snapshot := jsonb_build_object(
    'pedido_total',    COALESCE(v_venta.total,0),
    'total_efectivo',  v_cobrable,
    'cobros',          v_cobros,
    'saldo',           v_saldo,
    'base_original',   v_orig_base,
    'base_entregada',  v_deliv_base,
    'lineas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'linea_id',    vl.id,
               'producto_id', vl.producto_id,
               'pedido',      vl.cantidad,
               'entregado',   COALESCE((
                  SELECT SUM(el.cantidad_entregada)
                  FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
                  WHERE e.pedido_id = p_venta_id
                    AND e.status::text NOT IN ('cancelado','no_entregado')
                    AND el.producto_id = vl.producto_id), 0),
               'subtotal_orig', vl.subtotal,
               'iva_orig',      vl.iva_monto,
               'ieps_orig',     vl.ieps_monto,
               'total_orig',    vl.total
             )), '[]'::jsonb)
      FROM public.venta_lineas vl WHERE vl.venta_id = p_venta_id
    )
  );

  -- UPDATE sin LATERAL: el ratio se calcula inline usando vl (target) y ent (FROM).
  UPDATE public.venta_lineas vl
  SET
    cantidad   = LEAST(COALESCE(ent.entregado, 0), vl.cantidad),
    subtotal   = ROUND(COALESCE(vl.subtotal,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    iva_monto  = ROUND(COALESCE(vl.iva_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    ieps_monto = ROUND(COALESCE(vl.ieps_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    total      = ROUND(COALESCE(vl.total,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2)
  FROM (
    SELECT vl2.id AS linea_id,
           COALESCE((SELECT SUM(el.cantidad_entregada)
                       FROM public.entrega_lineas el
                       JOIN public.entregas e ON e.id = el.entrega_id
                      WHERE e.pedido_id = p_venta_id
                        AND e.status::text NOT IN ('cancelado','no_entregado')
                        AND el.producto_id = vl2.producto_id), 0) AS entregado
    FROM public.venta_lineas vl2
    WHERE vl2.venta_id = p_venta_id
  ) ent
  WHERE vl.id = ent.linea_id AND vl.venta_id = p_venta_id;

  UPDATE public.ventas
  SET cerrado_at       = now(),
      cerrado_por      = COALESCE(p_user_id, auth.uid()),
      total_efectivo   = v_cobrable,
      cerrado_snapshot = v_snapshot
  WHERE id = p_venta_id;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
  PERFORM public._resolver_excedente_venta(p_venta_id, p_excedente, auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_audit_line(p_linea_id uuid, p_cerrada boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auditoria_id uuid;
  v_producto_id uuid;
  v_cantidad_esperada numeric;
  v_total_scans numeric;
BEGIN
  SELECT auditoria_id, producto_id, cantidad_esperada
  INTO v_auditoria_id, v_producto_id, v_cantidad_esperada
  FROM auditoria_lineas WHERE id = p_linea_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Line not found'; END IF;

  -- Sum scans
  SELECT COALESCE(SUM(cantidad), 0) INTO v_total_scans
  FROM auditoria_escaneos WHERE linea_id = p_linea_id;

  IF p_cerrada THEN
    -- Try to recalculate expected via teorico engine
    BEGIN
      PERFORM calc_audit_stock_teorico(v_auditoria_id);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- ignore if function doesn't exist
    END;

    -- Re-read cantidad_esperada after recalc
    SELECT cantidad_esperada INTO v_cantidad_esperada
    FROM auditoria_lineas WHERE id = p_linea_id;

    UPDATE auditoria_lineas SET
      cerrada = true,
      cerrada_at = now(),
      cantidad_real = v_total_scans,
      diferencia = v_total_scans - v_cantidad_esperada
    WHERE id = p_linea_id;
  ELSE
    UPDATE auditoria_lineas SET
      cerrada = false,
      cerrada_at = NULL
    WHERE id = p_linea_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_full_audit(p_auditoria_id uuid, p_cerrada_por text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_teorico numeric;
BEGIN
  -- Recalculate theoretical stock for all unclosed lines
  FOR v_linea IN 
    SELECT id, COALESCE(cantidad_real, 0) as contado 
    FROM auditoria_lineas 
    WHERE auditoria_id = p_auditoria_id AND cerrada = false
  LOOP
    v_teorico := calc_audit_stock_teorico(v_linea.id);
    UPDATE auditoria_lineas 
    SET cerrada = true,
        cantidad_esperada = v_teorico,
        diferencia = v_linea.contado - v_teorico
    WHERE id = v_linea.id;
  END LOOP;
  
  -- Close the audit
  UPDATE auditorias SET status = 'cerrada', cerrada_por = p_cerrada_por, cerrada_at = now() WHERE id = p_auditoria_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_audit_users(p_auditoria_id uuid)
 RETURNS TABLE(user_id uuid, nombre text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.nombre
  FROM profiles p
  WHERE p.empresa_id = (
    SELECT a.empresa_id FROM auditorias a WHERE a.id = p_auditoria_id LIMIT 1
  )
  AND p.estado = 'activo'
  ORDER BY p.nombre;
$function$;

CREATE OR REPLACE FUNCTION public.validar_stock_cotizacion(p_cotizacion_id uuid, p_almacen_id uuid)
 RETURNS TABLE(producto_id uuid, descripcion text, cantidad_solicitada numeric, stock_disponible numeric, faltante numeric, ok boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    cl.producto_id,
    COALESCE(cl.descripcion, p.nombre) AS descripcion,
    cl.cantidad AS cantidad_solicitada,
    COALESCE(sa.cantidad, 0) AS stock_disponible,
    GREATEST(cl.cantidad - COALESCE(sa.cantidad, 0), 0) AS faltante,
    (COALESCE(sa.cantidad, 0) >= cl.cantidad OR COALESCE(p.vender_sin_stock, false)) AS ok
  FROM public.cotizacion_lineas cl
  LEFT JOIN public.productos p ON p.id = cl.producto_id
  LEFT JOIN public.stock_almacen sa ON sa.producto_id = cl.producto_id AND sa.almacen_id = p_almacen_id
  WHERE cl.cotizacion_id = p_cotizacion_id AND cl.producto_id IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.stock_almacen_at_eod_v2(p_almacen_id uuid, p_fecha date)
 RETURNS TABLE(producto_id uuid, cantidad numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_tz text;
  v_cutoff timestamptz;
BEGIN
  SELECT a.empresa_id, COALESCE(e.zona_horaria, 'America/Mexico_City')
    INTO v_empresa_id, v_tz
  FROM public.almacenes a
  LEFT JOIN public.empresas e ON e.id = a.empresa_id
  WHERE a.id = p_almacen_id;

  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  v_cutoff := ((p_fecha + 1)::timestamp AT TIME ZONE v_tz);

  RETURN QUERY
  WITH live AS (
    SELECT s.producto_id, COALESCE(s.cantidad, 0)::numeric AS cantidad
    FROM public.stock_almacen s
    WHERE s.almacen_id = p_almacen_id
  ),
  posteriores AS (
    SELECT
      m.producto_id,
      SUM(
        CASE
          -- Entradas al almacén (sumaron stock → revertir restando)
          WHEN m.tipo = 'entrada' AND m.almacen_destino_id = p_almacen_id
            THEN COALESCE(m.cantidad,0)
          WHEN m.tipo = 'transferencia' AND m.almacen_destino_id = p_almacen_id
            THEN COALESCE(m.cantidad,0)
          -- Salidas del almacén (restaron stock → revertir sumando)
          WHEN m.tipo = 'salida' AND m.almacen_origen_id = p_almacen_id
            THEN -COALESCE(m.cantidad,0)
          WHEN m.tipo = 'transferencia' AND m.almacen_origen_id = p_almacen_id
            THEN -COALESCE(m.cantidad,0)
          ELSE 0
        END
      )::numeric AS delta
    FROM public.movimientos_inventario m
    WHERE m.empresa_id = v_empresa_id
      AND (m.almacen_origen_id = p_almacen_id OR m.almacen_destino_id = p_almacen_id)
      AND m.created_at >= v_cutoff
    GROUP BY m.producto_id
  )
  SELECT
    COALESCE(l.producto_id, p.producto_id) AS producto_id,
    (COALESCE(l.cantidad,0) - COALESCE(p.delta,0))::numeric AS cantidad
  FROM live l
  FULL OUTER JOIN posteriores p ON p.producto_id = l.producto_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_optimization_quota(_empresa_id uuid)
 RETURNS TABLE(usuarios_activos integer, cuota_base integer, recargas_disponibles integer, cuota_total integer, usadas_mes_actual integer, disponibles integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuarios INTEGER;
  v_base INTEGER;
  v_recargas INTEGER;
  v_usadas INTEGER;
  v_first_of_month TIMESTAMPTZ;
BEGIN
  v_first_of_month := date_trunc('month', now());

  SELECT COUNT(*)::INTEGER INTO v_usuarios
  FROM public.profiles
  WHERE empresa_id = _empresa_id AND estado = 'activo';

  v_base := COALESCE(v_usuarios, 0) * 30;

  SELECT COALESCE(SUM(cantidad_creditos - creditos_consumidos), 0)::INTEGER INTO v_recargas
  FROM public.optimizacion_recargas
  WHERE empresa_id = _empresa_id
    AND status = 'paid'
    AND cantidad_creditos > creditos_consumidos;

  SELECT COUNT(*)::INTEGER INTO v_usadas
  FROM public.optimizacion_rutas_log
  WHERE empresa_id = _empresa_id
    AND created_at >= v_first_of_month;

  RETURN QUERY SELECT
    v_usuarios,
    v_base,
    v_recargas,
    v_base + v_recargas,
    v_usadas,
    GREATEST(0, (v_base + v_recargas) - v_usadas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sandbox_usage(p_empresa_id uuid)
 RETURNS TABLE(clientes_count integer, clientes_max integer, productos_count integer, productos_max integer, ventas_count integer, ventas_max integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM clientes WHERE empresa_id = p_empresa_id), 10,
    (SELECT count(*)::int FROM productos WHERE empresa_id = p_empresa_id), 20,
    (SELECT count(*)::int FROM ventas WHERE empresa_id = p_empresa_id), 50;
$function$;

CREATE OR REPLACE FUNCTION public.next_folio(prefix text, p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num BIGINT;
  pattern TEXT := '^' || prefix || '-[0-9]+$';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('folio:' || prefix), hashtext(p_empresa_id::text));
  IF prefix IN ('VTA', 'PED') THEN
    SELECT COALESCE(MAX(CASE WHEN folio ~ pattern THEN CAST(SUBSTRING(folio FROM LENGTH(prefix) + 2) AS BIGINT) ELSE 0 END), 0) + 1
    INTO next_num FROM public.ventas WHERE empresa_id = p_empresa_id AND folio ~ pattern;
  ELSIF prefix = 'CLI' THEN
    SELECT COALESCE(MAX(CASE WHEN codigo ~ pattern THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS BIGINT) ELSE 0 END), 0) + 1
    INTO next_num FROM public.clientes WHERE empresa_id = p_empresa_id;
  ELSIF prefix = 'PROD' THEN
    SELECT COALESCE(MAX(CASE WHEN codigo ~ pattern THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS BIGINT) ELSE 0 END), 0) + 1
    INTO next_num FROM public.productos WHERE empresa_id = p_empresa_id;
  ELSE
    next_num := 1;
  END IF;
  RETURN prefix || '-' || public.folio_num(next_num);
END;
$function$;

GRANT EXECUTE ON FUNCTION public._aj_regresar_a_bodega(public.entregas,uuid,uuid,numeric,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._aplica_stock_lote(uuid,uuid,uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public._aplicar_delta_compra_edicion(uuid,uuid,uuid,uuid,numeric,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._descarga_es_propia(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._inotif_cliente_nombre(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._mover_stock_entre_almacenes(uuid,uuid,numeric,uuid,uuid,text,uuid,uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_partner_referido(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_carga_kardex(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_audit_stock_teorico(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_stock_lote_paridad(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_vendedor_historial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_vendedor_ubicaciones() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cobro_tiene_rep_vigente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_timbre_reserve(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_timbre(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desactivar_cupones_partner_fuera_limite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_almacen_mermas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_empresa_admin_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_disponible_almacen(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_doc_mueve_stock(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_factor_neto_compra(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_log_solicitud_traspaso(uuid,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_netear_linea_promo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pedido_entregado_completo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_puede_cancelar_devolucion(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_puede_descargas(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recalc_venta_header(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recalc_venta_saldo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reevaluar_promos_venta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_logistica_pedido_resumen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_apartado_linea(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_status_pedido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_venta_inventario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_total_efectivo_cerrado(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_venta_cobrable(public.ventas) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_venta_tiene_promocion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_bonos_partner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_empresa_licencia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_folio(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_active_empresas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_empresa_admin(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sandbox_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_consumo_datos_antiguo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_venta_historial(uuid,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_configurar_facturacion(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_facturar(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_internal_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_gps_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_producto_costo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_venta_totales(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_nivel_partner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recibir_linea_compra(uuid,numeric,uuid,uuid,uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_saldos_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_saldos_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_timbre(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_missing_entrega_carga() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_timbre(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_comision_pct_linea(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_almacen_at_eod(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tiene_cobertura_vigente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_clientes_saldos(uuid,text,boolean,integer) TO authenticated;

COMMIT;
