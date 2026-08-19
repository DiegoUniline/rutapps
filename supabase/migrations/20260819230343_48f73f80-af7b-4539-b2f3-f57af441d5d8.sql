-- 1) Publicar solicitud (borrador -> aprobada/publicada) sin exigir stock
CREATE OR REPLACE FUNCTION public.publicar_solicitud_traspaso(p_solicitud_id uuid, p_lineas jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_item jsonb; v_total numeric;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status NOT IN ('borrador','solicitada') THEN
    RAISE EXCEPTION 'Solo se puede publicar una solicitud en borrador';
  END IF;
  IF v_sol.almacen_origen_id IS NULL OR v_sol.almacen_destino_id IS NULL THEN
    RAISE EXCEPTION 'Define el almacén origen y destino';
  END IF;

  IF p_lineas IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
      UPDATE public.solicitud_traspaso_lineas
         SET cantidad_aprobada = GREATEST(COALESCE((v_item->>'cantidad_aprobada')::numeric,0), 0)
       WHERE id = (v_item->>'linea_id')::uuid AND solicitud_id = p_solicitud_id;
    END LOOP;
  ELSE
    UPDATE public.solicitud_traspaso_lineas
       SET cantidad_aprobada = cantidad_solicitada
     WHERE solicitud_id = p_solicitud_id;
  END IF;

  SELECT COALESCE(SUM(cantidad_aprobada),0) INTO v_total
    FROM public.solicitud_traspaso_lineas WHERE solicitud_id = p_solicitud_id;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Agrega al menos un producto con cantidad mayor a cero'; END IF;

  UPDATE public.solicitudes_traspaso
     SET status = 'aprobada', enviado_at = COALESCE(enviado_at, now()),
         aprobado_por = auth.uid(), aprobado_at = now()
   WHERE id = p_solicitud_id;
  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'publicada', NULL);
END; $function$;

-- 2) Previsualización de surtido: stock real justo antes de confirmar
CREATE OR REPLACE FUNCTION public.preview_surtido_solicitud(p_solicitud_id uuid)
RETURNS TABLE (
  linea_id uuid, producto_id uuid, codigo text, nombre text,
  cantidad_solicitada numeric, cantidad_surtida numeric,
  cantidad_pendiente numeric, disponible_origen numeric, cantidad_surtible numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_sol public.solicitudes_traspaso%ROWTYPE;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT l.id,
         l.producto_id,
         p.codigo,
         p.nombre,
         l.cantidad_solicitada,
         l.cantidad_surtida,
         GREATEST(COALESCE(NULLIF(l.cantidad_aprobada,0), l.cantidad_solicitada) - l.cantidad_surtida, 0) AS pendiente,
         COALESCE(public.fn_disponible_almacen(l.producto_id, v_sol.almacen_origen_id), 0) AS disponible,
         LEAST(
           GREATEST(COALESCE(NULLIF(l.cantidad_aprobada,0), l.cantidad_solicitada) - l.cantidad_surtida, 0),
           GREATEST(COALESCE(public.fn_disponible_almacen(l.producto_id, v_sol.almacen_origen_id), 0), 0)
         ) AS surtible
    FROM public.solicitud_traspaso_lineas l
    JOIN public.productos p ON p.id = l.producto_id
   WHERE l.solicitud_id = p_solicitud_id
   ORDER BY p.nombre;
END; $function$;

-- 3) Cerrar solicitud: lo pendiente ya no podrá surtirse
CREATE OR REPLACE FUNCTION public.cerrar_solicitud_traspaso(p_solicitud_id uuid, p_motivo text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_sol public.solicitudes_traspaso%ROWTYPE;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status NOT IN ('aprobada','parcialmente_surtida') THEN
    RAISE EXCEPTION 'Solo se puede cerrar una solicitud publicada o parcialmente surtida';
  END IF;
  UPDATE public.solicitudes_traspaso
     SET status = 'cerrada', cerrado_at = now(), cerrado_por = auth.uid(), motivo_cierre = p_motivo
   WHERE id = p_solicitud_id;
  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'cerrada',
    jsonb_build_object('motivo', p_motivo));
END; $function$;

-- 4) Surtido transaccional que nunca deja stock negativo: recorta a lo disponible
CREATE OR REPLACE FUNCTION public.surtir_solicitud_traspaso(p_solicitud_id uuid, p_lineas jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_item jsonb; v_linea public.solicitud_traspaso_lineas%ROWTYPE;
  v_cant numeric; v_pend numeric; v_disp numeric;
  v_traspaso_id uuid; v_traspaso_linea_id uuid;
  v_maneja_lote boolean; v_restante numeric; v_lote RECORD; v_toma numeric;
  v_total_aprobado numeric; v_total_surtido numeric; v_algo boolean := false;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status NOT IN ('aprobada','parcialmente_surtida') THEN
    RAISE EXCEPTION 'Esta solicitud ya no admite surtidos';
  END IF;
  IF v_sol.almacen_origen_id IS NULL OR v_sol.almacen_destino_id IS NULL THEN
    RAISE EXCEPTION 'La solicitud no tiene almacén origen o destino';
  END IF;

  v_traspaso_id := gen_random_uuid();
  INSERT INTO public.traspasos (id, empresa_id, tipo, status, almacen_origen_id, almacen_destino_id, fecha, notas, user_id)
  VALUES (v_traspaso_id, v_sol.empresa_id, 'almacen_almacen'::public.tipo_traspaso, 'borrador'::public.status_traspaso,
          v_sol.almacen_origen_id, v_sol.almacen_destino_id, CURRENT_DATE,
          'Surtido de solicitud ' || COALESCE(v_sol.folio,''), COALESCE(auth.uid(), v_sol.solicitante_user_id));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    SELECT * INTO v_linea FROM public.solicitud_traspaso_lineas
      WHERE id = (v_item->>'linea_id')::uuid AND solicitud_id = p_solicitud_id FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    -- Bloquea la existencia del origen para evitar que dos surtidos consuman el mismo stock
    PERFORM 1 FROM public.stock_almacen
      WHERE empresa_id = v_sol.empresa_id AND almacen_id = v_sol.almacen_origen_id
        AND producto_id = v_linea.producto_id
      FOR UPDATE;

    v_pend := GREATEST(COALESCE(NULLIF(v_linea.cantidad_aprobada,0), v_linea.cantidad_solicitada) - v_linea.cantidad_surtida, 0);
    v_disp := GREATEST(COALESCE(public.fn_disponible_almacen(v_linea.producto_id, v_sol.almacen_origen_id), 0), 0);
    v_cant := GREATEST(COALESCE((v_item->>'cantidad')::numeric, 0), 0);
    v_cant := LEAST(v_cant, v_pend, v_disp);
    CONTINUE WHEN v_cant <= 0;

    v_traspaso_linea_id := gen_random_uuid();
    INSERT INTO public.traspaso_lineas (id, traspaso_id, producto_id, cantidad)
    VALUES (v_traspaso_linea_id, v_traspaso_id, v_linea.producto_id, v_cant);

    SELECT COALESCE(maneja_lote,false) INTO v_maneja_lote FROM public.productos WHERE id = v_linea.producto_id;
    IF v_maneja_lote THEN
      v_restante := v_cant;
      FOR v_lote IN
        SELECT sl.lote_id, sl.cantidad, l.fecha_caducidad
        FROM public.stock_lotes sl
        JOIN public.lotes l ON l.id = sl.lote_id
        WHERE sl.empresa_id = v_sol.empresa_id AND sl.almacen_id = v_sol.almacen_origen_id
          AND sl.producto_id = v_linea.producto_id AND sl.cantidad > 0
        ORDER BY l.fecha_caducidad NULLS LAST, l.created_at
        FOR UPDATE OF sl
      LOOP
        EXIT WHEN v_restante <= 0;
        v_toma := LEAST(v_restante, v_lote.cantidad);
        INSERT INTO public.traspaso_linea_lotes (empresa_id, traspaso_id, traspaso_linea_id, producto_id, lote_id, cantidad)
        VALUES (v_sol.empresa_id, v_traspaso_id, v_traspaso_linea_id, v_linea.producto_id, v_lote.lote_id, v_toma);
        v_restante := v_restante - v_toma;
      END LOOP;
      IF v_restante > 0 THEN
        -- Recorta la línea a lo realmente loteado (nunca genera negativos)
        v_cant := v_cant - v_restante;
        IF v_cant <= 0 THEN
          DELETE FROM public.traspaso_linea_lotes WHERE traspaso_linea_id = v_traspaso_linea_id;
          DELETE FROM public.traspaso_lineas WHERE id = v_traspaso_linea_id;
          CONTINUE;
        END IF;
        UPDATE public.traspaso_lineas SET cantidad = v_cant WHERE id = v_traspaso_linea_id;
      END IF;
    END IF;

    UPDATE public.solicitud_traspaso_lineas
       SET cantidad_surtida = cantidad_surtida + v_cant
     WHERE id = v_linea.id;
    v_algo := true;
  END LOOP;

  IF NOT v_algo THEN
    DELETE FROM public.traspasos WHERE id = v_traspaso_id;
    RAISE EXCEPTION 'No hay existencia disponible en el almacén origen para surtir esta solicitud';
  END IF;

  PERFORM public.confirmar_traspaso(v_traspaso_id, COALESCE(auth.uid(), v_sol.solicitante_user_id));

  INSERT INTO public.solicitud_traspaso_surtidos (empresa_id, solicitud_id, traspaso_id, surtido_por)
  VALUES (v_sol.empresa_id, p_solicitud_id, v_traspaso_id, auth.uid());

  SELECT COALESCE(SUM(GREATEST(COALESCE(NULLIF(cantidad_aprobada,0), cantidad_solicitada),0)),0),
         COALESCE(SUM(cantidad_surtida),0)
    INTO v_total_aprobado, v_total_surtido
    FROM public.solicitud_traspaso_lineas WHERE solicitud_id = p_solicitud_id;

  UPDATE public.solicitudes_traspaso
     SET status = CASE WHEN v_total_surtido >= v_total_aprobado THEN 'surtida'::public.status_solicitud_traspaso
                       ELSE 'parcialmente_surtida'::public.status_solicitud_traspaso END
   WHERE id = p_solicitud_id;

  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'surtida',
    jsonb_build_object('traspaso_id', v_traspaso_id, 'lineas', p_lineas));

  RETURN v_traspaso_id;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.publicar_solicitud_traspaso(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.preview_surtido_solicitud(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cerrar_solicitud_traspaso(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publicar_solicitud_traspaso(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_surtido_solicitud(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_solicitud_traspaso(uuid, text) TO authenticated;