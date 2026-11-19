-- Tabla de niveles
CREATE TABLE public.partner_niveles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  orden int NOT NULL UNIQUE,
  empresas_min int NOT NULL,
  empresas_max int,
  comision_pct numeric NOT NULL,
  emoji text,
  color text,
  bono_mxn numeric DEFAULT 0,
  beneficios text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_niveles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Niveles públicos" ON public.partner_niveles FOR SELECT USING (true);
CREATE POLICY "Solo super admin gestiona niveles" ON public.partner_niveles
  FOR ALL USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Seed inicial
INSERT INTO public.partner_niveles (nombre, orden, empresas_min, empresas_max, comision_pct, emoji, color, bono_mxn, beneficios) VALUES
('Starter', 1, 0, 4,    10, '🥉', '#CD7F32', 0,    ARRAY['Link único de referido','Cupones básicos','Panel completo']),
('Growth',  2, 5, 14,   15, '🥈', '#9CA3AF', 0,    ARRAY['Soporte prioritario','Materiales de marketing','Todo lo de Starter']),
('Pro',     3, 15, 29,  20, '🥇', '#FCD34D', 500,  ARRAY['Demo personalizada para tus prospectos','Co-branding','Todo lo de Growth']),
('Elite',   4, 30, 59,  25, '💎', '#06B6D4', 1500, ARRAY['Manager dedicado','Casos de éxito publicados','Todo lo de Pro']),
('Legend',  5, 60, NULL,30, '👑', '#A855F7', 5000, ARRAY['Revenue share extendido','Early access a features','Todo lo de Elite']);

-- Columnas para período de gracia
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS peor_nivel_pct_60d numeric,
  ADD COLUMN IF NOT EXISTS peor_nivel_fecha timestamptz;

-- Cuenta empresas activas del partner
CREATE OR REPLACE FUNCTION public.get_partner_active_empresas(_partner_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(DISTINCT pa.empresa_id)::int
  FROM public.partner_atribuciones pa
  JOIN public.subscriptions s ON s.empresa_id = pa.empresa_id
  WHERE pa.partner_id = _partner_id
    AND s.status IN ('active','trialing','past_due');
$$;

-- Devuelve el nivel actual del partner según empresas activas
CREATE OR REPLACE FUNCTION public.get_partner_nivel(_partner_id uuid)
RETURNS TABLE(
  nivel_id uuid, nombre text, orden int, comision_pct numeric,
  empresas_min int, empresas_max int, emoji text, color text,
  empresas_actuales int, empresas_para_siguiente int,
  siguiente_nombre text, siguiente_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
  v_partner RECORD;
  v_nivel RECORD;
  v_pct_efectivo numeric;
  v_siguiente RECORD;
BEGIN
  v_count := public.get_partner_active_empresas(_partner_id);
  SELECT * INTO v_partner FROM public.partners WHERE id = _partner_id;

  -- Nivel base por empresas
  SELECT * INTO v_nivel FROM public.partner_niveles
  WHERE empresas_min <= v_count
    AND (empresas_max IS NULL OR empresas_max >= v_count)
  ORDER BY orden DESC LIMIT 1;

  -- Aplicar período de gracia: si tiene peor_nivel_pct_60d vigente y es mayor, usar ese
  v_pct_efectivo := v_nivel.comision_pct;
  IF v_partner.peor_nivel_pct_60d IS NOT NULL
     AND v_partner.peor_nivel_fecha > NOW() - INTERVAL '60 days'
     AND v_partner.peor_nivel_pct_60d > v_pct_efectivo THEN
    v_pct_efectivo := v_partner.peor_nivel_pct_60d;
  END IF;

  -- Siguiente nivel
  SELECT * INTO v_siguiente FROM public.partner_niveles
  WHERE orden > v_nivel.orden ORDER BY orden ASC LIMIT 1;

  RETURN QUERY SELECT
    v_nivel.id, v_nivel.nombre, v_nivel.orden, v_pct_efectivo,
    v_nivel.empresas_min, v_nivel.empresas_max, v_nivel.emoji, v_nivel.color,
    v_count,
    CASE WHEN v_siguiente.empresas_min IS NULL THEN 0 ELSE GREATEST(v_siguiente.empresas_min - v_count, 0) END,
    v_siguiente.nombre, v_siguiente.comision_pct;
END;
$$;

-- Trigger actualizado: usa el % del nivel actual
CREATE OR REPLACE FUNCTION public.generar_comision_partner_factura()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_atrib RECORD;
  v_partner RECORD;
  v_cupon_pct numeric := 0;
  v_nivel RECORD;
  v_partner_pct numeric;
  v_pct_neto numeric;
  v_comision numeric;
  v_periodo text;
BEGIN
  IF NEW.estado <> 'pagada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pagada' THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.partner_comisiones WHERE factura_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_atrib FROM public.partner_atribuciones WHERE empresa_id = NEW.empresa_id;
  IF v_atrib IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = v_atrib.partner_id;
  IF v_partner IS NULL OR v_partner.estado <> 'activo' THEN RETURN NEW; END IF;

  -- Obtener % del nivel actual
  SELECT * INTO v_nivel FROM public.get_partner_nivel(v_partner.id);
  v_partner_pct := COALESCE(v_nivel.comision_pct, v_partner.comision_pct, 10);

  IF v_atrib.cupon_id IS NOT NULL THEN
    SELECT COALESCE(descuento_pct, 0) INTO v_cupon_pct FROM public.cupones WHERE id = v_atrib.cupon_id;
  END IF;

  v_pct_neto := GREATEST(v_partner_pct - v_cupon_pct, 0);
  v_comision := ROUND(COALESCE(NEW.total, 0) * v_pct_neto / 100, 2);
  v_periodo := to_char(COALESCE(NEW.periodo_inicio, CURRENT_DATE), 'YYYY-MM');

  INSERT INTO public.partner_comisiones (
    partner_id, empresa_id, factura_id, periodo,
    monto_factura, partner_pct, cupon_pct, monto_comision, status
  ) VALUES (
    v_partner.id, NEW.empresa_id, NEW.id, v_periodo,
    COALESCE(NEW.total, 0), v_partner_pct, v_cupon_pct, v_comision, 'pendiente'
  );

  RETURN NEW;
END;
$$;