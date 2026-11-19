-- ============================================================
-- RPC: apply_conteo_ajustes
-- Aplica ajustes pendientes de un conteo físico de forma
-- atómica e idempotente. Sustituye la lógica del frontend.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_conteo_ajustes(p_conteo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conteo record;
  v_linea record;
  v_stock_actual numeric;
  v_dif numeric;
  v_aplicados int := 0;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  -- Lock del conteo
  SELECT id, empresa_id, almacen_id, folio, status
  INTO v_conteo
  FROM public.conteos_fisicos
  WHERE id = p_conteo_id
  FOR UPDATE;

  IF v_conteo.id IS NULL THEN
    RAISE EXCEPTION 'Conteo no encontrado';
  END IF;

  -- Validar tenant
  IF v_conteo.empresa_id IS DISTINCT FROM get_my_empresa_id()
     AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permisos sobre este conteo';
  END IF;

  -- Procesar cada línea cerrada y no ajustada
  FOR v_linea IN
    SELECT id, producto_id, cantidad_contada
    FROM public.conteo_lineas
    WHERE conteo_id = p_conteo_id
      AND status = 'cerrado'
      AND ajuste_aplicado = false
    ORDER BY created_at
  LOOP
    -- Lock + lectura del stock actual
    SELECT cantidad INTO v_stock_actual
    FROM public.stock_almacen
    WHERE almacen_id = v_conteo.almacen_id
      AND producto_id = v_linea.producto_id
    FOR UPDATE;

    IF v_stock_actual IS NULL THEN
      v_stock_actual := 0;
    END IF;

    v_dif := COALESCE(v_linea.cantidad_contada, 0) - v_stock_actual;

    IF v_dif <> 0 THEN
      -- Aplicar al stock
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_conteo.empresa_id, v_conteo.almacen_id, v_linea.producto_id, v_stock_actual + v_dif)
      ON CONFLICT (almacen_id, producto_id) DO UPDATE
        SET cantidad = EXCLUDED.cantidad, updated_at = now();

      -- Registrar movimiento
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad,
        almacen_origen_id, almacen_destino_id,
        referencia_tipo, referencia_id, notas, user_id, fecha
      ) VALUES (
        v_conteo.empresa_id,
        CASE WHEN v_dif > 0 THEN 'entrada' ELSE 'salida' END,
        v_linea.producto_id,
        ABS(v_dif),
        CASE WHEN v_dif > 0 THEN NULL ELSE v_conteo.almacen_id END,
        CASE WHEN v_dif > 0 THEN v_conteo.almacen_id ELSE NULL END,
        'conteo_fisico', p_conteo_id,
        'Ajuste por conteo físico ' || v_conteo.folio
          || '. Contado: ' || COALESCE(v_linea.cantidad_contada, 0)
          || ', Sistema: ' || v_stock_actual,
        v_user_id, CURRENT_DATE
      );
    END IF;

    -- Marcar como ajustada (idempotencia)
    UPDATE public.conteo_lineas
    SET ajuste_aplicado = true
    WHERE id = v_linea.id;

    v_aplicados := v_aplicados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'aplicados', v_aplicados,
    'conteo_id', p_conteo_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_conteo_ajustes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_conteo_ajustes(uuid) TO authenticated;