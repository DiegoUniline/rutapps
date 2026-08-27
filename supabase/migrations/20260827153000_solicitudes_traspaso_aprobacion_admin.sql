-- Solicitudes de traspaso: aprobación administrativa auditable.
-- 1) Precarga lo solicitado una sola vez al enviar.
-- 2) Después de ese momento, cero es una cantidad válida y nunca hace fallback.
-- 3) Permite agregar/excluir líneas durante la aprobación sin perder historial.

ALTER TABLE public.solicitud_traspaso_lineas
  ADD COLUMN IF NOT EXISTS excluida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agregada_por_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agregada_por uuid,
  ADD COLUMN IF NOT EXISTS agregada_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluida_por uuid,
  ADD COLUMN IF NOT EXISTS excluida_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_stl_solicitud_activa
  ON public.solicitud_traspaso_lineas(solicitud_id, producto_id)
  WHERE excluida = false;

-- Las solicitudes que estaban esperando aprobación nacieron con cero por el
-- default anterior. Se precargan con lo solicitado; a partir de esta migración
-- cualquier cero capturado por el administrador se conserva.
UPDATE public.solicitud_traspaso_lineas l
   SET cantidad_aprobada = l.cantidad_solicitada
  FROM public.solicitudes_traspaso s
 WHERE s.id = l.solicitud_id
   AND s.status = 'solicitada'
   AND l.excluida = false;

CREATE OR REPLACE FUNCTION public.guardar_aprobacion_solicitud(
  p_solicitud_id uuid,
  p_almacen_origen_id uuid,
  p_observaciones text DEFAULT NULL,
  p_lineas jsonb DEFAULT '[]'::jsonb,
  p_excluidas jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_item jsonb;
  v_linea_id uuid;
  v_producto_id uuid;
  v_cantidad numeric;
  v_excluida_id uuid;
  v_existente public.solicitud_traspaso_lineas%ROWTYPE;
BEGIN
  SELECT * INTO v_sol
    FROM public.solicitudes_traspaso
   WHERE id = p_solicitud_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status <> 'solicitada' THEN
    RAISE EXCEPTION 'Solo se puede editar una solicitud pendiente de aprobación';
  END IF;
  IF p_almacen_origen_id IS NULL OR p_almacen_origen_id = v_sol.almacen_destino_id THEN
    RAISE EXCEPTION 'Elige un almacén origen diferente al destino';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes
     WHERE id = p_almacen_origen_id AND empresa_id = v_sol.empresa_id
  ) THEN
    RAISE EXCEPTION 'El almacén origen no pertenece a la empresa';
  END IF;

  -- Primero excluye para permitir volver a agregar el mismo producto como una
  -- nueva decisión administrativa dentro de la misma operación.
  FOR v_excluida_id IN
    SELECT value::uuid
      FROM jsonb_array_elements_text(COALESCE(p_excluidas, '[]'::jsonb))
  LOOP
    UPDATE public.solicitud_traspaso_lineas
       SET excluida = true,
           excluida_por = auth.uid(),
           excluida_at = now()
     WHERE id = v_excluida_id
       AND solicitud_id = p_solicitud_id
       AND excluida = false;
  END LOOP;

  FOR v_item IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::jsonb))
  LOOP
    v_linea_id := NULLIF(v_item->>'linea_id', '')::uuid;
    v_producto_id := NULLIF(v_item->>'producto_id', '')::uuid;
    v_cantidad := GREATEST(COALESCE((v_item->>'cantidad_aprobada')::numeric, 0), 0);

    IF v_linea_id IS NULL OR v_producto_id IS NULL THEN
      RAISE EXCEPTION 'Hay una partida incompleta en la aprobación';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.productos
       WHERE id = v_producto_id AND empresa_id = v_sol.empresa_id
    ) THEN
      RAISE EXCEPTION 'Uno de los productos no pertenece a la empresa';
    END IF;

    SELECT * INTO v_existente
      FROM public.solicitud_traspaso_lineas
     WHERE id = v_linea_id
     FOR UPDATE;

    IF FOUND THEN
      IF v_existente.solicitud_id <> p_solicitud_id OR v_existente.producto_id <> v_producto_id THEN
        RAISE EXCEPTION 'La partida no pertenece a esta solicitud';
      END IF;
      UPDATE public.solicitud_traspaso_lineas
         SET cantidad_aprobada = v_cantidad,
             excluida = false,
             excluida_por = NULL,
             excluida_at = NULL
       WHERE id = v_linea_id;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.solicitud_traspaso_lineas
         WHERE solicitud_id = p_solicitud_id
           AND producto_id = v_producto_id
           AND excluida = false
      ) THEN
        RAISE EXCEPTION 'El producto agregado ya existe en la solicitud';
      END IF;

      INSERT INTO public.solicitud_traspaso_lineas (
        id, solicitud_id, producto_id,
        stock_actual_snapshot, stock_minimo_snapshot, stock_maximo_snapshot,
        cantidad_sugerida, cantidad_solicitada, cantidad_aprobada, cantidad_surtida,
        agregada_por_admin, agregada_por, agregada_at
      ) VALUES (
        v_linea_id, p_solicitud_id, v_producto_id,
        0, 0, 0,
        0, 0, v_cantidad, 0,
        true, auth.uid(), now()
      );
    END IF;
  END LOOP;

  UPDATE public.solicitudes_traspaso
     SET almacen_origen_id = p_almacen_origen_id,
         observaciones = p_observaciones
   WHERE id = p_solicitud_id;

  PERFORM public.fn_log_solicitud_traspaso(
    p_solicitud_id,
    v_sol.empresa_id,
    'aprobacion_guardada',
    jsonb_build_object(
      'lineas', jsonb_array_length(COALESCE(p_lineas, '[]'::jsonb)),
      'excluidas', jsonb_array_length(COALESCE(p_excluidas, '[]'::jsonb))
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_solicitud_traspaso(p_solicitud_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_lineas int;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede enviar una solicitud en borrador';
  END IF;

  SELECT COUNT(*) INTO v_lineas
    FROM public.solicitud_traspaso_lineas
   WHERE solicitud_id = p_solicitud_id
     AND excluida = false
     AND cantidad_solicitada > 0;

  IF v_lineas = 0 THEN RAISE EXCEPTION 'Agrega al menos un producto con cantidad mayor a cero'; END IF;
  IF v_sol.almacen_destino_id IS NULL OR v_sol.almacen_origen_id IS NULL THEN
    RAISE EXCEPTION 'Define el almacén origen y destino';
  END IF;

  -- Esta es la única precarga. Después, cero se respeta como cero.
  UPDATE public.solicitud_traspaso_lineas
     SET cantidad_aprobada = cantidad_solicitada
   WHERE solicitud_id = p_solicitud_id
     AND excluida = false;

  UPDATE public.solicitudes_traspaso
     SET status = 'solicitada', enviado_at = now()
   WHERE id = p_solicitud_id;

  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'enviada', NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.aprobar_solicitud_traspaso(
  p_solicitud_id uuid,
  p_lineas jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_item jsonb;
  v_linea public.solicitud_traspaso_lineas%ROWTYPE;
  v_disp numeric;
  v_nombre text;
  v_total numeric;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status <> 'solicitada' THEN
    RAISE EXCEPTION 'Solo se puede aprobar una solicitud enviada';
  END IF;
  IF v_sol.almacen_origen_id IS NULL OR v_sol.almacen_destino_id IS NULL THEN
    RAISE EXCEPTION 'Define el almacén origen y destino';
  END IF;

  IF p_lineas IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
      UPDATE public.solicitud_traspaso_lineas
         SET cantidad_aprobada = GREATEST(
           COALESCE((v_item->>'cantidad_aprobada')::numeric, 0),
           0
         )
       WHERE id = (v_item->>'linea_id')::uuid
         AND solicitud_id = p_solicitud_id
         AND excluida = false;
    END LOOP;
  END IF;

  FOR v_linea IN
    SELECT * FROM public.solicitud_traspaso_lineas
     WHERE solicitud_id = p_solicitud_id
       AND excluida = false
       AND cantidad_aprobada > 0
  LOOP
    v_disp := GREATEST(COALESCE(
      public.fn_disponible_almacen(v_linea.producto_id, v_sol.almacen_origen_id),
      0
    ), 0);
    IF v_linea.cantidad_aprobada > v_disp THEN
      SELECT nombre INTO v_nombre FROM public.productos WHERE id = v_linea.producto_id;
      RAISE EXCEPTION 'Existencia disponible insuficiente en origen para "%". Disponible: %, aprobado: %',
        v_nombre, v_disp, v_linea.cantidad_aprobada;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(cantidad_aprobada), 0) INTO v_total
    FROM public.solicitud_traspaso_lineas
   WHERE solicitud_id = p_solicitud_id
     AND excluida = false;

  IF v_total <= 0 THEN RAISE EXCEPTION 'Debes aprobar al menos una cantidad mayor a cero'; END IF;

  UPDATE public.solicitudes_traspaso
     SET status = 'aprobada', aprobado_por = auth.uid(), aprobado_at = now()
   WHERE id = p_solicitud_id;

  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'aprobada', p_lineas);
END;
$function$;

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
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
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
         GREATEST(l.cantidad_aprobada - l.cantidad_surtida, 0) AS pendiente,
         COALESCE(public.fn_disponible_almacen(l.producto_id, v_sol.almacen_origen_id), 0) AS disponible,
         LEAST(
           GREATEST(l.cantidad_aprobada - l.cantidad_surtida, 0),
           GREATEST(COALESCE(public.fn_disponible_almacen(l.producto_id, v_sol.almacen_origen_id), 0), 0)
         ) AS surtible
    FROM public.solicitud_traspaso_lineas l
    JOIN public.productos p ON p.id = l.producto_id
   WHERE l.solicitud_id = p_solicitud_id
     AND l.excluida = false
     AND l.cantidad_aprobada > 0
   ORDER BY p.nombre;
END;
$function$;

CREATE OR REPLACE FUNCTION public.surtir_solicitud_traspaso(p_solicitud_id uuid, p_lineas jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_item jsonb;
  v_linea public.solicitud_traspaso_lineas%ROWTYPE;
  v_cant numeric;
  v_pend numeric;
  v_disp numeric;
  v_traspaso_id uuid;
  v_traspaso_linea_id uuid;
  v_maneja_lote boolean;
  v_restante numeric;
  v_lote RECORD;
  v_toma numeric;
  v_total_aprobado numeric;
  v_total_surtido numeric;
  v_algo boolean := false;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status NOT IN ('aprobada', 'parcialmente_surtida') THEN
    RAISE EXCEPTION 'Esta solicitud ya no admite surtidos';
  END IF;
  IF v_sol.almacen_origen_id IS NULL OR v_sol.almacen_destino_id IS NULL THEN
    RAISE EXCEPTION 'La solicitud no tiene almacén origen o destino';
  END IF;

  v_traspaso_id := gen_random_uuid();
  INSERT INTO public.traspasos (
    id, empresa_id, tipo, status, almacen_origen_id, almacen_destino_id, fecha, notas, user_id
  ) VALUES (
    v_traspaso_id, v_sol.empresa_id,
    'almacen_almacen'::public.tipo_traspaso,
    'borrador'::public.status_traspaso,
    v_sol.almacen_origen_id, v_sol.almacen_destino_id, CURRENT_DATE,
    'Surtido de solicitud ' || COALESCE(v_sol.folio, ''),
    COALESCE(auth.uid(), v_sol.solicitante_user_id)
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::jsonb)) LOOP
    SELECT * INTO v_linea
      FROM public.solicitud_traspaso_lineas
     WHERE id = (v_item->>'linea_id')::uuid
       AND solicitud_id = p_solicitud_id
       AND excluida = false
     FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    PERFORM 1 FROM public.stock_almacen
     WHERE empresa_id = v_sol.empresa_id
       AND almacen_id = v_sol.almacen_origen_id
       AND producto_id = v_linea.producto_id
     FOR UPDATE;

    v_pend := GREATEST(v_linea.cantidad_aprobada - v_linea.cantidad_surtida, 0);
    v_disp := GREATEST(COALESCE(
      public.fn_disponible_almacen(v_linea.producto_id, v_sol.almacen_origen_id), 0
    ), 0);
    v_cant := GREATEST(COALESCE((v_item->>'cantidad')::numeric, 0), 0);
    v_cant := LEAST(v_cant, v_pend, v_disp);
    CONTINUE WHEN v_cant <= 0;

    v_traspaso_linea_id := gen_random_uuid();
    INSERT INTO public.traspaso_lineas (id, traspaso_id, producto_id, cantidad)
    VALUES (v_traspaso_linea_id, v_traspaso_id, v_linea.producto_id, v_cant);

    SELECT COALESCE(maneja_lote, false) INTO v_maneja_lote
      FROM public.productos WHERE id = v_linea.producto_id;

    IF v_maneja_lote THEN
      v_restante := v_cant;
      FOR v_lote IN
        SELECT sl.lote_id, sl.cantidad, l.fecha_caducidad
          FROM public.stock_lotes sl
          JOIN public.lotes l ON l.id = sl.lote_id
         WHERE sl.empresa_id = v_sol.empresa_id
           AND sl.almacen_id = v_sol.almacen_origen_id
           AND sl.producto_id = v_linea.producto_id
           AND sl.cantidad > 0
         ORDER BY l.fecha_caducidad NULLS LAST, l.created_at
         FOR UPDATE OF sl
      LOOP
        EXIT WHEN v_restante <= 0;
        v_toma := LEAST(v_restante, v_lote.cantidad);
        INSERT INTO public.traspaso_linea_lotes (
          empresa_id, traspaso_id, traspaso_linea_id, producto_id, lote_id, cantidad
        ) VALUES (
          v_sol.empresa_id, v_traspaso_id, v_traspaso_linea_id,
          v_linea.producto_id, v_lote.lote_id, v_toma
        );
        v_restante := v_restante - v_toma;
      END LOOP;

      IF v_restante > 0 THEN
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

  PERFORM public.confirmar_traspaso(
    v_traspaso_id,
    COALESCE(auth.uid(), v_sol.solicitante_user_id)
  );

  INSERT INTO public.solicitud_traspaso_surtidos (
    empresa_id, solicitud_id, traspaso_id, surtido_por
  ) VALUES (
    v_sol.empresa_id, p_solicitud_id, v_traspaso_id, auth.uid()
  );

  SELECT COALESCE(SUM(cantidad_aprobada), 0),
         COALESCE(SUM(cantidad_surtida), 0)
    INTO v_total_aprobado, v_total_surtido
    FROM public.solicitud_traspaso_lineas
   WHERE solicitud_id = p_solicitud_id
     AND excluida = false;

  UPDATE public.solicitudes_traspaso
     SET status = CASE
       WHEN v_total_surtido >= v_total_aprobado
         THEN 'surtida'::public.status_solicitud_traspaso
       ELSE 'parcialmente_surtida'::public.status_solicitud_traspaso
     END
   WHERE id = p_solicitud_id;

  PERFORM public.fn_log_solicitud_traspaso(
    p_solicitud_id,
    v_sol.empresa_id,
    'surtida',
    jsonb_build_object('traspaso_id', v_traspaso_id, 'lineas', p_lineas)
  );

  RETURN v_traspaso_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guardar_aprobacion_solicitud(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_aprobacion_solicitud(uuid, uuid, text, jsonb, jsonb) TO authenticated;

-- El flujo "publicar" podía aprobar y mover inventario desde un borrador sin
-- revisión. Se retira del cliente autenticado; el surtido queda disponible solo
-- después de aprobar.
REVOKE EXECUTE ON FUNCTION public.publicar_solicitud_traspaso(uuid, jsonb) FROM PUBLIC, anon, authenticated;
