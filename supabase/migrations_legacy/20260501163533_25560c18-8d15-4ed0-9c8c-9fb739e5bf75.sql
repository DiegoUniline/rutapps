-- Campos de control de acceso billing
ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS acceso_bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_checkout_session_id text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_fecha_vencimiento ON public.subscriptions(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_subscriptions_acceso_bloqueado ON public.subscriptions(acceso_bloqueado);

-- Función para verificar si una empresa tiene acceso al sistema
-- Reglas:
--  * trial activo = acceso
--  * fecha_vencimiento >= hoy = acceso
--  * fecha_vencimiento < hoy + 3 días de gracia automática del MES SIGUIENTE = acceso
--    (días 1, 2, 3 del mes siguiente al vencimiento aún tienen acceso)
--  * acceso_bloqueado = true => sin acceso (sobrescribe todo, lo pone el cron día 4+)
CREATE OR REPLACE FUNCTION public.has_billing_access(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_today date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_day_of_month int := EXTRACT(DAY FROM v_today)::int;
BEGIN
  -- Super admin always has access
  IF public.is_super_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  SELECT status, trial_ends_at, fecha_vencimiento, acceso_bloqueado, es_manual
  INTO v_sub
  FROM public.subscriptions
  WHERE empresa_id = p_empresa_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Manual subscriptions skip billing checks
  IF v_sub.es_manual = true THEN RETURN true; END IF;

  -- Hard block (set by cron on day 4+)
  IF v_sub.acceso_bloqueado = true THEN RETURN false; END IF;

  -- Active trial
  IF v_sub.status = 'trial' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at >= now() THEN
    RETURN true;
  END IF;

  -- Within paid period
  IF v_sub.fecha_vencimiento IS NOT NULL AND v_sub.fecha_vencimiento >= v_today THEN
    RETURN true;
  END IF;

  -- Grace period: days 1-3 of any month always allowed if vencimiento was last month or earlier
  IF v_day_of_month <= 3 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_billing_access(uuid) TO authenticated, anon;