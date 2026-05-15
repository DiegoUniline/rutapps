
-- ===================== PARTNERS =====================
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  nombre text NOT NULL,
  email text,
  telefono text,
  comision_pct numeric(5,2) NOT NULL DEFAULT 20 CHECK (comision_pct >= 0 AND comision_pct <= 100),
  ref_slug text UNIQUE NOT NULL,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partners_user_id ON public.partners(user_id);
CREATE INDEX idx_partners_ref_slug ON public.partners(ref_slug);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner ve sus datos" ON public.partners
  FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin gestiona partners" ON public.partners
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Partner actualiza notas/contacto" ON public.partners
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER set_updated_at_partners
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: who is the current partner?
CREATE OR REPLACE FUNCTION public.get_my_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.partners WHERE user_id = auth.uid() LIMIT 1; $$;

-- ===================== CUPONES.partner_id =====================
ALTER TABLE public.cupones ADD COLUMN partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
CREATE INDEX idx_cupones_partner_id ON public.cupones(partner_id);

-- Permitir que el partner gestione SUS cupones
CREATE POLICY "Partner ve sus cupones" ON public.cupones
  FOR SELECT USING (partner_id = public.get_my_partner_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Partner crea sus cupones" ON public.cupones
  FOR INSERT WITH CHECK (partner_id = public.get_my_partner_id());
CREATE POLICY "Partner edita sus cupones" ON public.cupones
  FOR UPDATE USING (partner_id = public.get_my_partner_id())
  WITH CHECK (partner_id = public.get_my_partner_id());
CREATE POLICY "Partner elimina sus cupones" ON public.cupones
  FOR DELETE USING (partner_id = public.get_my_partner_id());

-- ===================== ATRIBUCIONES =====================
CREATE TABLE public.partner_atribuciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  cupon_id uuid REFERENCES public.cupones(id) ON DELETE SET NULL,
  ref_slug text,
  metodo text NOT NULL CHECK (metodo IN ('link','cupon','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_atrib_partner ON public.partner_atribuciones(partner_id);

ALTER TABLE public.partner_atribuciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partner ve sus atribuciones" ON public.partner_atribuciones
  FOR SELECT USING (partner_id = public.get_my_partner_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin gestiona atribuciones" ON public.partner_atribuciones
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- ===================== COMISIONES =====================
CREATE TABLE public.partner_comisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  factura_id uuid UNIQUE REFERENCES public.facturas(id) ON DELETE SET NULL,
  periodo text NOT NULL,
  monto_factura numeric(12,2) NOT NULL DEFAULT 0,
  partner_pct numeric(5,2) NOT NULL,
  cupon_pct numeric(5,2) NOT NULL DEFAULT 0,
  monto_comision numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','pagada','anulada')),
  pagado_en timestamptz,
  pago_id uuid,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_com_partner ON public.partner_comisiones(partner_id, status);
CREATE INDEX idx_partner_com_empresa ON public.partner_comisiones(empresa_id);

ALTER TABLE public.partner_comisiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partner ve sus comisiones" ON public.partner_comisiones
  FOR SELECT USING (partner_id = public.get_my_partner_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin gestiona comisiones" ON public.partner_comisiones
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- ===================== PAGOS A PARTNERS =====================
CREATE TABLE public.partner_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  monto numeric(12,2) NOT NULL,
  metodo text,
  referencia text,
  notas text,
  pagado_por uuid,
  pagado_en timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_pagos_partner ON public.partner_pagos(partner_id);

ALTER TABLE public.partner_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partner ve sus pagos" ON public.partner_pagos
  FOR SELECT USING (partner_id = public.get_my_partner_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin gestiona pagos" ON public.partner_pagos
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- ===================== TRIGGER: generar comisión al pagar factura =====================
CREATE OR REPLACE FUNCTION public.generar_comision_partner_factura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_atrib RECORD;
  v_partner RECORD;
  v_cupon_pct numeric := 0;
  v_pct_neto numeric;
  v_comision numeric;
  v_periodo text;
BEGIN
  -- Solo cuando una factura pasa a 'pagada'
  IF NEW.estado <> 'pagada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pagada' THEN RETURN NEW; END IF;

  -- Evitar duplicados
  IF EXISTS (SELECT 1 FROM public.partner_comisiones WHERE factura_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_atrib FROM public.partner_atribuciones WHERE empresa_id = NEW.empresa_id;
  IF v_atrib IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = v_atrib.partner_id;
  IF v_partner IS NULL OR v_partner.estado <> 'activo' THEN RETURN NEW; END IF;

  IF v_atrib.cupon_id IS NOT NULL THEN
    SELECT COALESCE(descuento_pct, 0) INTO v_cupon_pct FROM public.cupones WHERE id = v_atrib.cupon_id;
  END IF;

  v_pct_neto := GREATEST(v_partner.comision_pct - v_cupon_pct, 0);
  v_comision := ROUND(COALESCE(NEW.total, 0) * v_pct_neto / 100, 2);
  v_periodo := to_char(COALESCE(NEW.periodo_inicio, CURRENT_DATE), 'YYYY-MM');

  INSERT INTO public.partner_comisiones (
    partner_id, empresa_id, factura_id, periodo,
    monto_factura, partner_pct, cupon_pct, monto_comision, status
  ) VALUES (
    v_partner.id, NEW.empresa_id, NEW.id, v_periodo,
    COALESCE(NEW.total, 0), v_partner.comision_pct, v_cupon_pct, v_comision, 'pendiente'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_factura_partner_comision
  AFTER INSERT OR UPDATE OF estado ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.generar_comision_partner_factura();

-- ===================== RPC: registrar pago a partner =====================
CREATE OR REPLACE FUNCTION public.pagar_comisiones_partner(
  p_partner_id uuid,
  p_monto numeric,
  p_metodo text DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_comision_ids uuid[] DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pago_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar pagos';
  END IF;

  INSERT INTO public.partner_pagos (partner_id, monto, metodo, referencia, notas, pagado_por)
  VALUES (p_partner_id, p_monto, p_metodo, p_referencia, p_notas, auth.uid())
  RETURNING id INTO v_pago_id;

  IF p_comision_ids IS NOT NULL AND array_length(p_comision_ids, 1) > 0 THEN
    UPDATE public.partner_comisiones
    SET status = 'pagada', pagado_en = now(), pago_id = v_pago_id
    WHERE id = ANY(p_comision_ids) AND partner_id = p_partner_id AND status = 'pendiente';
  END IF;

  RETURN v_pago_id;
END;
$$;

-- ===================== RPC: aplicar atribución desde signup =====================
CREATE OR REPLACE FUNCTION public.aplicar_partner_referido(
  p_empresa_id uuid,
  p_ref_slug text DEFAULT NULL,
  p_cupon_codigo text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partner RECORD;
  v_cupon RECORD;
  v_metodo text;
BEGIN
  -- Idempotente
  IF EXISTS (SELECT 1 FROM public.partner_atribuciones WHERE empresa_id = p_empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ya_atribuida');
  END IF;

  -- Buscar cupón si viene
  IF p_cupon_codigo IS NOT NULL AND length(trim(p_cupon_codigo)) > 0 THEN
    SELECT * INTO v_cupon FROM public.cupones
    WHERE upper(codigo) = upper(trim(p_cupon_codigo)) AND activo = true
      AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURRENT_DATE)
      AND (vigencia_fin IS NULL OR vigencia_fin >= CURRENT_DATE);
  END IF;

  -- Resolver partner: por slug primero, si no por cupón
  IF p_ref_slug IS NOT NULL AND length(trim(p_ref_slug)) > 0 THEN
    SELECT * INTO v_partner FROM public.partners
    WHERE lower(ref_slug) = lower(trim(p_ref_slug)) AND estado = 'activo';
    v_metodo := 'link';
  END IF;

  IF v_partner IS NULL AND v_cupon.partner_id IS NOT NULL THEN
    SELECT * INTO v_partner FROM public.partners WHERE id = v_cupon.partner_id AND estado = 'activo';
    v_metodo := 'cupon';
  END IF;

  IF v_partner IS NULL THEN
    -- Igual aplicamos cupón si existe (uso normal sin partner)
    IF v_cupon.id IS NOT NULL THEN
      INSERT INTO public.cupon_usos (cupon_id, empresa_id, meses_restantes)
      VALUES (v_cupon.id, p_empresa_id, v_cupon.meses_duracion)
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('ok', true, 'partner', false, 'cupon_aplicado', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'sin_partner');
  END IF;

  INSERT INTO public.partner_atribuciones (empresa_id, partner_id, cupon_id, ref_slug, metodo)
  VALUES (p_empresa_id, v_partner.id, v_cupon.id, p_ref_slug, v_metodo);

  IF v_cupon.id IS NOT NULL THEN
    INSERT INTO public.cupon_usos (cupon_id, empresa_id, meses_restantes)
    VALUES (v_cupon.id, p_empresa_id, v_cupon.meses_duracion)
    ON CONFLICT DO NOTHING;
    UPDATE public.cupones SET usos_actuales = COALESCE(usos_actuales, 0) + 1 WHERE id = v_cupon.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'partner_id', v_partner.id, 'partner_nombre', v_partner.nombre, 'cupon_aplicado', v_cupon.id IS NOT NULL);
END;
$$;

-- Permite ejecutar la RPC desde signup público (anon)
GRANT EXECUTE ON FUNCTION public.aplicar_partner_referido(uuid, text, text) TO anon, authenticated;

-- ===================== VISTA: resumen por partner =====================
CREATE OR REPLACE VIEW public.partner_resumen AS
SELECT
  p.id as partner_id,
  p.nombre,
  p.comision_pct,
  p.estado,
  p.ref_slug,
  (SELECT COUNT(*) FROM public.partner_atribuciones a WHERE a.partner_id = p.id) AS empresas_referidas,
  (SELECT COALESCE(SUM(monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id) AS total_generado,
  (SELECT COALESCE(SUM(monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id AND c.status = 'pagada') AS total_pagado,
  (SELECT COALESCE(SUM(monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id AND c.status = 'pendiente') AS saldo_pendiente
FROM public.partners p;

GRANT SELECT ON public.partner_resumen TO authenticated;
