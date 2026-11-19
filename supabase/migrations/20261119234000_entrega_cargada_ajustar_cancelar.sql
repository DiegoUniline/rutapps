-- D-030: entrega ya asignada/cargada/en ruta (la mercancía está en el camión del repartidor).
-- Se pueden quitar productos (bajar cantidades) o cancelarla completa; el usuario elige a dónde va
-- lo quitado: se queda en el CAMIÓN (se reconcilia en la descarga) o regresa a la BODEGA de donde se
-- surtió. Reasignar ya existe (reasignar_entregas_bulk mueve el stock de camión, D-022).
--
-- Inventario: el surtido sacó X de bodega y la carga metió X al camión. Al validar (hecho) sale del
-- camión lo que diga cantidad_entregada. Por eso:
--   destino camión → solo baja cantidad_entregada; lo quitado queda libre en el camión.
--   destino bodega → además se traspasa lo quitado camión → bodega.

CREATE OR REPLACE FUNCTION public._entrega_cargada_validar(p_entrega_id uuid, p_destino text, p_version timestamptz)
RETURNS public.entregas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ent public.entregas%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_destino NOT IN ('camion', 'bodega') THEN
    RAISE EXCEPTION 'Destino inválido: camion o bodega' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_ent FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_ent.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta entrega' USING ERRCODE = '42501';
  END IF;
  -- Mismo permiso que ajustar_entrega (logística · entregas · editar; dueño y sin rol = acceso).
  IF NOT public.is_super_admin(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = v_ent.empresa_id AND e.owner_user_id = v_uid)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.role_permisos rp ON rp.role_id = ur.role_id
                      WHERE ur.user_id = v_uid AND rp.modulo = 'logistica.entregas' AND rp.accion = 'editar' AND rp.permitido)
  THEN
    RAISE EXCEPTION 'No tienes permiso para modificar entregas' USING ERRCODE = '42501';
  END IF;
  IF v_ent.status::text NOT IN ('asignado', 'cargado', 'en_ruta') THEN
    RAISE EXCEPTION 'Esta acción es para entregas asignadas o cargadas (estado actual: %).', v_ent.status::text
      USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NOT NULL AND v_ent.updated_at IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'La entrega cambió en otro dispositivo. Vuelve a abrirla.' USING ERRCODE = '40001';
  END IF;
  RETURN v_ent;
END;
$function$;

-- Regresa a bodega lo quitado de un renglón (camión → bodega de surtido).
CREATE OR REPLACE FUNCTION public._entrega_cargada_a_bodega(p_ent public.entregas, p_linea_id uuid, p_cantidad numeric, p_nota text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_truck  uuid;
  v_bodega uuid;
  v_prod   uuid;
  v_lote   boolean;
  v_nombre text;
BEGIN
  IF p_cantidad <= 0 THEN RETURN; END IF;
  SELECT almacen_id INTO v_truck FROM public.profiles WHERE id = COALESCE(p_ent.vendedor_ruta_id, p_ent.vendedor_id);
  SELECT el.producto_id, COALESCE(el.almacen_origen_id, p_ent.almacen_id), COALESCE(pr.maneja_lote, false), pr.nombre
    INTO v_prod, v_bodega, v_lote, v_nombre
    FROM public.entrega_lineas el JOIN public.productos pr ON pr.id = el.producto_id
   WHERE el.id = p_linea_id;
  IF v_truck IS NULL THEN
    RAISE EXCEPTION 'El repartidor no tiene camión (almacén) asignado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_bodega IS NULL OR v_bodega = v_truck THEN
    RAISE EXCEPTION 'No se identificó la bodega de surtido de "%": elige dejarlo en el camión.', v_nombre USING ERRCODE = 'P0001';
  END IF;
  IF v_lote THEN
    RAISE EXCEPTION '"%" maneja lotes: déjalo en el camión y regrésalo con la descarga.', v_nombre USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._mover_stock_entre_almacenes(p_ent.empresa_id, v_prod, p_cantidad, v_truck, v_bodega,
    'entrega_ajuste_carga', p_ent.id, auth.uid(), CURRENT_DATE, p_nota);
END;
$function$;

-- Quitar productos / bajar cantidades. p_lineas: [{ "id": <entrega_linea>, "cantidad": <nueva> }]
CREATE OR REPLACE FUNCTION public.ajustar_entrega_cargada(
  p_entrega_id uuid,
  p_lineas jsonb,
  p_destino text,
  p_version timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ent   public.entregas%ROWTYPE;
  v_line  jsonb;
  v_el    record;
  v_nueva numeric;
  v_quit  numeric;
  v_total numeric := 0;
  v_log   jsonb := '[]'::jsonb;
BEGIN
  v_ent := public._entrega_cargada_validar(p_entrega_id, p_destino, p_version);
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RAISE EXCEPTION 'Renglones inválidos.' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    SELECT el.id, el.producto_id, COALESCE(el.cantidad_entregada, 0) AS cargada, pr.nombre
      INTO v_el
      FROM public.entrega_lineas el JOIN public.productos pr ON pr.id = el.producto_id
     WHERE el.id = NULLIF(v_line->>'id', '')::uuid AND el.entrega_id = p_entrega_id
     FOR UPDATE OF el;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Renglón de otra entrega o inexistente.' USING ERRCODE = '22023';
    END IF;
    v_nueva := round(COALESCE((v_line->>'cantidad')::numeric, -1), 6);
    IF v_nueva < 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para "%".', v_el.nombre USING ERRCODE = '22023';
    END IF;
    IF v_nueva > v_el.cargada THEN
      RAISE EXCEPTION '"%": no puedes subir la cantidad cargada (%); solo quitar.', v_el.nombre, v_el.cargada
        USING ERRCODE = '22023';
    END IF;
    v_quit := v_el.cargada - v_nueva;
    IF v_quit <= 0 THEN CONTINUE; END IF;

    IF p_destino = 'bodega' THEN
      PERFORM public._entrega_cargada_a_bodega(v_ent, v_el.id, v_quit,
        'Ajuste entrega ' || COALESCE(v_ent.folio, '') || ': regresa a bodega');
    END IF;
    UPDATE public.entrega_lineas SET cantidad_entregada = v_nueva WHERE id = v_el.id;
    v_total := v_total + v_quit;
    v_log := v_log || jsonb_build_object('producto_id', v_el.producto_id, 'antes', v_el.cargada, 'despues', v_nueva);
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'No hay cambios que guardar.' USING ERRCODE = '22023';
  END IF;
  IF v_ent.pedido_id IS NOT NULL THEN
    PERFORM public.fn_recalc_venta_saldo(v_ent.pedido_id);
  END IF;
  RETURN jsonb_build_object('entrega_id', p_entrega_id, 'destino', p_destino, 'quitado', v_total, 'lineas', v_log);
END;
$function$;

-- Cancelar la entrega completa eligiendo a dónde va lo cargado.
CREATE OR REPLACE FUNCTION public.cancelar_entrega_cargada(
  p_entrega_id uuid,
  p_destino text,
  p_motivo text DEFAULT NULL,
  p_version timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ent public.entregas%ROWTYPE;
  v_el  record;
BEGIN
  v_ent := public._entrega_cargada_validar(p_entrega_id, p_destino, p_version);
  IF p_destino = 'bodega' THEN
    FOR v_el IN
      SELECT id, COALESCE(cantidad_entregada, 0) AS cargada
        FROM public.entrega_lineas
       WHERE entrega_id = p_entrega_id AND hecho = true AND COALESCE(cantidad_entregada, 0) > 0
    LOOP
      PERFORM public._entrega_cargada_a_bodega(v_ent, v_el.id, v_el.cargada,
        'Cancelación entrega ' || COALESCE(v_ent.folio, '') || ': regresa a bodega');
    END LOOP;
  END IF;
  -- Con destino camión el trigger deja la mercancía en el camión (se reconcilia en la descarga).
  UPDATE public.entregas
     SET status = 'cancelado',
         motivo_no_entrega = COALESCE(NULLIF(btrim(COALESCE(p_motivo, '')), ''), motivo_no_entrega)
   WHERE id = p_entrega_id;
  RETURN jsonb_build_object('entrega_id', p_entrega_id, 'destino', p_destino);
END;
$function$;

REVOKE ALL ON FUNCTION public._entrega_cargada_validar(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._entrega_cargada_a_bodega(public.entregas, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ajustar_entrega_cargada(uuid, jsonb, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_entrega_cargada(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_entrega_cargada(uuid, jsonb, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_entrega_cargada(uuid, text, text, timestamptz) TO authenticated, service_role;
