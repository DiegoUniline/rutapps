-- D-063 · Editar venta: fecha de entrega y almacén editables (2026-11-23, orden aprobada por el dueño).
-- Parte de la definición VIGENTE EN PRODUCCIÓN de public.editar_venta (leída con pg_get_functiondef el
-- 2026-11-23: md5(prosrc) = 5fb01bb8912e797d774dca462d2162bc, idéntica a 20261119220000_editar_venta_encabezado.sql).
-- Misma firma, SECURITY DEFINER, search_path, permisos (ventas·editar; «solo precio» con cambiar_precio)
-- y autorización por empresa. Cambios:
--   1. p_header acepta `fecha_entrega` (vacía o igual = se ignora; no se borra). Solo cambia ventas.fecha_entrega:
--      cada entrega tiene su propia fecha (entregas.fecha) y no se mueve. Historial «fecha_entrega_cambiada».
--   2. p_header acepta `almacen_id` (vacío o igual = se ignora). Reglas: sin entregas activas, almacén de la
--      misma empresa y activo, lotes elegidos a mano con existencia en el nuevo almacén. Cambiar el almacén
--      no cuenta como «solo precio» (requiere ventas·editar).
--      Inventario: fn_sync_venta_inventario compara lo deseado contra lo aplicado por producto/lote SIN
--      almacén, así que cambiar ventas.almacen_id por sí solo NO movía stock (comprobado en Postgres local).
--      Aquí lo ya aplicado regresa a su almacén (entrada `reverso_borrador`, nota «Cambio de almacén venta …»;
--      stock_almacen aquí y stock_lotes por el trigger del movimiento) y al guardar el almacén nuevo el trigger
--      DEFERRED ejecuta fn_sync_venta_inventario, que lo saca del nuevo (lotes elegidos o FEFO). Repetir con el
--      mismo almacén no hace nada. Pedidos con entregas y saldo inicial no tocan inventario (igual que
--      fn_sync_venta_inventario). Renglones y reparto por lote pasan al almacén nuevo (el apartado de pedidos
--      los sigue). Historial «almacen_cambiado» con lo regresado.
-- Revertir: volver a aplicar el CREATE OR REPLACE de supabase/migrations/20261119220000_editar_venta_encabezado.sql
-- (los cambios de almacén ya hechos quedan con sus movimientos en el kardex; no se deshacen solos).
-- Verificación: docs/sql/2026-11-23_verificar_d063.sql (termina en RAISE EXCEPTION; no deja datos).
CREATE OR REPLACE FUNCTION public.editar_venta(p_venta_id uuid, p_lineas jsonb, p_version timestamp with time zone DEFAULT NULL::timestamp with time zone, p_header jsonb DEFAULT NULL::jsonb, p_promos jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_uid     uuid := auth.uid();
  v_venta   public.ventas%ROWTYPE;
  v_cols    text[];
  v_pcols   text[];
  v_hcols   text[] := ARRAY['notas','descuento_extra','descuento_extra_tipo','fecha','condicion_pago','cliente_id','vendedor_id',
                            'fecha_entrega','almacen_id'];
  v_keep    uuid[];
  v_line    jsonb;
  v_id      uuid;
  v_keys    text;
  v_old     record;
  v_pagado  numeric;
  v_conlote uuid[] := '{}';
  v_solo_precio boolean;
  v_entregas_activas boolean;
  -- D-063: cambio de almacén y de fecha de entrega.
  v_alm_nuevo   uuid;
  v_alm_viejo   uuid;
  v_cambia_alm  boolean := false;
  v_alm         record;
  v_mov         record;
  v_regresado   jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_venta.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta venta' USING ERRCODE = '42501';
  END IF;

  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'La venta debe tener al menos un producto.' USING ERRCODE = '22023';
  END IF;

  -- D-063: almacén y fecha de entrega llegan en p_header. Vacíos o sin cambio se ignoran
  -- (nunca se borra el almacén ni la fecha, ni se dispara la sincronización de inventario de más).
  IF p_header ? 'almacen_id' THEN
    v_alm_nuevo := NULLIF(p_header->>'almacen_id','')::uuid;
    IF v_alm_nuevo IS NULL OR v_alm_nuevo IS NOT DISTINCT FROM v_venta.almacen_id THEN
      p_header := p_header - 'almacen_id';
    ELSE
      v_cambia_alm := true;
    END IF;
  END IF;
  IF p_header ? 'fecha_entrega' THEN
    IF NULLIF(p_header->>'fecha_entrega','') IS NULL
       OR (p_header->>'fecha_entrega')::date IS NOT DISTINCT FROM v_venta.fecha_entrega THEN
      p_header := p_header - 'fecha_entrega';
    END IF;
  END IF;

  -- Solo precio/descuento: mismos renglones, sin cambiar producto, unidad ni cantidad (no mueve inventario).
  v_solo_precio :=
    NOT EXISTS (SELECT 1 FROM public.venta_lineas vl WHERE vl.venta_id = p_venta_id
                  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x WHERE NULLIF(x->>'id','')::uuid = vl.id))
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x
                    WHERE NULLIF(x->>'id','') IS NULL
                       OR NOT EXISTS (SELECT 1 FROM public.venta_lineas vl WHERE vl.id = NULLIF(x->>'id','')::uuid AND vl.venta_id = p_venta_id))
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x
                    JOIN public.venta_lineas vl ON vl.id = NULLIF(x->>'id','')::uuid
                    WHERE (x ? 'cantidad' AND (x->>'cantidad')::numeric IS DISTINCT FROM vl.cantidad)
                       OR (x ? 'producto_id' AND NULLIF(x->>'producto_id','')::uuid IS DISTINCT FROM vl.producto_id)
                       OR (x ? 'unidad_id' AND NULLIF(x->>'unidad_id','')::uuid IS DISTINCT FROM vl.unidad_id)
                       OR (x ? 'lotes'));
  -- D-063: cambiar el almacén mueve inventario: no cuenta como «solo precio».
  v_solo_precio := v_solo_precio AND NOT v_cambia_alm;
  v_entregas_activas := v_venta.tipo::text = 'pedido'
    AND EXISTS (SELECT 1 FROM public.entregas WHERE pedido_id = p_venta_id AND status::text <> 'cancelado');

  IF NOT public.is_super_admin(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = v_venta.empresa_id AND e.owner_user_id = v_uid)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permisos rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = v_uid AND rp.modulo = 'ventas' AND rp.accion = 'editar' AND rp.permitido)
     AND NOT (v_solo_precio AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permisos rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = v_uid AND rp.modulo = 'ventas' AND rp.accion = 'cambiar_precio' AND rp.permitido))
  THEN
    RAISE EXCEPTION 'No tienes permiso para editar ventas' USING ERRCODE = '42501';
  END IF;

  IF v_venta.status::text IN ('cancelado','facturado') THEN
    RAISE EXCEPTION 'No se puede editar una venta %.',
      CASE v_venta.status::text WHEN 'cancelado' THEN 'cancelada' ELSE 'facturada' END USING ERRCODE = 'P0001';
  END IF;
  IF v_venta.cerrado_at IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede editar un pedido cerrado como parcial.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.venta_lineas
             WHERE venta_id = p_venta_id AND (COALESCE(facturado,false) OR factura_cfdi_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'La venta tiene productos facturados: corrígela con nota de crédito.' USING ERRCODE = 'P0001';
  END IF;
  -- D-063: el almacén solo se cambia sin entregas activas, a uno activo de la misma empresa.
  IF v_cambia_alm THEN
    IF v_entregas_activas THEN
      RAISE EXCEPTION 'El pedido ya tiene entregas: el almacén no se puede cambiar aquí (cada entrega sale de su propio almacén).' USING ERRCODE = 'P0001';
    END IF;
    SELECT id, nombre, activo, empresa_id INTO v_alm FROM public.almacenes WHERE id = v_alm_nuevo;
    IF NOT FOUND OR v_alm.empresa_id IS DISTINCT FROM v_venta.empresa_id THEN
      RAISE EXCEPTION 'El almacén no pertenece a esta empresa.' USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(v_alm.activo, false) THEN
      RAISE EXCEPTION 'El almacén «%» está inactivo.', v_alm.nombre USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- D-019/F2a: con entregas activas solo se cambia precio/descuento; cantidades y productos con "Ajustar entrega".
  -- Las entregas canceladas ya no bloquean (auditoría H3).
  IF v_entregas_activas AND NOT v_solo_precio THEN
    RAISE EXCEPTION 'El pedido ya tiene entregas: aquí solo se corrige precio o descuento; productos y cantidades se corrigen con "Ajustar entrega".' USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NOT NULL AND v_venta.updated_at IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'La venta cambió en otro dispositivo. Vuelve a abrirla para editarla.' USING ERRCODE = '40001';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'La venta debe tener al menos un producto.' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(column_name::text) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venta_lineas'
    AND column_name NOT IN ('id','venta_id','empresa_id','created_at','updated_at',
                            'facturado','factura_cfdi_id','comision_pct','comision_monto');

  SELECT COALESCE(array_agg(NULLIF(x->>'id','')::uuid), '{}') INTO v_keep
  FROM jsonb_array_elements(p_lineas) x WHERE NULLIF(x->>'id','') IS NOT NULL;

  FOR v_old IN SELECT id FROM public.venta_lineas WHERE venta_id = p_venta_id AND NOT (id = ANY(v_keep)) LOOP
    IF EXISTS (SELECT 1 FROM public.venta_comisiones c
               WHERE c.venta_linea_id = v_old.id AND (c.pagada OR c.pago_comision_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'No se puede quitar un producto cuya comisión ya se pagó.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.venta_linea_lotes WHERE venta_linea_id = v_old.id;
    DELETE FROM public.promocion_aplicada WHERE venta_linea_id = v_old.id;
    DELETE FROM public.venta_lineas WHERE id = v_old.id;
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_id := NULLIF(v_line->>'id','')::uuid;
    SELECT string_agg(quote_ident(k), ', ') INTO v_keys
    FROM jsonb_object_keys(v_line) k WHERE k = ANY(v_cols);

    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.venta_lineas WHERE id = v_id) THEN
      IF NOT EXISTS (SELECT 1 FROM public.venta_lineas WHERE id = v_id AND venta_id = p_venta_id) THEN
        RAISE EXCEPTION 'Un renglón no pertenece a esta venta.' USING ERRCODE = '22023';
      END IF;
      IF v_keys IS NOT NULL THEN
        EXECUTE format('UPDATE public.venta_lineas t SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.venta_lineas, $1)) WHERE t.id = $2', v_keys)
          USING v_line, v_id;
      END IF;
    ELSE
      IF v_keys IS NULL OR NOT (v_line ? 'producto_id') THEN
        RAISE EXCEPTION 'Renglón nuevo sin producto.' USING ERRCODE = '22023';
      END IF;
      v_id := COALESCE(v_id, gen_random_uuid());
      EXECUTE format('INSERT INTO public.venta_lineas (id, venta_id, %1$s) SELECT $2, $3, %1$s FROM jsonb_populate_record(NULL::public.venta_lineas, $1)', v_keys)
        USING v_line, v_id, p_venta_id;
    END IF;

    IF v_line ? 'lotes' THEN
      v_conlote := v_conlote || v_id;
      DELETE FROM public.venta_linea_lotes WHERE venta_linea_id = v_id;
      INSERT INTO public.venta_linea_lotes (empresa_id, venta_id, venta_linea_id, producto_id, lote_id, almacen_id, cantidad, user_id)
      SELECT v_venta.empresa_id, p_venta_id, v_id, vl.producto_id, (lt->>'lote_id')::uuid,
             COALESCE(vl.almacen_id, v_venta.almacen_id), (lt->>'cantidad')::numeric, v_uid
      FROM jsonb_array_elements(COALESCE(v_line->'lotes','[]'::jsonb)) lt
      JOIN public.venta_lineas vl ON vl.id = v_id
      WHERE NULLIF(lt->>'lote_id','') IS NOT NULL AND COALESCE((lt->>'cantidad')::numeric, 0) > 0;
    END IF;
  END LOOP;

  FOR v_old IN
    SELECT vl.id, vl.cantidad, SUM(d.cantidad) AS repartido
    FROM public.venta_lineas vl JOIN public.venta_linea_lotes d ON d.venta_linea_id = vl.id
    WHERE vl.venta_id = p_venta_id
    GROUP BY vl.id, vl.cantidad
    HAVING abs(COALESCE(vl.cantidad,0) - SUM(d.cantidad)) > 0.000001
  LOOP
    IF v_old.id = ANY(v_conlote) THEN
      RAISE EXCEPTION 'El reparto por lotes (%) no cuadra con la cantidad del producto (%).', v_old.repartido, v_old.cantidad USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.venta_linea_lotes WHERE venta_linea_id = v_old.id;
  END LOOP;

  -- D-063: cambio de almacén. fn_sync_venta_inventario compara lo deseado contra lo aplicado por
  -- producto/lote SIN almacén: cambiar almacen_id por sí solo no movía stock. Aquí lo ya aplicado
  -- regresa a su almacén (entrada) y, al guardar el almacén nuevo, el trigger DEFERRED de
  -- ventas.almacen_id ejecuta fn_sync_venta_inventario, que lo saca del nuevo.
  IF v_cambia_alm THEN
    -- Lotes elegidos a mano (reparto por lote o lote de la línea): deben tener existencia en el nuevo almacén.
    SELECT lo.codigo, pr.nombre AS producto INTO v_mov
      FROM (SELECT d.lote_id, vl.producto_id
              FROM public.venta_linea_lotes d JOIN public.venta_lineas vl ON vl.id = d.venta_linea_id
             WHERE vl.venta_id = p_venta_id
            UNION
            SELECT vl.lote_id, vl.producto_id
              FROM public.venta_lineas vl
             WHERE vl.venta_id = p_venta_id AND vl.lote_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.venta_linea_lotes d WHERE d.venta_linea_id = vl.id)) x
      JOIN public.lotes lo ON lo.id = x.lote_id
      LEFT JOIN public.productos pr ON pr.id = x.producto_id
     WHERE NOT EXISTS (SELECT 1 FROM public.stock_lotes sl
                        WHERE sl.almacen_id = v_alm_nuevo AND sl.lote_id = x.lote_id AND sl.cantidad > 0)
     ORDER BY pr.nombre, lo.codigo
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'El lote % de «%» no tiene existencia en el almacén «%»: cambia o quita el lote antes de cambiar el almacén.',
        v_mov.codigo, COALESCE(v_mov.producto, 'producto'), v_alm.nombre USING ERRCODE = 'P0001';
    END IF;

    -- Mismo criterio que fn_sync_venta_inventario: no aplica a saldo inicial ni a pedidos con entregas.
    v_alm_viejo := COALESCE(v_venta.almacen_id,
                            (SELECT almacen_id FROM public.profiles WHERE id = v_venta.vendedor_id LIMIT 1));
    IF v_venta.tipo::text <> 'saldo_inicial' AND NOT COALESCE(v_venta.es_saldo_inicial, false)
       AND NOT (v_venta.tipo::text = 'pedido' AND EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = p_venta_id)) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_venta_id::text, 0));
      FOR v_mov IN
        SELECT z.producto_id, z.lote_id, z.almacen_id, z.neto FROM (
          SELECT mi.producto_id, mi.lote_id,
                 COALESCE(CASE WHEN mi.tipo::text = 'salida' THEN mi.almacen_origen_id ELSE mi.almacen_destino_id END,
                          v_alm_viejo) AS almacen_id,
                 ROUND(SUM(CASE WHEN mi.tipo::text = 'salida' THEN COALESCE(mi.cantidad,0) ELSE -COALESCE(mi.cantidad,0) END), 6) AS neto
            FROM public.movimientos_inventario mi
           WHERE mi.referencia_id = p_venta_id
             AND mi.referencia_tipo IN ('venta','venta_lote','cancelacion_venta','reverso_borrador',
                                        'cancelacion_venta_lote','reverso_borrador_lote')
           GROUP BY 1,2,3) z
         WHERE ABS(z.neto) > 0.000001
         ORDER BY z.producto_id, z.lote_id NULLS LAST
      LOOP
        IF v_mov.almacen_id IS NULL THEN
          RAISE EXCEPTION 'La venta tiene inventario aplicado sin almacén: no se puede cambiar el almacén.' USING ERRCODE = 'P0001';
        END IF;
        CONTINUE WHEN v_mov.almacen_id = v_alm_nuevo;  -- ya está en el nuevo: lo concilia fn_sync_venta_inventario
        IF v_mov.neto > 0 THEN
          INSERT INTO public.movimientos_inventario
            (empresa_id,tipo,producto_id,cantidad,almacen_destino_id,lote_id,referencia_tipo,referencia_id,user_id,fecha,notas)
          VALUES (v_venta.empresa_id,'entrada',v_mov.producto_id,v_mov.neto,v_mov.almacen_id,v_mov.lote_id,'reverso_borrador',p_venta_id,v_uid,
                  COALESCE(v_venta.fecha,CURRENT_DATE),
                  'Cambio de almacén venta '||COALESCE(v_venta.folio,'')||CASE WHEN v_mov.lote_id IS NOT NULL THEN ' · lote' ELSE '' END);
        ELSE
          INSERT INTO public.movimientos_inventario
            (empresa_id,tipo,producto_id,cantidad,almacen_origen_id,lote_id,referencia_tipo,referencia_id,user_id,fecha,notas)
          VALUES (v_venta.empresa_id,'salida',v_mov.producto_id,-v_mov.neto,v_mov.almacen_id,v_mov.lote_id,'venta',p_venta_id,v_uid,
                  COALESCE(v_venta.fecha,CURRENT_DATE),
                  'Cambio de almacén venta '||COALESCE(v_venta.folio,'')||CASE WHEN v_mov.lote_id IS NOT NULL THEN ' · lote' ELSE '' END);
        END IF;
        -- stock_lotes lo ajusta el trigger trg_sync_stock_lote del movimiento; stock_almacen, aquí.
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (v_venta.empresa_id, v_mov.almacen_id, v_mov.producto_id, v_mov.neto)
        ON CONFLICT (almacen_id, producto_id)
        DO UPDATE SET cantidad = public.stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();
        v_regresado := v_regresado || jsonb_build_object('producto_id', v_mov.producto_id, 'lote_id', v_mov.lote_id,
                                                         'almacen_id', v_mov.almacen_id, 'cantidad', v_mov.neto);
      END LOOP;
    END IF;

    -- Renglones y reparto por lote siguen al almacén de la venta (el apartado de pedidos se mueve con ellos).
    UPDATE public.venta_lineas SET almacen_id = v_alm_nuevo
     WHERE venta_id = p_venta_id AND (almacen_id IS NULL OR almacen_id = v_venta.almacen_id);
    UPDATE public.venta_linea_lotes d SET almacen_id = v_alm_nuevo
      FROM public.venta_lineas vl
     WHERE vl.id = d.venta_linea_id AND vl.venta_id = p_venta_id AND d.almacen_id IS DISTINCT FROM v_alm_nuevo;

    PERFORM public.log_venta_historial(p_venta_id, v_venta.empresa_id, 'almacen_cambiado',
      jsonb_build_object('almacen', jsonb_build_object('anterior', v_venta.almacen_id, 'nuevo', v_alm_nuevo),
                         'regresado', v_regresado));
  END IF;
  IF p_header ? 'fecha_entrega' THEN
    PERFORM public.log_venta_historial(p_venta_id, v_venta.empresa_id, 'fecha_entrega_cambiada',
      jsonb_build_object('fecha_entrega', jsonb_build_object('anterior', v_venta.fecha_entrega,
                                                             'nuevo', (p_header->>'fecha_entrega')::date)));
  END IF;

  -- D-028: cambio de cliente/vendedor/fecha desde Editar venta.
  IF NULLIF(p_header->>'cliente_id','') IS NOT NULL AND (p_header->>'cliente_id')::uuid IS DISTINCT FROM v_venta.cliente_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = (p_header->>'cliente_id')::uuid AND empresa_id = v_venta.empresa_id) THEN
      RAISE EXCEPTION 'El cliente no pertenece a esta empresa.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.cobro_aplicaciones ca
               JOIN public.cobro_aplicaciones otra ON otra.cobro_id = ca.cobro_id AND otra.venta_id <> p_venta_id
               JOIN public.cobros c ON c.id = ca.cobro_id AND COALESCE(c.status,'activo') <> 'cancelado'
               WHERE ca.venta_id = p_venta_id) THEN
      RAISE EXCEPTION 'Un pago de esta venta también cubre otras ventas del cliente: sepáralo antes de cambiar el cliente.' USING ERRCODE = 'P0001';
    END IF;
    -- Los pagos de esta venta se van con ella al nuevo cliente.
    UPDATE public.cobros SET cliente_id = (p_header->>'cliente_id')::uuid
     WHERE id IN (SELECT cobro_id FROM public.cobro_aplicaciones WHERE venta_id = p_venta_id);
  END IF;
  IF NULLIF(p_header->>'vendedor_id','') IS NOT NULL AND (p_header->>'vendedor_id')::uuid IS DISTINCT FROM v_venta.vendedor_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (p_header->>'vendedor_id')::uuid AND empresa_id = v_venta.empresa_id) THEN
      RAISE EXCEPTION 'El vendedor no pertenece a esta empresa.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.venta_comisiones WHERE venta_id = p_venta_id AND (pagada OR pago_comision_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'No se puede cambiar el vendedor: la comisión de esta venta ya se pagó.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.venta_comisiones SET vendedor_id = (p_header->>'vendedor_id')::uuid
     WHERE venta_id = p_venta_id AND NOT COALESCE(pagada,false) AND pago_comision_id IS NULL;
  END IF;
  IF NULLIF(p_header->>'fecha','') IS NOT NULL AND (p_header->>'fecha')::date IS DISTINCT FROM v_venta.fecha THEN
    UPDATE public.venta_comisiones SET fecha_venta = (p_header->>'fecha')::date
     WHERE venta_id = p_venta_id AND NOT COALESCE(pagada,false) AND pago_comision_id IS NULL;
  END IF;

  SELECT string_agg(quote_ident(k), ', ') INTO v_keys
  FROM jsonb_object_keys(COALESCE(p_header,'{}'::jsonb)) k WHERE k = ANY(v_hcols);
  IF v_keys IS NOT NULL THEN
    EXECUTE format('UPDATE public.ventas t SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.ventas, $1)) WHERE t.id = $2', v_keys)
      USING p_header, p_venta_id;
  END IF;

  IF p_promos IS NOT NULL THEN
    SELECT array_agg(column_name::text) INTO v_pcols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promocion_aplicada'
      AND column_name NOT IN ('id','venta_id','created_at');
    DELETE FROM public.promocion_aplicada WHERE venta_id = p_venta_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_promos) LOOP
      SELECT string_agg(quote_ident(k), ', ') INTO v_keys
      FROM jsonb_object_keys(v_line) k WHERE k = ANY(v_pcols);
      IF v_keys IS NOT NULL THEN
        EXECUTE format('INSERT INTO public.promocion_aplicada (venta_id, %1$s) SELECT $2, %1$s FROM jsonb_populate_record(NULL::public.promocion_aplicada, $1)', v_keys)
          USING v_line, p_venta_id;
      END IF;
    END LOOP;
  END IF;

  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';
  -- F1a/D-025: si el total quedó abajo de lo pagado, el excedente va a saldo a favor, reembolso o se deja (p_header.excedente).
  PERFORM public._resolver_excedente_venta(p_venta_id, NULLIF(p_header->>'excedente',''), v_uid);
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;

  RETURN jsonb_build_object(
    'ok', true,
    'total', v_venta.total,
    'saldo_pendiente', v_venta.saldo_pendiente,
    'updated_at', v_venta.updated_at
  );
END;
$_$;

REVOKE ALL ON FUNCTION public.editar_venta(uuid, jsonb, timestamp with time zone, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, jsonb, timestamp with time zone, jsonb, jsonb) TO authenticated, service_role;
