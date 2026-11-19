
-- Esquemas de comisión por volumen
CREATE TABLE IF NOT EXISTS public.comision_esquemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('volumen_pct','volumen_tiers','bono_meta')),
  periodo text NOT NULL CHECK (periodo IN ('semanal','quincenal','mensual')),
  base text NOT NULL CHECK (base IN ('cobradas','todas')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comision_esquemas TO authenticated;
GRANT ALL ON public.comision_esquemas TO service_role;

ALTER TABLE public.comision_esquemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "esquemas_select_empresa" ON public.comision_esquemas FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "esquemas_modify_empresa" ON public.comision_esquemas FOR ALL TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at_comision_esquemas()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_comision_esquemas_updated ON public.comision_esquemas;
CREATE TRIGGER trg_comision_esquemas_updated BEFORE UPDATE ON public.comision_esquemas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_comision_esquemas();

-- Asignación por vendedor (en profiles)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS comision_esquema_id uuid REFERENCES public.comision_esquemas(id) ON DELETE SET NULL;

-- Extender pago_comisiones para soportar volumen
ALTER TABLE public.pago_comisiones
  ADD COLUMN IF NOT EXISTS tipo_calculo text NOT NULL DEFAULT 'producto' CHECK (tipo_calculo IN ('producto','volumen')),
  ADD COLUMN IF NOT EXISTS periodo_desde date,
  ADD COLUMN IF NOT EXISTS periodo_hasta date,
  ADD COLUMN IF NOT EXISTS detalle_calculo jsonb;

-- Marca en ventas para no recontar en futuros recibos de volumen
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS comision_volumen_pago_id uuid REFERENCES public.pago_comisiones(id) ON DELETE SET NULL;

-- RPC: calcular comisión por volumen para un vendedor en un rango
CREATE OR REPLACE FUNCTION public.calcular_comision_volumen(
  p_vendedor_id uuid,
  p_desde date,
  p_hasta date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- Validar empresa del caller vs vendedor
  SELECT empresa_id INTO v_caller_empresa FROM public.profiles WHERE user_id = auth.uid();
  SELECT empresa_id INTO v_empresa FROM public.profiles WHERE id = p_vendedor_id;
  IF v_caller_empresa IS NULL OR v_empresa IS NULL OR v_caller_empresa <> v_empresa THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Esquema del vendedor
  SELECT ce.* INTO v_esquema
  FROM public.profiles p
  JOIN public.comision_esquemas ce ON ce.id = p.comision_esquema_id
  WHERE p.id = p_vendedor_id AND ce.activo = true;

  IF v_esquema IS NULL THEN
    RETURN jsonb_build_object('error','sin_esquema');
  END IF;

  -- Recolectar ventas elegibles del periodo (no canceladas, no ya pagadas por volumen)
  IF v_esquema.base = 'cobradas' THEN
    SELECT COALESCE(SUM(v.total),0), COUNT(*), COALESCE(array_agg(v.id),'{}'::uuid[])
      INTO v_total_ventas, v_num_ventas, v_ventas_ids
    FROM public.ventas v
    WHERE v.empresa_id = v_empresa
      AND v.vendedor_id = p_vendedor_id
      AND v.fecha BETWEEN p_desde AND p_hasta
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
      AND v.fecha BETWEEN p_desde AND p_hasta
      AND v.status <> 'cancelado'
      AND COALESCE(v.es_saldo_inicial,false) = false
      AND v.comision_volumen_pago_id IS NULL;
  END IF;

  -- Calcular según tipo
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
  END IF;

  RETURN jsonb_build_object(
    'esquema_id', v_esquema.id,
    'esquema_nombre', v_esquema.nombre,
    'tipo', v_esquema.tipo,
    'periodo', v_esquema.periodo,
    'base', v_esquema.base,
    'total_ventas', v_total_ventas,
    'num_ventas', v_num_ventas,
    'comision', v_comision,
    'pct_aplicado', v_pct,
    'meta_alcanzada', CASE WHEN v_esquema.tipo='bono_meta' THEN (v_total_ventas >= COALESCE((v_esquema.config->>'meta')::numeric,0)) ELSE null END,
    'ventas_ids', to_jsonb(v_ventas_ids)
  );
END;
$$;

-- RPC: generar recibo de volumen
CREATE OR REPLACE FUNCTION public.generar_recibo_volumen(
  p_vendedor_id uuid,
  p_desde date,
  p_hasta date,
  p_fecha_corte date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calc jsonb;
  v_empresa uuid;
  v_pago_id uuid;
  v_ids uuid[];
  v_caller uuid;
BEGIN
  SELECT empresa_id INTO v_caller FROM public.profiles WHERE user_id = auth.uid();
  SELECT empresa_id INTO v_empresa FROM public.profiles WHERE id = p_vendedor_id;
  IF v_caller IS NULL OR v_empresa IS NULL OR v_caller <> v_empresa THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_calc := public.calcular_comision_volumen(p_vendedor_id, p_desde, p_hasta);
  IF v_calc ? 'error' THEN
    RAISE EXCEPTION 'No se pudo calcular: %', v_calc->>'error';
  END IF;
  IF COALESCE((v_calc->>'comision')::numeric,0) <= 0 THEN
    RAISE EXCEPTION 'La comisión calculada es 0';
  END IF;

  INSERT INTO public.pago_comisiones (
    empresa_id, vendedor_id, fecha_corte, total_comisiones, user_id, estado,
    tipo_calculo, periodo_desde, periodo_hasta, detalle_calculo
  ) VALUES (
    v_empresa, p_vendedor_id, p_fecha_corte, (v_calc->>'comision')::numeric, auth.uid(), 'pendiente',
    'volumen', p_desde, p_hasta, v_calc
  ) RETURNING id INTO v_pago_id;

  -- Marcar ventas como ya contadas
  SELECT array_agg((value)::uuid) INTO v_ids
  FROM jsonb_array_elements_text(v_calc->'ventas_ids');
  IF v_ids IS NOT NULL AND array_length(v_ids,1) > 0 THEN
    UPDATE public.ventas SET comision_volumen_pago_id = v_pago_id WHERE id = ANY(v_ids);
  END IF;

  RETURN v_pago_id;
END;
$$;

-- Liberar ventas cuando se cancela un recibo de volumen
CREATE OR REPLACE FUNCTION public.liberar_ventas_recibo_volumen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.tipo_calculo = 'volumen' THEN
    UPDATE public.ventas SET comision_volumen_pago_id = NULL WHERE comision_volumen_pago_id = OLD.id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_liberar_ventas_recibo_volumen ON public.pago_comisiones;
CREATE TRIGGER trg_liberar_ventas_recibo_volumen
  BEFORE DELETE ON public.pago_comisiones
  FOR EACH ROW EXECUTE FUNCTION public.liberar_ventas_recibo_volumen();
