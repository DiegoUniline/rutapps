ALTER TABLE public.comision_esquemas ADD COLUMN IF NOT EXISTS vigente_desde date;

CREATE OR REPLACE FUNCTION public.calcular_comision_volumen(p_vendedor_id uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid;
  v_esquema RECORD;
  v_total_ventas numeric := 0;
  v_num_ventas integer := 0;
  v_comision numeric := 0;
  v_tier jsonb;
  v_pct numeric;
  v_meta numeric;
  v_bono numeric;
  v_bono_pct numeric;
  v_ventas_ids uuid[];
  v_caller_empresa uuid;
  v_desde_efectivo date;
BEGIN
  SELECT empresa_id INTO v_caller_empresa FROM public.profiles WHERE user_id = auth.uid();
  SELECT empresa_id INTO v_empresa FROM public.profiles WHERE id = p_vendedor_id;
  IF v_caller_empresa IS NULL OR v_empresa IS NULL OR v_caller_empresa <> v_empresa THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT ce.* INTO v_esquema
  FROM public.profiles p
  JOIN public.comision_esquemas ce ON ce.id = p.comision_esquema_id
  WHERE p.id = p_vendedor_id AND ce.activo = true;

  IF v_esquema IS NULL THEN
    RETURN jsonb_build_object('error','sin_esquema');
  END IF;

  v_desde_efectivo := GREATEST(p_desde, COALESCE(v_esquema.vigente_desde, p_desde));

  IF v_esquema.base = 'cobradas' THEN
    SELECT COALESCE(SUM(v.total),0), COUNT(*), COALESCE(array_agg(v.id),'{}'::uuid[])
      INTO v_total_ventas, v_num_ventas, v_ventas_ids
    FROM public.ventas v
    WHERE v.empresa_id = v_empresa
      AND v.vendedor_id = p_vendedor_id
      AND v.fecha BETWEEN v_desde_efectivo AND p_hasta
      AND v.status <> 'cancelado'
      AND COALESCE(v.es_saldo_inicial,false) = false
      AND COALESCE(v.saldo_pendiente, 0) <= 0.01
      AND v.comision_volumen_pago_id IS NULL;
  ELSE
    SELECT COALESCE(SUM(v.total),0), COUNT(*), COALESCE(array_agg(v.id),'{}'::uuid[])
      INTO v_total_ventas, v_num_ventas, v_ventas_ids
    FROM public.ventas v
    WHERE v.empresa_id = v_empresa
      AND v.vendedor_id = p_vendedor_id
      AND v.fecha BETWEEN v_desde_efectivo AND p_hasta
      AND v.status <> 'cancelado'
      AND COALESCE(v.es_saldo_inicial,false) = false
      AND v.comision_volumen_pago_id IS NULL;
  END IF;

  IF v_esquema.tipo = 'volumen_pct' THEN
    v_pct := COALESCE((v_esquema.config->>'pct')::numeric, 0);
    v_comision := ROUND(v_total_ventas * v_pct / 100, 2);
  ELSIF v_esquema.tipo = 'volumen_tiers' THEN
    v_pct := 0;
    FOR v_tier IN SELECT * FROM jsonb_array_elements(COALESCE(v_esquema.config->'tiers','[]'::jsonb)) LOOP
      IF v_total_ventas >= COALESCE((v_tier->>'desde')::numeric, 0)
         AND (v_tier->>'hasta' IS NULL OR v_total_ventas <= (v_tier->>'hasta')::numeric) THEN
        v_pct := COALESCE((v_tier->>'pct')::numeric, 0);
        EXIT;
      END IF;
    END LOOP;
    v_comision := ROUND(v_total_ventas * v_pct / 100, 2);
  ELSIF v_esquema.tipo = 'bono_meta' THEN
    v_meta := COALESCE((v_esquema.config->>'meta')::numeric, 0);
    v_bono := COALESCE((v_esquema.config->>'bono')::numeric, 0);
    v_bono_pct := COALESCE((v_esquema.config->>'bono_pct')::numeric, 0);
    IF v_total_ventas >= v_meta AND v_meta > 0 THEN
      v_comision := ROUND(v_bono + (v_total_ventas * v_bono_pct / 100), 2);
    ELSE
      v_comision := 0;
    END IF;
  ELSIF v_esquema.tipo = 'lista_precios' THEN
    SELECT COALESCE(SUM(vc.comision_monto),0)
      INTO v_comision
    FROM public.venta_comisiones vc
    WHERE vc.empresa_id = v_empresa
      AND vc.vendedor_id = p_vendedor_id
      AND vc.venta_id = ANY(v_ventas_ids);
    v_comision := ROUND(COALESCE(v_comision,0) * (1 + COALESCE((v_esquema.config->>'ajuste_pct')::numeric,0)/100), 2);
    v_pct := CASE WHEN v_total_ventas > 0 THEN ROUND(v_comision * 100 / v_total_ventas, 2) ELSE 0 END;
  END IF;

  RETURN jsonb_build_object(
    'esquema_id', v_esquema.id,
    'esquema_nombre', v_esquema.nombre,
    'tipo', v_esquema.tipo,
    'periodo', v_esquema.periodo,
    'base', v_esquema.base,
    'vigente_desde', v_esquema.vigente_desde,
    'desde_efectivo', v_desde_efectivo,
    'total_ventas', v_total_ventas,
    'num_ventas', v_num_ventas,
    'comision', v_comision,
    'pct_aplicado', v_pct,
    'meta_alcanzada', CASE WHEN v_esquema.tipo='bono_meta' THEN (v_total_ventas >= COALESCE((v_esquema.config->>'meta')::numeric,0)) ELSE null END,
    'ventas_ids', to_jsonb(v_ventas_ids)
  );
END;
$function$;