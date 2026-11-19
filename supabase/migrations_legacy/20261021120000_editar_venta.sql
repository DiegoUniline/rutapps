-- =====================================================================
-- RutApp · Fase 2: editar una venta confirmada/entregada en UNA operación
-- (2026-10-20, D-007/D-008). Solo agrega una función: no cambia datos ni tablas.
-- Recibe los renglones como deben quedar; agrega, cambia y quita en una sola
-- transacción. Stock, totales y saldo los calculan las reglas existentes.
-- Bloquea: cancelada, facturada, cerrada parcial, pedido con entregas,
-- total abajo de lo pagado, quitar renglón con comisión pagada, y cambios
-- hechos en otro dispositivo mientras se editaba (p_version).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.editar_venta(
  p_venta_id uuid,
  p_lineas   jsonb,
  p_version  timestamptz DEFAULT NULL,
  p_header   jsonb DEFAULT NULL,
  p_promos   jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_venta   public.ventas%ROWTYPE;
  v_cols    text[];
  v_pcols   text[];
  v_hcols   text[] := ARRAY['notas','descuento_extra','descuento_extra_tipo'];
  v_keep    uuid[];
  v_line    jsonb;
  v_id      uuid;
  v_keys    text;
  v_old     record;
  v_pagado  numeric;
  v_conlote uuid[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- Misma empresa (el super admin opera la empresa que tenga seleccionada).
  IF v_venta.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta venta' USING ERRCODE = '42501';
  END IF;

  -- Permiso ventas · editar, misma regla que usePermisos: dueño siempre;
  -- sin rol asignado = acceso total; con rol, se requiere el permiso.
  IF NOT public.is_super_admin(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = v_venta.empresa_id AND e.owner_user_id = v_uid)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permisos rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = v_uid AND rp.modulo = 'ventas' AND rp.accion = 'editar' AND rp.permitido)
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
  IF v_venta.tipo::text = 'pedido' AND EXISTS (SELECT 1 FROM public.entregas WHERE pedido_id = p_venta_id) THEN
    RAISE EXCEPTION 'El pedido ya tiene entregas: corrígelo desde la entrega.' USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NOT NULL AND v_venta.updated_at IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'La venta cambió en otro dispositivo. Vuelve a abrirla para editarla.' USING ERRCODE = '40001';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'La venta debe tener al menos un producto.' USING ERRCODE = '22023';
  END IF;

  -- Columnas que el cliente puede escribir (comisión, factura y llaves las pone la BD).
  SELECT array_agg(column_name::text) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venta_lineas'
    AND column_name NOT IN ('id','venta_id','empresa_id','created_at','updated_at',
                            'facturado','factura_cfdi_id','comision_pct','comision_monto');

  SELECT COALESCE(array_agg(NULLIF(x->>'id','')::uuid), '{}') INTO v_keep
  FROM jsonb_array_elements(p_lineas) x WHERE NULLIF(x->>'id','') IS NOT NULL;

  -- 1) Renglones que ya no vienen: se quitan (no si su comisión ya se pagó).
  FOR v_old IN SELECT id FROM public.venta_lineas WHERE venta_id = p_venta_id AND NOT (id = ANY(v_keep)) LOOP
    IF EXISTS (SELECT 1 FROM public.venta_comisiones c
               WHERE c.venta_linea_id = v_old.id AND (c.pagada OR c.pago_comision_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'No se puede quitar un producto cuya comisión ya se pagó.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.venta_linea_lotes WHERE venta_linea_id = v_old.id;
    DELETE FROM public.promocion_aplicada WHERE venta_linea_id = v_old.id;
    DELETE FROM public.venta_lineas WHERE id = v_old.id;
  END LOOP;

  -- 2) Renglones que vienen: se actualizan o se agregan (con su id si lo trae).
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

    -- Reparto por lotes del renglón (solo si viene la llave 'lotes').
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

  -- El reparto por lotes manda sobre la cantidad al mover stock: debe cuadrar.
  -- Si no se mandó reparto nuevo y la cantidad cambió, el viejo se quita y se asigna por caducidad.
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

  -- 3) Encabezado (solo campos que no dependen de cobros ni de facturación).
  SELECT string_agg(quote_ident(k), ', ') INTO v_keys
  FROM jsonb_object_keys(COALESCE(p_header,'{}'::jsonb)) k WHERE k = ANY(v_hcols);
  IF v_keys IS NOT NULL THEN
    EXECUTE format('UPDATE public.ventas t SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.ventas, $1)) WHERE t.id = $2', v_keys)
      USING p_header, p_venta_id;
  END IF;

  -- 4) Promociones aplicadas (se reemplazan si vienen).
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

  -- 5) Ejecuta ya las reglas diferidas (stock por diferencia, promos, totales y saldo)
  --    para validar el resultado final dentro de esta misma operación.
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';
  IF v_pagado > COALESCE(v_venta.total, 0) + 0.009 THEN
    RAISE EXCEPTION 'El nuevo total (%) queda abajo de lo ya pagado (%). Primero ajusta el pago.',
      round(COALESCE(v_venta.total,0), 2), round(v_pagado, 2) USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'total', v_venta.total,
    'saldo_pendiente', v_venta.saldo_pendiente,
    'updated_at', v_venta.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.editar_venta(uuid, jsonb, timestamptz, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, jsonb, timestamptz, jsonb, jsonb) TO authenticated, service_role;
