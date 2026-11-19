-- D-028: Editar venta cambia también cliente (los pagos solo de esta venta se mueven con ella),
-- vendedor (comisiones no pagadas) y fecha. Se conserva el resto de editar_venta (F1a).
CREATE OR REPLACE FUNCTION public.editar_venta(p_venta_id uuid, p_lineas jsonb, p_version timestamp with time zone DEFAULT NULL::timestamp with time zone, p_header jsonb DEFAULT NULL::jsonb, p_promos jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_uid     uuid := auth.uid();
  v_venta   public.ventas%ROWTYPE;
  v_cols    text[];
  v_pcols   text[];
  v_hcols   text[] := ARRAY['notas','descuento_extra','descuento_extra_tipo','fecha','condicion_pago','cliente_id','vendedor_id'];
  v_keep    uuid[];
  v_line    jsonb;
  v_id      uuid;
  v_keys    text;
  v_old     record;
  v_pagado  numeric;
  v_conlote uuid[] := '{}';
  v_solo_precio boolean;
  v_entregas_activas boolean;
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
