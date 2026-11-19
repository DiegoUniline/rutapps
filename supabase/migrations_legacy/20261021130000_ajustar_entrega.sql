-- =====================================================================
-- RutApp · Fase 3a: "Ajustar entrega" ya entregada (2026-10-20, D-009…D-012).
-- Agrega ajustar_entrega y permite que esa función (solo ella) agregue el
-- producto realmente entregado a una entrega cerrada. No cambia datos.
-- Si validate_entrega_linea_insert cambió en producción, aborta sin tocar nada.
-- =====================================================================
BEGIN;

DO $guard$
DECLARE v_md5 text;
BEGIN
  IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado: esto no es rutapp'; END IF;
  SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_entrega_linea_insert';
  IF v_md5 IS DISTINCT FROM '7fcc250c19f1cfbad414b2097d457cbc' AND v_md5 IS DISTINCT FROM '460e4b865abe5cc1b30b4c7be7ca7536' THEN
    RAISE EXCEPTION 'validate_entrega_linea_insert en producción cambió (md5 %); no se aplica nada', v_md5;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.validate_entrega_linea_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_folio text;
BEGIN
  -- "Ajustar entrega" (ajustar_entrega) agrega el producto realmente entregado.
  IF current_setting('rutapp.ajuste_entrega', true) = 'on' THEN RETURN NEW; END IF;

  SELECT status::text, folio INTO v_status, v_folio
  FROM public.entregas WHERE id = NEW.entrega_id;

  IF v_status IN ('surtido', 'asignado', 'cargado', 'en_ruta', 'hecho', 'cancelado') THEN
    RAISE EXCEPTION 'No se pueden agregar líneas a la entrega %: ya está en estado "%".',
      COALESCE(v_folio, NEW.entrega_id::text), v_status;
  END IF;

  RETURN NEW;
END;
$function$;

-- Regresa a bodega piezas de una entrega como si no hubieran salido: reduce la
-- carga al camión y el surtido de la bodega (así "Reabrir" no las devuelve dos
-- veces). Lo que no tenga carga/surtido (producto agregado al ajustar) se
-- traspasa camión → bodega.
CREATE OR REPLACE FUNCTION public._aj_regresar_a_bodega(
  v_ent public.entregas, p_producto uuid, p_lote uuid, p_qty numeric, p_truck uuid, p_bodega uuid, p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rest numeric := p_qty;
  v_take numeric;
  c record;
  s record;
  v_desc_surtido boolean;
BEGIN
  FOR c IN
    SELECT id, cantidad, notas FROM public.movimientos_inventario
     WHERE referencia_id = v_ent.id AND referencia_tipo = 'entrega_cargado' AND tipo = 'entrada'
       AND producto_id = p_producto AND almacen_destino_id = p_truck AND cantidad > 0
     ORDER BY created_at DESC FOR UPDATE
  LOOP
    EXIT WHEN v_rest <= 0.000001;
    v_take := LEAST(c.cantidad, v_rest);
    v_desc_surtido := COALESCE(c.notas,'') ILIKE '%ya descontado%';
    -- Sale del camión.
    UPDATE public.stock_almacen SET cantidad = cantidad - v_take, updated_at = now()
     WHERE almacen_id = p_truck AND producto_id = p_producto;
    IF c.cantidad - v_take <= 0.000001 THEN DELETE FROM public.movimientos_inventario WHERE id = c.id;
    ELSE UPDATE public.movimientos_inventario SET cantidad = cantidad - v_take WHERE id = c.id; END IF;
    -- Lote de la carga (sombra en el camión).
    IF p_lote IS NOT NULL THEN
      UPDATE public.movimientos_inventario SET cantidad = cantidad - v_take
       WHERE id = (SELECT id FROM public.movimientos_inventario
                    WHERE referencia_id = v_ent.id AND referencia_tipo = 'entrega_cargado_lote' AND producto_id = p_producto
                      AND lote_id = p_lote AND cantidad >= v_take ORDER BY created_at DESC LIMIT 1);
      IF FOUND THEN PERFORM public._aplica_stock_lote(v_ent.empresa_id, p_truck, p_producto, p_lote, -v_take); END IF;
      DELETE FROM public.movimientos_inventario
       WHERE referencia_id = v_ent.id AND referencia_tipo = 'entrega_cargado_lote' AND producto_id = p_producto AND cantidad <= 0.000001;
    END IF;
    IF v_desc_surtido THEN
      -- La bodega se descontó al surtir: se reduce ese surtido.
      FOR s IN
        SELECT id, cantidad, lote_id, almacen_origen_id FROM public.movimientos_inventario
         WHERE referencia_id = v_ent.id AND referencia_tipo = 'entrega' AND tipo = 'salida' AND producto_id = p_producto
           AND cantidad > 0 AND (p_lote IS NULL OR lote_id IS NOT DISTINCT FROM p_lote)
         ORDER BY created_at DESC FOR UPDATE
      LOOP
        EXIT WHEN v_take <= 0.000001;
        UPDATE public.stock_almacen SET cantidad = cantidad + LEAST(s.cantidad, v_take), updated_at = now()
         WHERE almacen_id = s.almacen_origen_id AND producto_id = p_producto;
        IF s.lote_id IS NOT NULL THEN
          PERFORM public._aplica_stock_lote(v_ent.empresa_id, s.almacen_origen_id, p_producto, s.lote_id, LEAST(s.cantidad, v_take));
        END IF;
        IF s.cantidad - LEAST(s.cantidad, v_take) <= 0.000001 THEN DELETE FROM public.movimientos_inventario WHERE id = s.id;
        ELSE UPDATE public.movimientos_inventario SET cantidad = cantidad - LEAST(s.cantidad, v_take) WHERE id = s.id; END IF;
        v_rest := v_rest - LEAST(s.cantidad, v_take);
        v_take := v_take - LEAST(s.cantidad, v_take);
      END LOOP;
    ELSE
      -- La carga misma descontó la bodega (origen): regresa ahí.
      UPDATE public.stock_almacen SET cantidad = cantidad + v_take, updated_at = now()
       WHERE almacen_id = p_bodega AND producto_id = p_producto;
      IF NOT FOUND THEN
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_ent.empresa_id, p_bodega, p_producto, v_take);
      END IF;
      IF p_lote IS NOT NULL THEN PERFORM public._aplica_stock_lote(v_ent.empresa_id, p_bodega, p_producto, p_lote, v_take); END IF;
      v_rest := v_rest - v_take;
    END IF;
  END LOOP;

  IF v_rest > 0.000001 THEN
    -- Producto sin carga/surtido de esta entrega: traspaso camión → bodega.
    UPDATE public.stock_almacen SET cantidad = cantidad - v_rest, updated_at = now()
     WHERE almacen_id = p_truck AND producto_id = p_producto;
    UPDATE public.stock_almacen SET cantidad = cantidad + v_rest, updated_at = now()
     WHERE almacen_id = p_bodega AND producto_id = p_producto;
    IF NOT FOUND THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_ent.empresa_id, p_bodega, p_producto, v_rest);
    END IF;
    INSERT INTO public.movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id,
           lote_id, referencia_tipo, referencia_id, user_id, notas, fecha)
    VALUES (v_ent.empresa_id, 'transferencia', p_producto, v_rest, p_truck, p_bodega, p_lote,
           'entrega_ajuste_bodega', v_ent.id, p_uid, 'Ajuste de entrega: sobrante a bodega (folio ' || COALESCE(v_ent.folio,'—') || ')', CURRENT_DATE);
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._aj_regresar_a_bodega(public.entregas, uuid, uuid, numeric, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Ajuste de una entrega YA ENTREGADA (D-009…D-012). Recibe los renglones como
-- realmente se entregaron. Por producto mueve solo la diferencia contra lo ya
-- descontado (tipo 'entrega_hecho', igual que la entrega original, para que
-- "Reabrir" siga cuadrando). No cambia el estado: no reenvía avisos ni fecha.
--   menos entregado → regresa al camión; si p_destino = 'bodega', pasa a bodega
--   más entregado   → sale del camión
--   pedido: lo que dejó de entregarse se quita del pedido; un producto nuevo
--           entra con el precio que manda la app (lista del cliente).
CREATE OR REPLACE FUNCTION public.ajustar_entrega(
  p_entrega_id uuid,
  p_lineas     jsonb,
  p_destino    text DEFAULT 'camion',
  p_version    timestamptz DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_ent      public.entregas%ROWTYPE;
  v_ped      public.ventas%ROWTYPE;
  v_truck    uuid;
  v_bodega   uuid;
  v_line     jsonb;
  v_id       uuid;
  v_keep     uuid[];
  p          record;
  m          record;
  v_lote     record;
  v_diff     numeric;
  v_rest     numeric;
  v_take     numeric;
  v_vl       record;
  v_qty      numeric;
  v_cols     text[];
  v_keys     text;
  v_entregado_total numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  IF p_destino NOT IN ('camion','bodega') THEN
    RAISE EXCEPTION 'Destino inválido: camion o bodega' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ent FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_ent.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta entrega' USING ERRCODE = '42501';
  END IF;

  -- Permiso: logística·entregas·editar (escritorio) o ruta·editar_entrega (móvil, permitido salvo
  -- negación explícita). Dueño siempre; sin rol = acceso total (misma regla que la app).
  IF NOT public.is_super_admin(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = v_ent.empresa_id AND e.owner_user_id = v_uid)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.role_permisos rp ON rp.role_id = ur.role_id
                     WHERE ur.user_id = v_uid AND rp.modulo = 'logistica.entregas' AND rp.accion = 'editar' AND rp.permitido)
     AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.role_permisos rp ON rp.role_id = ur.role_id
                 WHERE ur.user_id = v_uid AND rp.modulo = 'ruta.editar_entrega' AND rp.accion = 'ver' AND NOT rp.permitido)
  THEN
    RAISE EXCEPTION 'No tienes permiso para ajustar entregas' USING ERRCODE = '42501';
  END IF;

  IF v_ent.status::text <> 'hecho' THEN
    RAISE EXCEPTION 'Solo se ajusta una entrega ya entregada (estado actual: %).', v_ent.status::text USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NOT NULL AND v_ent.updated_at IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'La entrega cambió en otro dispositivo. Vuelve a abrirla.' USING ERRCODE = '40001';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RAISE EXCEPTION 'Renglones inválidos.' USING ERRCODE = '22023';
  END IF;

  IF v_ent.pedido_id IS NOT NULL THEN
    SELECT * INTO v_ped FROM public.ventas WHERE id = v_ent.pedido_id FOR UPDATE;
    IF v_ped.status::text IN ('cancelado','facturado') OR v_ped.cerrado_at IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.venta_lineas WHERE venta_id = v_ped.id AND (COALESCE(facturado,false) OR factura_cfdi_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'El pedido está facturado, cancelado o cerrado: corrígelo con nota de crédito o reábrelo.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Almacén de donde salió al cliente (camión), igual que apply_entrega_hecho_inventory.
  SELECT almacen_id INTO v_truck FROM public.profiles WHERE id = COALESCE(v_ent.vendedor_ruta_id, v_ent.vendedor_id);
  v_truck := COALESCE(v_truck, v_ent.almacen_id);
  IF v_truck IS NULL THEN RAISE EXCEPTION 'La entrega no tiene almacén de ruta.' USING ERRCODE = 'P0001'; END IF;
  v_bodega := COALESCE(
    (SELECT el.almacen_origen_id FROM public.entrega_lineas el WHERE el.entrega_id = p_entrega_id AND el.almacen_origen_id IS NOT NULL LIMIT 1),
    v_ent.almacen_id);
  IF p_destino = 'bodega' AND (v_bodega IS NULL OR v_bodega = v_truck) THEN
    RAISE EXCEPTION 'No se identificó la bodega de origen de esta entrega.' USING ERRCODE = 'P0001';
  END IF;

  -- Entregado ANTES del ajuste, por producto.
  CREATE TEMP TABLE IF NOT EXISTS _aj_antes (producto_id uuid, cant numeric) ON COMMIT DROP;
  DELETE FROM _aj_antes WHERE true;
  INSERT INTO _aj_antes SELECT producto_id, SUM(COALESCE(cantidad_entregada,0))
    FROM public.entrega_lineas WHERE entrega_id = p_entrega_id AND hecho GROUP BY producto_id;

  -- 1) Renglones de la entrega como quedaron.
  SELECT COALESCE(array_agg(NULLIF(x->>'id','')::uuid), '{}') INTO v_keep
  FROM jsonb_array_elements(p_lineas) x WHERE NULLIF(x->>'id','') IS NOT NULL;
  UPDATE public.entrega_lineas SET cantidad_entregada = 0
   WHERE entrega_id = p_entrega_id AND NOT (id = ANY(v_keep)) AND COALESCE(cantidad_entregada,0) <> 0;

  PERFORM set_config('rutapp.ajuste_entrega', 'on', true);
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_id := NULLIF(v_line->>'id','')::uuid;
    v_qty := COALESCE((v_line->>'cantidad_entregada')::numeric, 0);
    IF v_qty < 0 THEN RAISE EXCEPTION 'Cantidad negativa.' USING ERRCODE = '22023'; END IF;
    IF v_id IS NOT NULL THEN
      UPDATE public.entrega_lineas
         SET cantidad_entregada = v_qty,
             producto_id = COALESCE(NULLIF(v_line->>'producto_id','')::uuid, producto_id),
             unidad_id = COALESCE(NULLIF(v_line->>'unidad_id','')::uuid, unidad_id),
             hecho = true
       WHERE id = v_id AND entrega_id = p_entrega_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Un renglón no pertenece a esta entrega.' USING ERRCODE = '22023'; END IF;
    ELSE
      IF NULLIF(v_line->>'producto_id','') IS NULL THEN RAISE EXCEPTION 'Renglón sin producto.' USING ERRCODE = '22023'; END IF;
      INSERT INTO public.entrega_lineas (entrega_id, producto_id, unidad_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id)
      VALUES (p_entrega_id, (v_line->>'producto_id')::uuid, NULLIF(v_line->>'unidad_id','')::uuid, 0, v_qty, true, v_bodega);
    END IF;
  END LOOP;
  PERFORM set_config('rutapp.ajuste_entrega', 'off', true);

  -- 2) Stock: diferencia por producto contra lo ya descontado del camión.
  FOR p IN
    SELECT COALESCE(n.producto_id, a.producto_id) AS producto_id,
           COALESCE(n.cant, 0) AS nuevo, COALESCE(a.cant, 0) AS antes
    FROM (SELECT producto_id, SUM(COALESCE(cantidad_entregada,0)) AS cant
            FROM public.entrega_lineas WHERE entrega_id = p_entrega_id AND hecho GROUP BY producto_id) n
    FULL JOIN _aj_antes a ON a.producto_id = n.producto_id
  LOOP
    v_diff := ROUND(p.nuevo - p.antes, 6);
    CONTINUE WHEN abs(v_diff) < 0.000001;

    IF v_diff > 0 THEN
      -- Sale más del camión (FEFO si maneja lote).
      UPDATE public.stock_almacen SET cantidad = cantidad - v_diff, updated_at = now()
       WHERE almacen_id = v_truck AND producto_id = p.producto_id;
      IF NOT FOUND THEN
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (v_ent.empresa_id, v_truck, p.producto_id, -v_diff);
      END IF;
      v_rest := v_diff;
      IF EXISTS (SELECT 1 FROM public.productos WHERE id = p.producto_id AND COALESCE(maneja_lote,false)) THEN
        FOR v_lote IN
          SELECT sl.lote_id, sl.cantidad AS existencia FROM public.stock_lotes sl JOIN public.lotes l ON l.id = sl.lote_id
           WHERE sl.almacen_id = v_truck AND sl.producto_id = p.producto_id AND sl.cantidad > 0
           ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC FOR UPDATE OF sl
        LOOP
          EXIT WHEN v_rest <= 0.000001;
          v_take := LEAST(v_lote.existencia, v_rest);
          INSERT INTO public.movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, vendedor_destino_id,
                 lote_id, referencia_tipo, referencia_id, user_id, notas, fecha)
          VALUES (v_ent.empresa_id, 'salida', p.producto_id, v_take, v_truck, COALESCE(v_ent.vendedor_ruta_id, v_ent.vendedor_id),
                 v_lote.lote_id, 'entrega_hecho', p_entrega_id, v_uid, 'Ajuste de entrega (folio ' || COALESCE(v_ent.folio,'—') || ')', CURRENT_DATE);
          v_rest := v_rest - v_take;
        END LOOP;
      END IF;
      IF v_rest > 0.000001 THEN
        INSERT INTO public.movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, vendedor_destino_id,
               referencia_tipo, referencia_id, user_id, notas, fecha)
        VALUES (v_ent.empresa_id, 'salida', p.producto_id, v_rest, v_truck, COALESCE(v_ent.vendedor_ruta_id, v_ent.vendedor_id),
               'entrega_hecho', p_entrega_id, v_uid, 'Ajuste de entrega (folio ' || COALESCE(v_ent.folio,'—') || ')', CURRENT_DATE);
      END IF;
    ELSE
      -- Regresa al camión: se reducen las salidas 'entrega_hecho' más recientes.
      v_rest := -v_diff;
      FOR m IN
        SELECT id, cantidad, lote_id FROM public.movimientos_inventario
         WHERE referencia_id = p_entrega_id AND referencia_tipo = 'entrega_hecho' AND tipo = 'salida'
           AND producto_id = p.producto_id AND almacen_origen_id = v_truck AND cantidad > 0
         ORDER BY created_at DESC FOR UPDATE
      LOOP
        EXIT WHEN v_rest <= 0.000001;
        v_take := LEAST(m.cantidad, v_rest);
        UPDATE public.stock_almacen SET cantidad = cantidad + v_take, updated_at = now()
         WHERE almacen_id = v_truck AND producto_id = p.producto_id;
        IF m.lote_id IS NOT NULL THEN
          PERFORM public._aplica_stock_lote(v_ent.empresa_id, v_truck, p.producto_id, m.lote_id, v_take);
        END IF;
        IF m.cantidad - v_take <= 0.000001 THEN
          DELETE FROM public.movimientos_inventario WHERE id = m.id;
        ELSE
          UPDATE public.movimientos_inventario SET cantidad = cantidad - v_take WHERE id = m.id;
        END IF;
        -- Si se eligió bodega, esas piezas "no salieron": se reduce lo cargado y surtido.
        IF p_destino = 'bodega' THEN
          PERFORM public._aj_regresar_a_bodega(v_ent, p.producto_id, m.lote_id, v_take, v_truck, v_bodega, v_uid);
        END IF;
        v_rest := v_rest - v_take;
      END LOOP;
      IF v_rest > 0.000001 THEN
        RAISE EXCEPTION 'No se encontró lo descontado de la entrega para regresar (faltan %).', v_rest USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- 3) Pedido: menos entregado se quita; más entregado o producto nuevo se agrega.
    IF v_ent.pedido_id IS NOT NULL THEN
      SELECT * INTO v_vl FROM public.venta_lineas WHERE venta_id = v_ent.pedido_id AND producto_id = p.producto_id
        ORDER BY created_at LIMIT 1 FOR UPDATE;
      IF v_diff < 0 AND v_vl.id IS NOT NULL THEN
        v_qty := GREATEST(0, COALESCE(v_vl.cantidad,0) + v_diff);
        IF v_qty <= 0.000001 THEN
          IF EXISTS (SELECT 1 FROM public.venta_comisiones c WHERE c.venta_linea_id = v_vl.id AND (c.pagada OR c.pago_comision_id IS NOT NULL)) THEN
            RAISE EXCEPTION 'No se puede quitar del pedido un producto cuya comisión ya se pagó.' USING ERRCODE = 'P0001';
          END IF;
          DELETE FROM public.venta_linea_lotes WHERE venta_linea_id = v_vl.id;
          DELETE FROM public.promocion_aplicada WHERE venta_linea_id = v_vl.id;
          DELETE FROM public.venta_lineas WHERE id = v_vl.id;
        ELSE
          UPDATE public.venta_lineas SET
            cantidad = v_qty,
            subtotal = ROUND(COALESCE(subtotal,0) * v_qty / cantidad, 2),
            iva_monto = ROUND(COALESCE(iva_monto,0) * v_qty / cantidad, 2),
            ieps_monto = ROUND(COALESCE(ieps_monto,0) * v_qty / cantidad, 2),
            total = ROUND(COALESCE(total,0) * v_qty / cantidad, 2)
          WHERE id = v_vl.id;
        END IF;
      ELSIF v_diff > 0 THEN
        SELECT COALESCE(SUM(el.cantidad_entregada),0) INTO v_entregado_total
          FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
         WHERE e.pedido_id = v_ent.pedido_id AND e.status::text NOT IN ('cancelado','no_entregado')
           AND el.producto_id = p.producto_id;
        IF v_vl.id IS NOT NULL THEN
          IF v_entregado_total > COALESCE(v_vl.cantidad,0) + 0.000001 AND COALESCE(v_vl.cantidad,0) > 0 THEN
            UPDATE public.venta_lineas SET
              subtotal = ROUND(COALESCE(subtotal,0) * v_entregado_total / cantidad, 2),
              iva_monto = ROUND(COALESCE(iva_monto,0) * v_entregado_total / cantidad, 2),
              ieps_monto = ROUND(COALESCE(ieps_monto,0) * v_entregado_total / cantidad, 2),
              total = ROUND(COALESCE(total,0) * v_entregado_total / cantidad, 2),
              cantidad = v_entregado_total
            WHERE id = v_vl.id;
          END IF;
        ELSE
          -- Producto que no estaba en el pedido: entra con el precio que manda la app.
          SELECT x INTO v_line FROM jsonb_array_elements(p_lineas) x
           WHERE (x->>'producto_id')::uuid = p.producto_id AND x ? 'venta_linea' LIMIT 1;
          IF v_line IS NULL THEN
            RAISE EXCEPTION 'Falta el precio del producto nuevo para agregarlo al pedido.' USING ERRCODE = '22023';
          END IF;
          SELECT array_agg(column_name::text) INTO v_cols FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'venta_lineas'
             AND column_name NOT IN ('id','venta_id','empresa_id','created_at','updated_at','facturado','factura_cfdi_id',
                                     'comision_pct','comision_monto','producto_id','cantidad');
          SELECT string_agg(quote_ident(k), ', ') INTO v_keys
            FROM jsonb_object_keys(v_line->'venta_linea') k WHERE k = ANY(v_cols);
          EXECUTE format('INSERT INTO public.venta_lineas (venta_id, producto_id, cantidad%1$s) SELECT $2, $3, $4%2$s FROM jsonb_populate_record(NULL::public.venta_lineas, $1)',
                         CASE WHEN v_keys IS NULL THEN '' ELSE ', ' || v_keys END,
                         CASE WHEN v_keys IS NULL THEN '' ELSE ', ' || v_keys END)
            USING v_line->'venta_linea', v_ent.pedido_id, p.producto_id, v_entregado_total;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Totales y saldo del pedido (reglas existentes) dentro de esta operación.
  SET CONSTRAINTS ALL IMMEDIATE;
  IF v_ent.pedido_id IS NOT NULL THEN
    PERFORM public.fn_recalc_venta_header(v_ent.pedido_id);
  END IF;

  SELECT * INTO v_ent FROM public.entregas WHERE id = p_entrega_id;
  RETURN jsonb_build_object('ok', true, 'updated_at', v_ent.updated_at,
    'pedido_total', (SELECT total FROM public.ventas WHERE id = v_ent.pedido_id),
    'pedido_saldo', (SELECT saldo_pendiente FROM public.ventas WHERE id = v_ent.pedido_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.ajustar_entrega(uuid, jsonb, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_entrega(uuid, jsonb, text, timestamptz) TO authenticated, service_role;

COMMIT;
