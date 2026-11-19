-- Hotfix: la BD tiene pg-safeupdate (UPDATE sin WHERE se rechaza en sesiones de la app).
-- aplicar_ajuste_inventario tenía un UPDATE sobre la tabla temporal sin WHERE → "UPDATE requires a WHERE clause".
CREATE OR REPLACE FUNCTION public.aplicar_ajuste_inventario(
  p_almacen_id uuid,
  p_motivo text,
  p_lineas jsonb DEFAULT '[]'::jsonb,   -- [{producto_id, cantidad_nueva}]
  p_reset boolean DEFAULT false         -- true: todo lo que tenga existencia en el almacén pasa a 0
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_batch uuid := gen_random_uuid();
  v_n int;
  v_nota text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  SELECT empresa_id INTO v_emp FROM public.almacenes WHERE id = p_almacen_id;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Almacén no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_emp IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a este almacén' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Indica un motivo para el ajuste' USING ERRCODE = '22023'; END IF;
  v_nota := CASE WHEN p_reset THEN 'Reinicio a ceros: ' ELSE 'Ajuste masivo: ' END || p_motivo;

  CREATE TEMP TABLE IF NOT EXISTS _ajuste (producto_id uuid PRIMARY KEY, nueva numeric, anterior numeric) ON COMMIT DROP;
  DELETE FROM _ajuste WHERE true;

  IF p_reset THEN
    INSERT INTO _ajuste (producto_id, nueva)
    SELECT sa.producto_id, 0 FROM public.stock_almacen sa
     WHERE sa.almacen_id = p_almacen_id AND COALESCE(sa.cantidad, 0) <> 0;
  ELSE
    IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
      RAISE EXCEPTION 'Renglones inválidos' USING ERRCODE = '22023';
    END IF;
    INSERT INTO _ajuste (producto_id, nueva)
    SELECT DISTINCT ON ((x->>'producto_id')::uuid) (x->>'producto_id')::uuid, COALESCE((x->>'cantidad_nueva')::numeric, 0)
      FROM jsonb_array_elements(p_lineas) x
     WHERE NULLIF(x->>'producto_id','') IS NOT NULL;
    IF EXISTS (SELECT 1 FROM _ajuste a LEFT JOIN public.productos p ON p.id = a.producto_id
               WHERE p.id IS NULL OR p.empresa_id IS DISTINCT FROM v_emp) THEN
      RAISE EXCEPTION 'Hay productos que no son de esta empresa' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Cantidad anterior real, con las existencias bloqueadas mientras se ajusta.
  PERFORM 1 FROM public.stock_almacen sa JOIN _ajuste a ON a.producto_id = sa.producto_id
   WHERE sa.almacen_id = p_almacen_id FOR UPDATE OF sa;
  UPDATE _ajuste a SET anterior = COALESCE((SELECT sa.cantidad FROM public.stock_almacen sa
                                             WHERE sa.almacen_id = p_almacen_id AND sa.producto_id = a.producto_id), 0)
   WHERE true;  -- safeupdate exige WHERE en los UPDATE que llegan desde la app
  DELETE FROM _ajuste WHERE abs(nueva - anterior) < 0.000001;
  SELECT count(*) INTO v_n FROM _ajuste;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', true, 'ajustados', 0, 'batch_id', NULL); END IF;

  INSERT INTO public.ajustes_inventario (empresa_id, producto_id, almacen_id, cantidad_anterior, cantidad_nueva, diferencia, motivo, user_id, batch_id)
  SELECT v_emp, a.producto_id, p_almacen_id, a.anterior, a.nueva, a.nueva - a.anterior, p_motivo, v_uid, v_batch FROM _ajuste a;

  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  SELECT v_emp, p_almacen_id, a.producto_id, a.nueva FROM _ajuste a
  ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad = EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id,
         referencia_tipo, referencia_id, user_id, fecha, notas)
  SELECT v_emp, (CASE WHEN a.nueva > a.anterior THEN 'entrada' ELSE 'salida' END)::public.tipo_movimiento, a.producto_id, abs(a.nueva - a.anterior),
         CASE WHEN a.nueva < a.anterior THEN p_almacen_id END, CASE WHEN a.nueva > a.anterior THEN p_almacen_id END,
         'ajuste', v_batch, v_uid, CURRENT_DATE, v_nota
    FROM _ajuste a;

  RETURN jsonb_build_object('ok', true, 'ajustados', v_n, 'batch_id', v_batch);
END;
$$;
