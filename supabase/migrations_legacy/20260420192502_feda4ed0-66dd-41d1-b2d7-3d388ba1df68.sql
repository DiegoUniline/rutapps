-- Tabla para registrar packs de recargas comprados
CREATE TABLE IF NOT EXISTS public.optimizacion_recargas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  cantidad_creditos INTEGER NOT NULL DEFAULT 100,
  creditos_consumidos INTEGER NOT NULL DEFAULT 0,
  monto_centavos INTEGER NOT NULL DEFAULT 14900,
  moneda TEXT NOT NULL DEFAULT 'mxn',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opt_recargas_empresa ON public.optimizacion_recargas(empresa_id, status);

ALTER TABLE public.optimizacion_recargas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven recargas de su empresa"
  ON public.optimizacion_recargas FOR SELECT
  USING (
    empresa_id IN (
      SELECT p.empresa_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
  );

-- Función que calcula la cuota mensual de optimizaciones para una empresa
CREATE OR REPLACE FUNCTION public.get_optimization_quota(_empresa_id UUID)
RETURNS TABLE (
  usuarios_activos INTEGER,
  cuota_base INTEGER,
  recargas_disponibles INTEGER,
  cuota_total INTEGER,
  usadas_mes_actual INTEGER,
  disponibles INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuarios INTEGER;
  v_base INTEGER;
  v_recargas INTEGER;
  v_usadas INTEGER;
  v_first_of_month TIMESTAMPTZ;
BEGIN
  v_first_of_month := date_trunc('month', now());

  SELECT COUNT(*)::INTEGER INTO v_usuarios
  FROM public.profiles
  WHERE empresa_id = _empresa_id AND activo = true;

  v_base := COALESCE(v_usuarios, 0) * 30;

  SELECT COALESCE(SUM(cantidad_creditos - creditos_consumidos), 0)::INTEGER INTO v_recargas
  FROM public.optimizacion_recargas
  WHERE empresa_id = _empresa_id
    AND status = 'paid'
    AND cantidad_creditos > creditos_consumidos;

  SELECT COUNT(*)::INTEGER INTO v_usadas
  FROM public.optimizacion_rutas_log
  WHERE empresa_id = _empresa_id
    AND created_at >= v_first_of_month;

  RETURN QUERY SELECT
    v_usuarios,
    v_base,
    v_recargas,
    v_base + v_recargas,
    v_usadas,
    GREATEST(0, (v_base + v_recargas) - v_usadas);
END;
$$;