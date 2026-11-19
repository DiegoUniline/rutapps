-- F1a saldo a favor (D-008, D-021, D-023, D-025). Autorizado: "CONFIRMO F1a" (dueño, 2026-11-19).

-- 1) Partes del cobro que quedan a favor del cliente o que se le devolvieron (solo de aquí en adelante, D-023).
ALTER TABLE public.cobros
  ADD COLUMN IF NOT EXISTS saldo_favor_monto numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reembolso_monto numeric NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cobros_saldo_favor_reembolso_chk') THEN
    ALTER TABLE public.cobros ADD CONSTRAINT cobros_saldo_favor_reembolso_chk CHECK (saldo_favor_monto >= 0 AND reembolso_monto >= 0);
  END IF;
END $$;

-- 2) Una sola regla de saldo: fuera los triggers legacy que corrían al final y dejaban saldos negativos
--    (auditoría C1). Quedan trg_cobro_aplicaciones_recalc y trg_cobros_status_recalc (fn_recalc_venta_saldo).
DROP TRIGGER IF EXISTS trg_recalc_venta_saldo ON public.cobro_aplicaciones;
DROP TRIGGER IF EXISTS trg_recalc_saldos_on_cobro_status ON public.cobros;

-- Excedente cuando lo pagado supera la base cobrable (total, o total_efectivo si está cerrado).
-- p_destino NULL  → error 'EXCEDENTE|<monto>' para que el front pregunte (D-025).
-- 'nada'          → se deja como está.
-- 'saldo_favor'   → se desaplica del más reciente al más viejo y queda en cobros.saldo_favor_monto.
-- 'reembolso'     → igual, pero queda en cobros.reembolso_monto (dinero devuelto).
CREATE OR REPLACE FUNCTION public._resolver_excedente_venta(p_venta_id uuid, p_destino text, p_uid uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_base numeric;
  v_pagado numeric;
  v_exc numeric;
  v_rest numeric;
  v_take numeric;
  a record;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_base := CASE WHEN v_venta.cerrado_at IS NOT NULL THEN COALESCE(v_venta.total_efectivo, v_venta.total) ELSE v_venta.total END;
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
    FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
   WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';
  v_exc := round(v_pagado - COALESCE(v_base, 0), 2);
  IF v_exc <= 0.009 THEN RETURN 0; END IF;

  IF p_destino IS NULL THEN
    RAISE EXCEPTION 'EXCEDENTE|%|El nuevo total (%) queda abajo de lo ya pagado (%).', v_exc, round(COALESCE(v_base,0),2), round(v_pagado,2)
      USING ERRCODE = 'P0001';
  END IF;
  IF p_destino = 'nada' THEN RETURN 0; END IF;
  IF p_destino NOT IN ('saldo_favor','reembolso') THEN
    RAISE EXCEPTION 'Destino del excedente inválido: saldo_favor, reembolso o nada' USING ERRCODE = '22023';
  END IF;

  v_rest := v_exc;
  FOR a IN
    SELECT ca.id, ca.cobro_id, ca.monto_aplicado
      FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
     WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado' AND ca.monto_aplicado > 0
     ORDER BY c.fecha DESC, c.created_at DESC, ca.created_at DESC
     FOR UPDATE OF ca
  LOOP
    EXIT WHEN v_rest <= 0.009;
    v_take := LEAST(a.monto_aplicado, v_rest);
    IF a.monto_aplicado - v_take <= 0.009 THEN
      DELETE FROM public.cobro_aplicaciones WHERE id = a.id;
    ELSE
      UPDATE public.cobro_aplicaciones SET monto_aplicado = monto_aplicado - v_take WHERE id = a.id;
    END IF;
    IF p_destino = 'saldo_favor' THEN
      UPDATE public.cobros SET saldo_favor_monto = saldo_favor_monto + v_take WHERE id = a.cobro_id;
    ELSE
      UPDATE public.cobros SET reembolso_monto = reembolso_monto + v_take WHERE id = a.cobro_id;
    END IF;
    v_rest := v_rest - v_take;
  END LOOP;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
  PERFORM public.log_venta_historial(p_venta_id, v_venta.empresa_id,
    CASE WHEN p_destino = 'saldo_favor' THEN 'excedente_saldo_favor' ELSE 'excedente_reembolso' END,
    jsonb_build_object('monto', v_exc - v_rest, 'user_id', p_uid));
  RETURN v_exc - v_rest;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._resolver_excedente_venta(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._resolver_excedente_venta(uuid, text, uuid) TO service_role;

-- Saldo a favor disponible del cliente (misma regla que src/lib/saldoFavor.ts):
--   notas de crédito de devoluciones + cobros.saldo_favor_monto − cobros pagados con saldo a favor (activos).
CREATE OR REPLACE FUNCTION public.saldo_a_favor_cliente(p_cliente_id uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_emp uuid; v_emitido numeric; v_usado numeric;
BEGIN
  SELECT empresa_id INTO v_emp FROM public.clientes WHERE id = p_cliente_id;
  IF v_emp IS NULL THEN RETURN 0; END IF;
  IF COALESCE(auth.role(),'') <> 'service_role' AND v_emp IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Sin acceso a este cliente' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(SUM(dl.monto_credito), 0) INTO v_emitido
    FROM public.devolucion_lineas dl JOIN public.devoluciones d ON d.id = dl.devolucion_id
   WHERE d.cliente_id = p_cliente_id AND dl.accion::text = 'nota_credito';
  v_emitido := v_emitido + COALESCE((SELECT SUM(saldo_favor_monto) FROM public.cobros
                                     WHERE cliente_id = p_cliente_id AND COALESCE(status,'activo') <> 'cancelado'), 0);
  SELECT COALESCE(SUM(monto), 0) INTO v_usado FROM public.cobros
   WHERE cliente_id = p_cliente_id AND metodo_pago = 'saldo_favor' AND COALESCE(status,'activo') <> 'cancelado';
  RETURN GREATEST(0, round(v_emitido - v_usado, 2));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.saldo_a_favor_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_a_favor_cliente(uuid) TO authenticated, service_role;

-- D-021: una venta confirmada/entregada/facturada ya no regresa a borrador (se edita con Editar venta).
CREATE OR REPLACE FUNCTION public.fn_bloquear_regreso_borrador() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status::text = 'borrador' AND OLD.status::text IN ('confirmado','entregado','facturado')
     AND session_user = 'authenticator' AND COALESCE(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Una venta confirmada ya no regresa a borrador: usa Editar venta.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bloquear_regreso_borrador ON public.ventas;
CREATE TRIGGER trg_bloquear_regreso_borrador BEFORE UPDATE OF status ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_regreso_borrador();

-- 3) editar_venta: excedente por p_header.excedente.
CREATE OR REPLACE FUNCTION public.editar_venta(p_venta_id uuid, p_lineas jsonb, p_version timestamp with time zone DEFAULT NULL::timestamp with time zone, p_header jsonb DEFAULT NULL::jsonb, p_promos jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_uid     uuid := auth.uid();
  v_venta   public.ventas%ROWTYPE;
  v_cols    text[];
  v_pcols   text[];
  v_hcols   text[] := ARRAY['notas','descuento_extra','descuento_extra_tipo','fecha','condicion_pago'];
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

-- 4) ajustar_entrega y cerrar_pedido_parcial: parámetro nuevo p_excedente (se recrean para no dejar dos versiones).
DROP FUNCTION IF EXISTS public.ajustar_entrega(uuid, jsonb, text, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.ajustar_entrega(p_entrega_id uuid, p_lineas jsonb, p_destino text DEFAULT 'camion'::text, p_version timestamp with time zone DEFAULT NULL::timestamp with time zone, p_excedente text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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

  SELECT almacen_id INTO v_truck FROM public.profiles WHERE id = COALESCE(v_ent.vendedor_ruta_id, v_ent.vendedor_id);
  v_truck := COALESCE(v_truck, v_ent.almacen_id);
  IF v_truck IS NULL THEN RAISE EXCEPTION 'La entrega no tiene almacén de ruta.' USING ERRCODE = 'P0001'; END IF;
  v_bodega := COALESCE(
    (SELECT el.almacen_origen_id FROM public.entrega_lineas el WHERE el.entrega_id = p_entrega_id AND el.almacen_origen_id IS NOT NULL LIMIT 1),
    v_ent.almacen_id);
  IF p_destino = 'bodega' AND (v_bodega IS NULL OR v_bodega = v_truck) THEN
    RAISE EXCEPTION 'No se identificó la bodega de origen de esta entrega.' USING ERRCODE = 'P0001';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _aj_antes (producto_id uuid, cant numeric) ON COMMIT DROP;
  DELETE FROM _aj_antes WHERE true;
  INSERT INTO _aj_antes SELECT producto_id, SUM(COALESCE(cantidad_entregada,0))
    FROM public.entrega_lineas WHERE entrega_id = p_entrega_id AND hecho GROUP BY producto_id;

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
      -- D-024: con destino "bodega" lo entregado de más (o el producto correcto) sale de bodega
      -- y pasa por el camión (surtido + carga), así el camión queda igual y "Reabrir" lo revierte.
      IF p_destino = 'bodega' THEN
        PERFORM public._aj_sacar_de_bodega(v_ent, p.producto_id, v_diff, v_truck, v_bodega, v_uid);
      END IF;
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
        IF p_destino = 'bodega' THEN
          PERFORM public._aj_regresar_a_bodega(v_ent, p.producto_id, m.lote_id, v_take, v_truck, v_bodega, v_uid);
        END IF;
        v_rest := v_rest - v_take;
      END LOOP;
      IF v_rest > 0.000001 THEN
        RAISE EXCEPTION 'No se encontró lo descontado de la entrega para regresar (faltan %).', v_rest USING ERRCODE = 'P0001';
      END IF;
    END IF;

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

  SET CONSTRAINTS ALL IMMEDIATE;
  IF v_ent.pedido_id IS NOT NULL THEN
    PERFORM public.fn_recalc_venta_header(v_ent.pedido_id);
    PERFORM public._resolver_excedente_venta(v_ent.pedido_id, p_excedente, v_uid);
  END IF;

  SELECT * INTO v_ent FROM public.entregas WHERE id = p_entrega_id;
  RETURN jsonb_build_object('ok', true, 'updated_at', v_ent.updated_at,
    'pedido_total', (SELECT total FROM public.ventas WHERE id = v_ent.pedido_id),
    'pedido_saldo', (SELECT saldo_pendiente FROM public.ventas WHERE id = v_ent.pedido_id));
END;
$_$;
REVOKE EXECUTE ON FUNCTION public.ajustar_entrega(uuid, jsonb, text, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_entrega(uuid, jsonb, text, timestamp with time zone, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.cerrar_pedido_parcial(uuid, uuid);
CREATE OR REPLACE FUNCTION public.cerrar_pedido_parcial(p_venta_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_excedente text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.cerrar_pedido_parcial(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_pedido_parcial(uuid, uuid, text) TO authenticated, service_role;
