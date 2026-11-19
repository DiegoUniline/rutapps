-- D-026: un ajuste de inventario se puede cancelar (movimiento contrario exacto) y editar (corregir lo contado,
-- mueve solo la diferencia). No se borra historial. Columnas nuevas, opcionales: no cambian datos existentes.
ALTER TABLE public.ajustes_inventario
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aplicado',
  ADD COLUMN IF NOT EXISTS cancelado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelado_motivo text,
  ADD COLUMN IF NOT EXISTS editado_at timestamptz,
  ADD COLUMN IF NOT EXISTS editado_por uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ajustes_inventario_status_chk') THEN
    ALTER TABLE public.ajustes_inventario ADD CONSTRAINT ajustes_inventario_status_chk CHECK (status IN ('aplicado','cancelado'));
  END IF;
END $$;

-- Valida que los renglones existan, sean de la empresa del usuario y no estén cancelados. Devuelve la empresa.
CREATE OR REPLACE FUNCTION public._ajustes_validar(p_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_emp uuid; v_n int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RAISE EXCEPTION 'Sin renglones' USING ERRCODE = '22023'; END IF;
  SELECT count(*), min(empresa_id::text)::uuid INTO v_n, v_emp FROM public.ajustes_inventario WHERE id = ANY(p_ids);
  IF v_n <> cardinality(p_ids) THEN RAISE EXCEPTION 'Ajuste no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF (SELECT count(DISTINCT empresa_id) FROM public.ajustes_inventario WHERE id = ANY(p_ids)) > 1 THEN
    RAISE EXCEPTION 'Renglones de varias empresas' USING ERRCODE = '42501';
  END IF;
  IF v_emp IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a este ajuste' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ajustes_inventario WHERE id = ANY(p_ids) AND status = 'cancelado') THEN
    RAISE EXCEPTION 'El ajuste ya está cancelado' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ajustes_inventario WHERE id = ANY(p_ids) AND almacen_id IS NULL) THEN
    RAISE EXCEPTION 'Ajuste sin almacén: no se puede revertir' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_emp;
END;
$$;

-- Cancelar: movimiento contrario por la diferencia vigente de cada renglón y marca Cancelado.
CREATE OR REPLACE FUNCTION public.cancelar_ajuste_inventario(p_ids uuid[], p_motivo text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_emp uuid; v_n int;
BEGIN
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
  v_emp := public._ajustes_validar(p_ids);
  PERFORM 1 FROM public.ajustes_inventario WHERE id = ANY(p_ids) FOR UPDATE;
  PERFORM 1 FROM public.stock_almacen sa JOIN public.ajustes_inventario a ON a.almacen_id = sa.almacen_id AND a.producto_id = sa.producto_id
   WHERE a.id = ANY(p_ids) FOR UPDATE OF sa;

  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  SELECT v_emp, a.almacen_id, a.producto_id, -SUM(a.diferencia)
    FROM public.ajustes_inventario a WHERE a.id = ANY(p_ids) AND abs(a.diferencia) > 0.000001
   GROUP BY a.almacen_id, a.producto_id
  ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id,
         referencia_tipo, referencia_id, user_id, fecha, notas)
  SELECT v_emp, (CASE WHEN a.diferencia > 0 THEN 'salida' ELSE 'entrada' END)::public.tipo_movimiento, a.producto_id, abs(a.diferencia),
         CASE WHEN a.diferencia > 0 THEN a.almacen_id END, CASE WHEN a.diferencia < 0 THEN a.almacen_id END,
         'ajuste', COALESCE(a.batch_id, a.id), v_uid, CURRENT_DATE, 'Cancelación de ajuste: ' || p_motivo
    FROM public.ajustes_inventario a WHERE a.id = ANY(p_ids) AND abs(a.diferencia) > 0.000001;

  UPDATE public.ajustes_inventario SET status = 'cancelado', cancelado_at = now(), cancelado_por = v_uid, cancelado_motivo = p_motivo
   WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'cancelados', v_n);
END;
$$;

-- Editar: corrige lo contado; mueve solo la diferencia contra lo que ya aplicó cada renglón.
CREATE OR REPLACE FUNCTION public.editar_ajuste_inventario(p_lineas jsonb, p_motivo text DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_emp uuid; v_ids uuid[]; v_n int;
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN RAISE EXCEPTION 'Renglones inválidos' USING ERRCODE = '22023'; END IF;
  SELECT array_agg(DISTINCT (x->>'id')::uuid) INTO v_ids FROM jsonb_array_elements(p_lineas) x WHERE NULLIF(x->>'id','') IS NOT NULL;
  v_emp := public._ajustes_validar(v_ids);
  PERFORM 1 FROM public.ajustes_inventario WHERE id = ANY(v_ids) FOR UPDATE;

  CREATE TEMP TABLE IF NOT EXISTS _aj_edit (id uuid PRIMARY KEY, almacen_id uuid, producto_id uuid, batch uuid, nueva numeric, delta numeric) ON COMMIT DROP;
  DELETE FROM _aj_edit WHERE true;
  INSERT INTO _aj_edit
  SELECT a.id, a.almacen_id, a.producto_id, COALESCE(a.batch_id, a.id), x.nueva, x.nueva - a.cantidad_nueva
    FROM (SELECT DISTINCT ON ((e->>'id')::uuid) (e->>'id')::uuid AS id, COALESCE((e->>'cantidad_nueva')::numeric, 0) AS nueva
            FROM jsonb_array_elements(p_lineas) e WHERE NULLIF(e->>'id','') IS NOT NULL) x
    JOIN public.ajustes_inventario a ON a.id = x.id;

  PERFORM 1 FROM public.stock_almacen sa JOIN _aj_edit e ON e.almacen_id = sa.almacen_id AND e.producto_id = sa.producto_id FOR UPDATE OF sa;
  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  SELECT v_emp, e.almacen_id, e.producto_id, SUM(e.delta) FROM _aj_edit e WHERE abs(e.delta) > 0.000001 GROUP BY e.almacen_id, e.producto_id
  ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id,
         referencia_tipo, referencia_id, user_id, fecha, notas)
  SELECT v_emp, (CASE WHEN e.delta > 0 THEN 'entrada' ELSE 'salida' END)::public.tipo_movimiento, e.producto_id, abs(e.delta),
         CASE WHEN e.delta < 0 THEN e.almacen_id END, CASE WHEN e.delta > 0 THEN e.almacen_id END,
         'ajuste', e.batch, v_uid, CURRENT_DATE, 'Edición de ajuste'
    FROM _aj_edit e WHERE abs(e.delta) > 0.000001;

  UPDATE public.ajustes_inventario a SET cantidad_nueva = e.nueva, diferencia = e.nueva - a.cantidad_anterior,
         editado_at = now(), editado_por = v_uid
    FROM _aj_edit e WHERE a.id = e.id AND abs(e.delta) > 0.000001;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF COALESCE(btrim(p_motivo), '') <> '' THEN
    UPDATE public.ajustes_inventario SET motivo = p_motivo, editado_at = now(), editado_por = v_uid WHERE id = ANY(v_ids);
  END IF;
  RETURN jsonb_build_object('ok', true, 'editados', v_n);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._ajustes_validar(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ajustes_validar(uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cancelar_ajuste_inventario(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_ajuste_inventario(uuid[], text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.editar_ajuste_inventario(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_ajuste_inventario(jsonb, text) TO authenticated, service_role;
