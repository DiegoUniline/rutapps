-- D-036: que cuadren entregas ↔ camiones ↔ kardex ↔ liquidación.
-- 1) Reasignar una entrega NO ENTREGADA mueve la mercancía del camión anterior al nuevo y la deja
--    'cargado' para el nuevo repartidor (antes cambiaba el nombre pero las piezas se quedaban en el
--    camión anterior y el nuevo quedaba en negativo al entregar).
--    reasignar_pendientes_usuario (D-022) usa la misma lógica.
-- 2) «Merma en camión»: cada camión tiene su almacén de merma (no vendible). Lo que el cliente
--    rechaza como merma pasa del camión a su merma (entrega_lineas.cantidad_merma, sincronizado por
--    diferencia, idempotente, funciona con la cola sin conexión).
-- 3) Al aprobar la descarga, la merma del camión pasa al almacén Mermas central.

-- ── Ubicación de merma por camión ─────────────────────────────────────────────────────────────
ALTER TABLE public.almacenes
  ADD COLUMN IF NOT EXISTS merma_de_almacen_id uuid REFERENCES public.almacenes(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_almacenes_merma_de
  ON public.almacenes (merma_de_almacen_id) WHERE merma_de_almacen_id IS NOT NULL;
COMMENT ON COLUMN public.almacenes.merma_de_almacen_id IS
  'D-036: si tiene valor, este almacén es la «Merma en camión» del almacén indicado (no vendible).';

-- El almacén Mermas CENTRAL es el es_merma sin camión: las funciones que tomaban «el primero con
-- es_merma» ahora excluyen las mermas de camión.
DO $do$
DECLARE
  f text;
  v_def text;
  v_new text;
BEGIN
  FOREACH f IN ARRAY ARRAY['ensure_almacen_mermas', 'apply_devolucion_linea_inventory', 'aplicar_lote_devolucion'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f;
    v_new := regexp_replace(v_def, 'es_merma = true(\s+)LIMIT 1',
                            'es_merma = true AND merma_de_almacen_id IS NULL\1ORDER BY created_at LIMIT 1', 'g');
    IF v_new = v_def THEN
      IF position('merma_de_almacen_id IS NULL' in v_def) = 0 THEN
        RAISE EXCEPTION 'D-036: no se encontró «es_merma = true LIMIT 1» en %', f;
      END IF;
      CONTINUE; -- ya aplicado
    END IF;
    EXECUTE v_new;
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION public._almacen_merma_camion(p_camion uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id  uuid;
  v_alm public.almacenes%ROWTYPE;
BEGIN
  SELECT id INTO v_id FROM public.almacenes WHERE merma_de_almacen_id = p_camion;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_alm FROM public.almacenes WHERE id = p_camion;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Camión no encontrado' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.almacenes (empresa_id, nombre, tipo, es_merma, activo, merma_de_almacen_id)
  VALUES (v_alm.empresa_id, 'Merma · ' || v_alm.nombre, v_alm.tipo, true, true, p_camion)
  ON CONFLICT (merma_de_almacen_id) WHERE merma_de_almacen_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.almacenes WHERE merma_de_almacen_id = p_camion;
  END IF;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public._almacen_merma_camion(uuid) FROM PUBLIC, anon, authenticated;

-- ── Merma por renglón de entrega ──────────────────────────────────────────────────────────────
ALTER TABLE public.entrega_lineas
  ADD COLUMN IF NOT EXISTS cantidad_merma numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merma_aplicada numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merma_almacen_id uuid REFERENCES public.almacenes(id);
COMMENT ON COLUMN public.entrega_lineas.cantidad_merma IS
  'D-036: piezas rechazadas por el cliente que son merma (no vendibles). Pasan del camión a su merma.';
COMMENT ON COLUMN public.entrega_lineas.merma_aplicada IS
  'D-036: piezas ya movidas a la merma del camión (control interno; lo escribe fn_sync_entrega_merma).';

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entrega_lineas_cantidad_merma_chk') THEN
    ALTER TABLE public.entrega_lineas
      ADD CONSTRAINT entrega_lineas_cantidad_merma_chk CHECK (cantidad_merma >= 0);
  END IF;
END
$do$;

-- Saca/regresa del lote del camión al pasar piezas a merma (FEFO), para que stock y lotes cuadren.
CREATE OR REPLACE FUNCTION public._merma_ajustar_lotes(
  p_empresa_id uuid, p_almacen uuid, p_producto uuid, p_cantidad numeric, p_lote_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_left numeric := abs(p_cantidad);
  v_take numeric;
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = p_producto AND COALESCE(maneja_lote, false)) THEN
    RETURN;
  END IF;
  IF p_cantidad > 0 THEN
    FOR r IN
      SELECT sl.id, sl.cantidad FROM public.stock_lotes sl JOIN public.lotes l ON l.id = sl.lote_id
       WHERE sl.almacen_id = p_almacen AND sl.producto_id = p_producto AND sl.cantidad > 0
       ORDER BY (sl.lote_id IS DISTINCT FROM p_lote_id), l.fecha_caducidad ASC NULLS LAST, l.created_at ASC
       FOR UPDATE OF sl
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(r.cantidad, v_left);
      UPDATE public.stock_lotes SET cantidad = cantidad - v_take, updated_at = now() WHERE id = r.id;
      v_left := v_left - v_take;
    END LOOP;
  ELSE
    SELECT id INTO r FROM public.stock_lotes sl
     WHERE sl.almacen_id = p_almacen AND sl.producto_id = p_producto
       AND (p_lote_id IS NULL OR sl.lote_id = p_lote_id)
     ORDER BY sl.updated_at DESC LIMIT 1;
    IF r.id IS NOT NULL THEN
      UPDATE public.stock_lotes SET cantidad = cantidad + v_left, updated_at = now() WHERE id = r.id;
    ELSIF p_lote_id IS NOT NULL THEN
      INSERT INTO public.stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
      VALUES (p_empresa_id, p_almacen, p_producto, p_lote_id, v_left);
    END IF;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._merma_ajustar_lotes(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_sync_entrega_merma(p_linea_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l       record;
  v_ent   record;
  v_cam   uuid;
  v_merma uuid;
  v_dif   numeric;
BEGIN
  SELECT * INTO l FROM public.entrega_lineas WHERE id = p_linea_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_dif := round(COALESCE(l.cantidad_merma, 0) - COALESCE(l.merma_aplicada, 0), 6);
  IF v_dif = 0 THEN RETURN; END IF;

  SELECT id, empresa_id, folio, vendedor_id, vendedor_ruta_id INTO v_ent
    FROM public.entregas WHERE id = l.entrega_id;

  IF v_dif > 0 THEN
    -- Camión del repartidor actual → su merma.
    SELECT almacen_id INTO v_cam FROM public.profiles WHERE id = COALESCE(v_ent.vendedor_ruta_id, v_ent.vendedor_id);
    IF v_cam IS NULL THEN
      RAISE EXCEPTION 'La entrega % no tiene camión asignado: no se puede registrar la merma',
        COALESCE(v_ent.folio, v_ent.id::text) USING ERRCODE = '22023';
    END IF;
    v_merma := COALESCE(l.merma_almacen_id, public._almacen_merma_camion(v_cam));
    IF l.merma_almacen_id IS NOT NULL THEN
      SELECT merma_de_almacen_id INTO v_cam FROM public.almacenes WHERE id = l.merma_almacen_id;
    END IF;
    PERFORM public._mover_stock_entre_almacenes(v_ent.empresa_id, l.producto_id, v_dif, v_cam, v_merma,
      'entrega_merma', v_ent.id, auth.uid(), CURRENT_DATE,
      'Merma en camión (entrega ' || COALESCE(v_ent.folio, '—') || ') [linea:' || l.id || ']');
    PERFORM public._merma_ajustar_lotes(v_ent.empresa_id, v_cam, l.producto_id, v_dif, l.lote_id);
  ELSE
    -- Se corrigió a menos merma: regresa de la merma al camión donde se registró.
    v_merma := l.merma_almacen_id;
    SELECT merma_de_almacen_id INTO v_cam FROM public.almacenes WHERE id = v_merma;
    IF v_merma IS NULL OR v_cam IS NULL THEN RETURN; END IF;
    PERFORM public._mover_stock_entre_almacenes(v_ent.empresa_id, l.producto_id, -v_dif, v_merma, v_cam,
      'entrega_merma', v_ent.id, auth.uid(), CURRENT_DATE,
      'Corrección de merma en camión (entrega ' || COALESCE(v_ent.folio, '—') || ') [linea:' || l.id || ']');
    PERFORM public._merma_ajustar_lotes(v_ent.empresa_id, v_cam, l.producto_id, v_dif, l.lote_id);
  END IF;

  UPDATE public.entrega_lineas
     SET merma_aplicada = cantidad_merma, merma_almacen_id = v_merma
   WHERE id = l.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_sync_entrega_merma(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_entrega_lineas_merma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.cantidad_merma, 0) IS DISTINCT FROM COALESCE(NEW.merma_aplicada, 0) THEN
    PERFORM public.fn_sync_entrega_merma(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_entrega_lineas_merma ON public.entrega_lineas;
CREATE TRIGGER trg_entrega_lineas_merma
  AFTER INSERT OR UPDATE OF cantidad_merma ON public.entrega_lineas
  FOR EACH ROW EXECUTE FUNCTION public.tg_entrega_lineas_merma();

-- ── Reasignar: también no entregadas, y vuelven a 'cargado' ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.reasignar_entregas_bulk(p_entrega_ids uuid[], p_target_vendedor_id uuid, p_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid := get_my_empresa_id();
  v_target_almacen uuid;
  v_target_estado text;
  v_target_empresa uuid;
  v_entrega RECORD;
  v_linea RECORD;
  v_reasignadas int := 0;
  v_con_movimiento int := 0;
  v_omitidas int := 0;
  v_today date := CURRENT_DATE;
BEGIN
  IF p_entrega_ids IS NULL OR array_length(p_entrega_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay entregas seleccionadas';
  END IF;
  IF p_target_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Debes seleccionar un vendedor destino';
  END IF;

  SELECT almacen_id, estado, empresa_id
  INTO v_target_almacen, v_target_estado, v_target_empresa
  FROM profiles WHERE id = p_target_vendedor_id;

  IF v_target_empresa IS NULL THEN RAISE EXCEPTION 'Vendedor destino no encontrado'; END IF;
  IF v_target_empresa <> v_empresa AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'El vendedor destino no pertenece a tu empresa';
  END IF;
  IF v_target_estado <> 'activo' THEN
    RAISE EXCEPTION 'El vendedor destino no está activo';
  END IF;

  FOR v_entrega IN
    SELECT e.*, p.almacen_id AS actual_almacen_id
    FROM entregas e
    LEFT JOIN profiles p ON p.id = COALESCE(e.vendedor_ruta_id, e.vendedor_id)
    WHERE e.id = ANY(p_entrega_ids)
      AND (e.empresa_id = v_empresa OR is_super_admin(auth.uid()))
    FOR UPDATE OF e
  LOOP
    IF v_entrega.status::text IN ('hecho','cancelado') THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;
    IF COALESCE(v_entrega.vendedor_ruta_id, v_entrega.vendedor_id) = p_target_vendedor_id THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    -- Cargada / en ruta / no entregada: la mercancía va en el camión actual → pasa al nuevo.
    -- (Lo marcado como merma se queda en la merma del camión anterior: no viaja como vendible.)
    IF v_entrega.status::text IN ('cargado','en_ruta','no_entregado') THEN
      IF v_entrega.actual_almacen_id IS NULL THEN
        RAISE EXCEPTION 'La entrega % está cargada pero el vendedor actual no tiene almacén asignado', COALESCE(v_entrega.folio, v_entrega.id::text);
      END IF;
      IF v_target_almacen IS NULL THEN
        RAISE EXCEPTION 'El vendedor destino no tiene almacén asignado, no se puede mover el stock cargado de la entrega %', COALESCE(v_entrega.folio, v_entrega.id::text);
      END IF;

      IF v_entrega.actual_almacen_id <> v_target_almacen THEN
        FOR v_linea IN
          SELECT producto_id, cantidad_entregada
          FROM entrega_lineas
          WHERE entrega_id = v_entrega.id AND hecho = true AND cantidad_entregada > 0
        LOOP
          PERFORM _mover_stock_entre_almacenes(
            v_entrega.empresa_id, v_linea.producto_id, v_linea.cantidad_entregada,
            v_entrega.actual_almacen_id, v_target_almacen,
            'entrega', v_entrega.id, COALESCE(p_user_id, auth.uid()), v_today,
            concat('Reasignación entrega ', COALESCE(v_entrega.folio, v_entrega.id::text))
          );
        END LOOP;
        v_con_movimiento := v_con_movimiento + 1;
      END IF;
    END IF;

    UPDATE entregas
    SET vendedor_ruta_id = p_target_vendedor_id,
        fecha_asignacion = COALESCE(fecha_asignacion, now()),
        status = CASE WHEN status::text = 'no_entregado' THEN 'cargado'::status_entrega ELSE status END,
        fecha_entrega = CASE WHEN status::text = 'no_entregado' THEN NULL ELSE fecha_entrega END,
        validado_at = CASE WHEN status::text = 'no_entregado' THEN NULL ELSE validado_at END
    WHERE id = v_entrega.id;

    v_reasignadas := v_reasignadas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reasignadas', v_reasignadas,
    'con_movimiento_stock', v_con_movimiento,
    'omitidas', v_omitidas
  );
END;
$function$;

-- D-022: reasignar pendientes de un usuario mueve también el stock de lo que ya va en su camión.
CREATE OR REPLACE FUNCTION public.reasignar_pendientes_usuario(p_profile_id uuid, p_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_target_empresa uuid;
  v_target_estado text;
  v_target_archivado_en timestamptz;
  v_ids uuid[];
  v_res jsonb := '{}'::jsonb;
  v_entregas int := 0;
  v_ventas int := 0;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM public.profiles WHERE id = p_profile_id;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Usuario origen no encontrado';
  END IF;
  SELECT empresa_id, estado, archivado_en INTO v_target_empresa, v_target_estado, v_target_archivado_en
    FROM public.profiles WHERE id = p_target_profile_id;
  IF v_target_empresa IS NULL THEN
    RAISE EXCEPTION 'Usuario destino no encontrado';
  END IF;
  IF v_target_empresa <> v_empresa_id THEN
    RAISE EXCEPTION 'El usuario destino debe ser de la misma empresa';
  END IF;
  IF v_target_estado <> 'activo' OR v_target_archivado_en IS NOT NULL THEN
    RAISE EXCEPTION 'El usuario destino debe estar activo';
  END IF;
  IF p_profile_id = p_target_profile_id THEN
    RAISE EXCEPTION 'No se puede reasignar al mismo usuario';
  END IF;
  IF NOT public.is_empresa_admin(auth.uid(), v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado: requiere permisos de administrador';
  END IF;

  -- Las que ya van en su camión (cargadas, en ruta, no entregadas): mueven mercancía.
  SELECT array_agg(id) INTO v_ids FROM public.entregas
   WHERE empresa_id = v_empresa_id
     AND status::text IN ('cargado', 'en_ruta', 'no_entregado')
     AND COALESCE(vendedor_ruta_id, vendedor_id) = p_profile_id;
  IF v_ids IS NOT NULL THEN
    v_res := public.reasignar_entregas_bulk(v_ids, p_target_profile_id, auth.uid());
    v_entregas := COALESCE((v_res->>'reasignadas')::int, 0);
  END IF;

  -- El resto (aún sin cargar) solo cambia de responsable.
  WITH upd AS (
    UPDATE public.entregas SET vendedor_ruta_id = p_target_profile_id
     WHERE empresa_id = v_empresa_id AND status NOT IN ('hecho', 'cancelado')
       AND vendedor_ruta_id = p_profile_id
    RETURNING 1
  ) SELECT v_entregas + COUNT(*) INTO v_entregas FROM upd;

  UPDATE public.entregas SET vendedor_id = p_target_profile_id
   WHERE empresa_id = v_empresa_id AND status NOT IN ('hecho', 'cancelado') AND vendedor_id = p_profile_id;

  WITH upd2 AS (
    UPDATE public.ventas SET vendedor_id = p_target_profile_id
     WHERE empresa_id = v_empresa_id AND vendedor_id = p_profile_id
       AND status IN ('borrador', 'confirmado') AND tipo IN ('pedido', 'venta_directa')
       AND COALESCE(saldo_pendiente, 0) > 0 AND COALESCE(entrega_inmediata, false) = false
    RETURNING 1
  ) SELECT COUNT(*) INTO v_ventas FROM upd2;

  RETURN jsonb_build_object('entregas_reasignadas', v_entregas, 'ventas_reasignadas', v_ventas,
                            'con_movimiento_stock', COALESCE((v_res->>'con_movimiento_stock')::int, 0));
END;
$function$;

-- ── Descarga aprobada: la merma del camión pasa a Mermas central ─────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_descarga_merma_camion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_camion  uuid;
  v_mcam    uuid;
  v_central uuid;
  r record;
BEGIN
  IF NEW.status <> 'aprobada' OR OLD.status = 'aprobada' THEN RETURN NEW; END IF;
  IF NOT COALESCE(NEW.descargo_camion, false) THEN RETURN NEW; END IF;
  SELECT almacen_id INTO v_camion FROM public.profiles WHERE id = NEW.vendedor_id;
  IF v_camion IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_mcam FROM public.almacenes WHERE merma_de_almacen_id = v_camion;
  IF v_mcam IS NULL THEN RETURN NEW; END IF;
  v_central := public.ensure_almacen_mermas(NEW.empresa_id);
  FOR r IN SELECT producto_id, cantidad FROM public.stock_almacen WHERE almacen_id = v_mcam AND cantidad > 0 LOOP
    PERFORM public._mover_stock_entre_almacenes(NEW.empresa_id, r.producto_id, r.cantidad, v_mcam, v_central,
      'descarga', NEW.id, COALESCE(NEW.aprobado_por, NEW.user_id), COALESCE(NEW.fecha, CURRENT_DATE),
      'Descarga de ruta: merma del camión a Mermas (descarga ' || NEW.id || ')');
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_descarga_merma_camion ON public.descarga_ruta;
CREATE TRIGGER trg_descarga_merma_camion
  AFTER UPDATE OF status ON public.descarga_ruta
  FOR EACH ROW EXECUTE FUNCTION public.tg_descarga_merma_camion();
