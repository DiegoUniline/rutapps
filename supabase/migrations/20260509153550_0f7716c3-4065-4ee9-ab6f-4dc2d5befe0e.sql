-- Función central para evaluar cobertura real de una empresa
CREATE OR REPLACE FUNCTION public.tiene_cobertura_vigente(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_sub record;
  v_cubierta boolean;
BEGIN
  SELECT status, trial_ends_at, fecha_vencimiento, current_period_end, es_manual
  INTO v_sub
  FROM public.subscriptions
  WHERE empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Manual = siempre cubierta
  IF COALESCE(v_sub.es_manual, false) THEN
    RETURN true;
  END IF;

  -- Trial vigente
  IF v_sub.status = 'trial' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at >= now() THEN
    RETURN true;
  END IF;

  -- Periodo pagado vigente
  IF v_sub.fecha_vencimiento IS NOT NULL AND v_sub.fecha_vencimiento >= v_today THEN
    RETURN true;
  END IF;
  IF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end >= v_today THEN
    RETURN true;
  END IF;

  -- Factura pagada que cubre hoy
  SELECT EXISTS (
    SELECT 1 FROM public.facturas
    WHERE empresa_id = p_empresa_id
      AND estado = 'pagada'
      AND periodo_fin IS NOT NULL
      AND periodo_fin >= v_today
  ) INTO v_cubierta;

  RETURN COALESCE(v_cubierta, false);
END;
$$;

-- Normalizar empresas con factura pagada vigente: que queden activas y con fechas sincronizadas
UPDATE public.subscriptions s
SET status = 'active',
    acceso_bloqueado = false,
    fecha_vencimiento = GREATEST(COALESCE(s.fecha_vencimiento, '1900-01-01'::date), f.periodo_fin),
    current_period_end = GREATEST(COALESCE(s.current_period_end, '1900-01-01'::date), f.periodo_fin),
    updated_at = now()
FROM (
  SELECT empresa_id, MAX(periodo_fin) AS periodo_fin
  FROM public.facturas
  WHERE estado = 'pagada' AND periodo_fin IS NOT NULL
    AND periodo_fin >= (now() AT TIME ZONE 'America/Mexico_City')::date
  GROUP BY empresa_id
) f
WHERE s.empresa_id = f.empresa_id
  AND COALESCE(s.es_manual, false) = false
  AND (
    s.acceso_bloqueado = true
    OR s.status IN ('past_due', 'suspended', 'gracia', 'cancelada')
    OR s.fecha_vencimiento IS NULL
    OR s.fecha_vencimiento < f.periodo_fin
    OR s.current_period_end IS NULL
    OR s.current_period_end < f.periodo_fin
  );