-- Programa de Partners: consistencia entre reglas publicadas, cálculo y auditoría.
-- Los bonos de nivel son únicos: se generan una vez al alcanzar por primera vez
-- cada nivel con bono, nunca de forma mensual.

ALTER TABLE public.partner_solicitudes
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;

ALTER TABLE public.partner_solicitudes
  DROP CONSTRAINT IF EXISTS partner_solicitudes_pending_terms_check;
ALTER TABLE public.partner_solicitudes
  ADD CONSTRAINT partner_solicitudes_pending_terms_check
  CHECK (status <> 'pending' OR (terms_accepted_at IS NOT NULL AND terms_version IS NOT NULL)) NOT VALID;

CREATE OR REPLACE FUNCTION public.partner_solicitud_stamp_terms()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.terms_version IS NOT NULL THEN NEW.terms_accepted_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_solicitud_stamp_terms ON public.partner_solicitudes;
CREATE TRIGGER trg_partner_solicitud_stamp_terms
  BEFORE INSERT ON public.partner_solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.partner_solicitud_stamp_terms();

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS tipo_persona text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS clabe text,
  ADD COLUMN IF NOT EXISTS contrato_firmado_at date,
  ADD COLUMN IF NOT EXISTS contrato_referencia text,
  ADD COLUMN IF NOT EXISTS nivel_base_id_snapshot uuid REFERENCES public.partner_niveles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nivel_base_pct_snapshot numeric,
  ADD COLUMN IF NOT EXISTS nivel_revisado_at timestamptz;

-- La política histórica permitía al partner modificar cualquier columna de su
-- fila (incluidos porcentaje y gracia). Se elimina; el contacto se actualiza por
-- una RPC de campos permitidos.
DROP POLICY IF EXISTS "Partner actualiza notas/contacto" ON public.partners;

CREATE OR REPLACE FUNCTION public.actualizar_mi_partner_contacto(
  _telefono text DEFAULT NULL,
  _notas text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.partners
  SET telefono = NULLIF(trim(_telefono), ''), notas = NULLIF(trim(_notas), '')
  WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner no encontrado'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_partner_contacto(text, text) TO authenticated;

ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_rfc_format_check;
ALTER TABLE public.partners
  ADD CONSTRAINT partners_rfc_format_check
  CHECK (rfc IS NULL OR upper(rfc) ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$');

ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_clabe_format_check;
ALTER TABLE public.partners
  ADD CONSTRAINT partners_clabe_format_check
  CHECK (clabe IS NULL OR clabe ~ '^[0-9]{18}$');

ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_tipo_persona_check;
ALTER TABLE public.partners
  ADD CONSTRAINT partners_tipo_persona_check
  CHECK (tipo_persona IS NULL OR tipo_persona IN ('fisica', 'moral'));

ALTER TABLE public.partner_comisiones
  ALTER COLUMN empresa_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'recurrente',
  ADD COLUMN IF NOT EXISTS nivel_id uuid REFERENCES public.partner_niveles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empresas_activas_snapshot integer,
  ADD COLUMN IF NOT EXISTS regla_version text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.partner_comisiones
  DROP CONSTRAINT IF EXISTS partner_comisiones_tipo_check;
ALTER TABLE public.partner_comisiones
  ADD CONSTRAINT partner_comisiones_tipo_check
  CHECK (tipo IN ('recurrente', 'bono_nivel'));

ALTER TABLE public.partner_comisiones
  DROP CONSTRAINT IF EXISTS partner_comisiones_origen_check;
ALTER TABLE public.partner_comisiones
  ADD CONSTRAINT partner_comisiones_origen_check
  CHECK (
    (tipo = 'recurrente' AND empresa_id IS NOT NULL AND factura_id IS NOT NULL)
    OR (tipo = 'bono_nivel' AND nivel_id IS NOT NULL AND factura_id IS NULL)
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS partner_comisiones_bono_nivel_unique
  ON public.partner_comisiones(partner_id, nivel_id)
  WHERE tipo = 'bono_nivel';

-- Para metas sólo cuentan suscripciones realmente activas y con acceso vigente.
CREATE OR REPLACE FUNCTION public.get_partner_active_empresas(_partner_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(DISTINCT pa.empresa_id)::int
  FROM public.partner_atribuciones pa
  WHERE pa.partner_id = _partner_id
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.empresa_id = pa.empresa_id
        AND s.status = 'active'
        AND COALESCE(s.acceso_bloqueado, false) = false
    );
$$;

-- La función histórica usaba nombres de columnas sin alias. Como RETURNS TABLE
-- crea variables PL/pgSQL con esos mismos nombres, PostgreSQL podía interpretar
-- empresas_min, empresas_max y orden de dos formas. Todos los campos quedan
-- calificados para eliminar la ambigüedad.
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
  v_partner record;
  v_nivel record;
  v_pct_efectivo numeric;
  v_siguiente record;
BEGIN
  v_count := public.get_partner_active_empresas(_partner_id);

  SELECT p.* INTO v_partner
  FROM public.partners p
  WHERE p.id = _partner_id;

  SELECT pn.* INTO v_nivel
  FROM public.partner_niveles pn
  WHERE pn.empresas_min <= v_count
    AND (pn.empresas_max IS NULL OR pn.empresas_max >= v_count)
  ORDER BY pn.orden DESC
  LIMIT 1;

  IF v_nivel.id IS NULL THEN
    RETURN;
  END IF;

  v_pct_efectivo := v_nivel.comision_pct;
  IF v_partner.peor_nivel_pct_60d IS NOT NULL
     AND v_partner.peor_nivel_fecha > now() - interval '60 days'
     AND v_partner.peor_nivel_pct_60d > v_pct_efectivo THEN
    v_pct_efectivo := v_partner.peor_nivel_pct_60d;
  END IF;

  SELECT pn.* INTO v_siguiente
  FROM public.partner_niveles pn
  WHERE pn.orden > v_nivel.orden
  ORDER BY pn.orden ASC
  LIMIT 1;

  RETURN QUERY SELECT
    v_nivel.id,
    v_nivel.nombre,
    v_nivel.orden,
    v_pct_efectivo,
    v_nivel.empresas_min,
    v_nivel.empresas_max,
    v_nivel.emoji,
    v_nivel.color,
    v_count,
    CASE
      WHEN v_siguiente.empresas_min IS NULL THEN 0
      ELSE GREATEST(v_siguiente.empresas_min - v_count, 0)
    END,
    v_siguiente.nombre,
    v_siguiente.comision_pct;
END;
$$;

-- Tope autoritativo de cupón. Usa el nivel efectivo, incluida la gracia de 60 días.
CREATE OR REPLACE FUNCTION public.get_partner_coupon_cap(_partner_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT n.comision_pct FROM public.get_partner_nivel(_partner_id) n LIMIT 1),
    (SELECT p.comision_pct FROM public.partners p WHERE p.id = _partner_id),
    0
  );
$$;

-- Mantiene 60 días el mejor porcentaje cuando cae el número de empresas. El
-- snapshot guarda el nivel base (sin gracia) de la revisión anterior.
CREATE OR REPLACE FUNCTION public.recalcular_nivel_partner(_partner_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_level public.partner_niveles%ROWTYPE;
  v_count integer;
  v_protected_pct numeric;
BEGIN
  SELECT * INTO v_partner FROM public.partners WHERE id = _partner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_count := public.get_partner_active_empresas(_partner_id);
  SELECT * INTO v_level
  FROM public.partner_niveles
  WHERE empresas_min <= v_count AND (empresas_max IS NULL OR empresas_max >= v_count)
  ORDER BY orden DESC LIMIT 1;

  v_protected_pct := CASE
    WHEN v_partner.peor_nivel_fecha > now() - interval '60 days'
      THEN v_partner.peor_nivel_pct_60d
    ELSE NULL
  END;

  IF v_partner.nivel_base_pct_snapshot IS NOT NULL
     AND v_level.comision_pct < v_partner.nivel_base_pct_snapshot THEN
    v_protected_pct := GREATEST(v_partner.nivel_base_pct_snapshot, COALESCE(v_protected_pct, 0));
    UPDATE public.partners SET
      peor_nivel_pct_60d = v_protected_pct,
      peor_nivel_fecha = now()
    WHERE id = _partner_id;
  ELSIF v_protected_pct IS NOT NULL AND v_level.comision_pct >= v_protected_pct THEN
    UPDATE public.partners SET peor_nivel_pct_60d = NULL, peor_nivel_fecha = NULL
    WHERE id = _partner_id;
  END IF;

  UPDATE public.partners SET
    nivel_base_id_snapshot = v_level.id,
    nivel_base_pct_snapshot = v_level.comision_pct,
    nivel_revisado_at = now()
  WHERE id = _partner_id;

  RETURN GREATEST(v_level.comision_pct, COALESCE(v_protected_pct, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.recalcular_nivel_partner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_nivel_partner(uuid) TO service_role;

-- Estado inicial: no dispara gracia artificial al desplegar.
UPDATE public.partners p SET
  nivel_base_id_snapshot = n.id,
  nivel_base_pct_snapshot = n.comision_pct,
  nivel_revisado_at = now()
FROM public.partner_niveles n
WHERE n.empresas_min <= public.get_partner_active_empresas(p.id)
  AND (n.empresas_max IS NULL OR n.empresas_max >= public.get_partner_active_empresas(p.id));

CREATE OR REPLACE FUNCTION public.validar_cupon_partner_pct()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_max numeric;
BEGIN
  IF NEW.partner_id IS NULL OR COALESCE(NEW.activo, true) = false THEN
    RETURN NEW;
  END IF;

  v_max := public.get_partner_coupon_cap(NEW.partner_id);
  IF COALESCE(NEW.descuento_pct, 0) > v_max THEN
    RAISE EXCEPTION 'El descuento del cupón (%) no puede superar la comisión vigente del partner (%)',
      NEW.descuento_pct, v_max USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cupon_partner_pct ON public.cupones;
CREATE TRIGGER trg_validar_cupon_partner_pct
  BEFORE INSERT OR UPDATE OF partner_id, descuento_pct, activo ON public.cupones
  FOR EACH ROW EXECUTE FUNCTION public.validar_cupon_partner_pct();

CREATE OR REPLACE FUNCTION public.desactivar_cupones_partner_fuera_limite(_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.cupones
  SET activo = false
  WHERE partner_id = _partner_id
    AND activo = true
    AND descuento_pct > public.get_partner_coupon_cap(_partner_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Desactiva cupones heredados que ya excedan el nivel efectivo.
DO $$
DECLARE v_partner_id uuid;
BEGIN
  FOR v_partner_id IN SELECT id FROM public.partners LOOP
    PERFORM public.desactivar_cupones_partner_fuera_limite(v_partner_id);
  END LOOP;
END $$;

-- Genera una sola vez los bonos de todos los niveles alcanzados. Si alguien salta
-- de Growth a Elite, conserva tanto el bono Pro como el bono Elite.
CREATE OR REPLACE FUNCTION public.generar_bonos_partner(_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nivel record;
  v_insertados integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.partners
    WHERE id = _partner_id AND estado = 'activo'
  ) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_nivel FROM public.get_partner_nivel(_partner_id) LIMIT 1;
  IF v_nivel.nivel_id IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.partner_comisiones (
    partner_id, empresa_id, factura_id, periodo, monto_factura,
    partner_pct, cupon_pct, monto_comision, status, notas,
    tipo, nivel_id, empresas_activas_snapshot, regla_version
  )
  SELECT
    _partner_id, NULL, NULL, to_char(CURRENT_DATE, 'YYYY-MM'), 0,
    n.comision_pct, 0, n.bono_mxn, 'pendiente',
    'Bono único por alcanzar el nivel ' || n.nombre,
    'bono_nivel', n.id, v_nivel.empresas_actuales, 'partner-v2-2026-09-07'
  FROM public.partner_niveles n
  WHERE n.orden <= v_nivel.orden
    AND COALESCE(n.bono_mxn, 0) > 0
  ON CONFLICT (partner_id, nivel_id) WHERE tipo = 'bono_nivel' DO NOTHING;

  GET DIAGNOSTICS v_insertados = ROW_COUNT;
  RETURN v_insertados;
END;
$$;
REVOKE ALL ON FUNCTION public.generar_bonos_partner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_bonos_partner(uuid) TO service_role;

-- Comisión por factura pagada con instantánea de la regla que se aplicó.
CREATE OR REPLACE FUNCTION public.generar_comision_partner_factura()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_atrib record;
  v_partner record;
  v_cupon_pct numeric := 0;
  v_nivel record;
  v_partner_pct numeric;
  v_pct_neto numeric;
  v_comision numeric;
  v_periodo text;
BEGIN
  IF NEW.estado <> 'pagada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pagada' THEN RETURN NEW; END IF;

  SELECT * INTO v_atrib FROM public.partner_atribuciones WHERE empresa_id = NEW.empresa_id;
  IF v_atrib IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = v_atrib.partner_id;
  IF v_partner IS NULL OR v_partner.estado <> 'activo' THEN RETURN NEW; END IF;

  SELECT * INTO v_nivel FROM public.get_partner_nivel(v_partner.id) LIMIT 1;
  v_partner_pct := COALESCE(v_nivel.comision_pct, v_partner.comision_pct, 10);

  IF v_atrib.cupon_id IS NOT NULL THEN
    SELECT COALESCE(descuento_pct, 0) INTO v_cupon_pct
    FROM public.cupones WHERE id = v_atrib.cupon_id;
  END IF;

  -- Defensa adicional para datos heredados: nunca se registra un cupón superior
  -- al porcentaje que el partner puede ganar.
  v_cupon_pct := LEAST(COALESCE(v_cupon_pct, 0), v_partner_pct);
  v_pct_neto := v_partner_pct - v_cupon_pct;
  v_comision := ROUND(COALESCE(NEW.total, 0) * v_pct_neto / 100, 2);
  v_periodo := to_char(COALESCE(NEW.periodo_inicio, CURRENT_DATE), 'YYYY-MM');

  INSERT INTO public.partner_comisiones (
    partner_id, empresa_id, factura_id, periodo,
    monto_factura, partner_pct, cupon_pct, monto_comision, status,
    tipo, nivel_id, empresas_activas_snapshot, regla_version
  ) VALUES (
    v_partner.id, NEW.empresa_id, NEW.id, v_periodo,
    COALESCE(NEW.total, 0), v_partner_pct, v_cupon_pct, v_comision, 'pendiente',
    'recurrente', v_nivel.nivel_id, v_nivel.empresas_actuales, 'partner-v2-2026-09-07'
  )
  ON CONFLICT (factura_id) DO NOTHING;

  PERFORM public.generar_bonos_partner(v_partner.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_partner_reglas_por_suscripcion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_partner_id uuid;
BEGIN
  v_empresa_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END;
  SELECT partner_id INTO v_partner_id
  FROM public.partner_atribuciones WHERE empresa_id = v_empresa_id;
  IF v_partner_id IS NOT NULL THEN
    PERFORM public.recalcular_nivel_partner(v_partner_id);
    PERFORM public.desactivar_cupones_partner_fuera_limite(v_partner_id);
    PERFORM public.generar_bonos_partner(v_partner_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_reglas_suscripcion ON public.subscriptions;
CREATE TRIGGER trg_sync_partner_reglas_suscripcion
  AFTER INSERT OR UPDATE OF status, acceso_bloqueado OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_partner_reglas_por_suscripcion();

-- Pago atómico: el monto capturado debe coincidir con las comisiones elegidas.
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
  v_total numeric;
  v_count integer;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar pagos';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;
  IF p_monto < 500 AND EXISTS (
    SELECT 1 FROM public.partners WHERE id = p_partner_id AND estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'El pago mínimo para un partner activo es $500 MXN';
  END IF;
  IF lower(COALESCE(p_metodo, '')) LIKE '%transfer%'
     AND NULLIF(trim(COALESCE(p_referencia, '')), '') IS NULL THEN
    RAISE EXCEPTION 'La referencia bancaria es obligatoria para una transferencia';
  END IF;
  IF p_comision_ids IS NULL OR COALESCE(array_length(p_comision_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una comisión pendiente';
  END IF;

  -- Bloqueo primero; PostgreSQL no permite FOR UPDATE sobre un agregado.
  PERFORM id
  FROM public.partner_comisiones
  WHERE id = ANY(p_comision_ids)
    AND partner_id = p_partner_id
    AND status = 'pendiente'
  FOR UPDATE;

  SELECT COUNT(*), COALESCE(SUM(monto_comision), 0)
  INTO v_count, v_total
  FROM public.partner_comisiones
  WHERE id = ANY(p_comision_ids)
    AND partner_id = p_partner_id
    AND status = 'pendiente';

  IF v_count <> array_length(p_comision_ids, 1) THEN
    RAISE EXCEPTION 'Una o más comisiones ya no están pendientes';
  END IF;
  IF abs(v_total - p_monto) > 0.01 THEN
    RAISE EXCEPTION 'El monto (%) debe coincidir con el total seleccionado (%)', p_monto, v_total;
  END IF;

  INSERT INTO public.partner_pagos (partner_id, monto, metodo, referencia, notas, pagado_por)
  VALUES (p_partner_id, v_total, p_metodo, p_referencia, p_notas, auth.uid())
  RETURNING id INTO v_pago_id;

  UPDATE public.partner_comisiones
  SET status = 'pagada', pagado_en = now(), pago_id = v_pago_id
  WHERE id = ANY(p_comision_ids)
    AND partner_id = p_partner_id
    AND status = 'pendiente';

  RETURN v_pago_id;
END;
$$;

-- La atribución rechaza en servidor cupones incompatibles con el nivel actual.
CREATE OR REPLACE FUNCTION public.aplicar_partner_referido(
  p_empresa_id uuid,
  p_ref_slug text DEFAULT NULL,
  p_cupon_codigo text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_cupon public.cupones%ROWTYPE;
  v_metodo text;
  v_max numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.partner_atribuciones WHERE empresa_id = p_empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ya_atribuida');
  END IF;

  IF NULLIF(trim(p_cupon_codigo), '') IS NOT NULL THEN
    SELECT * INTO v_cupon FROM public.cupones
    WHERE upper(codigo) = upper(trim(p_cupon_codigo)) AND activo = true
      AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURRENT_DATE)
      AND (vigencia_fin IS NULL OR vigencia_fin >= CURRENT_DATE)
    LIMIT 1;
  END IF;

  IF NULLIF(trim(p_ref_slug), '') IS NOT NULL THEN
    SELECT * INTO v_partner FROM public.partners
    WHERE lower(ref_slug) = lower(trim(p_ref_slug)) AND estado = 'activo'
    LIMIT 1;
    IF FOUND THEN v_metodo := 'link'; END IF;
  END IF;

  IF v_partner.id IS NULL AND v_cupon.partner_id IS NOT NULL THEN
    SELECT * INTO v_partner FROM public.partners
    WHERE id = v_cupon.partner_id AND estado = 'activo';
    IF FOUND THEN v_metodo := 'cupon'; END IF;
  END IF;

  IF v_cupon.id IS NOT NULL AND v_cupon.partner_id IS NOT NULL THEN
    v_max := public.get_partner_coupon_cap(v_cupon.partner_id);
    IF v_cupon.descuento_pct > v_max THEN
      UPDATE public.cupones SET activo = false WHERE id = v_cupon.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'cupon_supera_comision_partner');
    END IF;
  END IF;

  IF v_partner.id IS NULL THEN
    IF v_cupon.id IS NOT NULL THEN
      INSERT INTO public.cupon_usos (cupon_id, empresa_id, meses_restantes)
      VALUES (v_cupon.id, p_empresa_id, v_cupon.meses_duracion)
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('ok', true, 'partner', false, 'cupon_aplicado', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'sin_partner');
  END IF;

  IF v_cupon.partner_id IS NOT NULL AND v_cupon.partner_id <> v_partner.id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cupon_no_pertenece_partner');
  END IF;

  INSERT INTO public.partner_atribuciones (empresa_id, partner_id, cupon_id, ref_slug, metodo)
  VALUES (p_empresa_id, v_partner.id, v_cupon.id, p_ref_slug, COALESCE(v_metodo, 'manual'));

  IF v_cupon.id IS NOT NULL THEN
    INSERT INTO public.cupon_usos (cupon_id, empresa_id, meses_restantes)
    VALUES (v_cupon.id, p_empresa_id, v_cupon.meses_duracion)
    ON CONFLICT DO NOTHING;
    UPDATE public.cupones SET usos_actuales = COALESCE(usos_actuales, 0) + 1 WHERE id = v_cupon.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'partner_id', v_partner.id, 'partner_nombre', v_partner.nombre,
    'cupon_aplicado', v_cupon.id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_partner_referido(uuid, text, text) TO anon, authenticated;

-- Copia la evidencia de aceptación desde la solicitud al registro aprobado.
CREATE OR REPLACE FUNCTION public.aprobar_solicitud_partner(
  _solicitud_id uuid,
  _slug text,
  _comision_pct numeric DEFAULT 20
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sol public.partner_solicitudes%ROWTYPE;
  v_partner_id uuid;
  v_user_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_sol FROM public.partner_solicitudes WHERE id = _solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_sol.status <> 'pending' THEN RAISE EXCEPTION 'Solicitud ya procesada'; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_sol.email) LIMIT 1;
  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = v_user_id AND empresa_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Este correo ya pertenece a una empresa cliente. No puede ser partner.';
  END IF;

  INSERT INTO public.partners (
    nombre, email, telefono, ref_slug, comision_pct, user_id, estado,
    terms_accepted_at, terms_version
  ) VALUES (
    v_sol.nombre, v_sol.email, v_sol.telefono, lower(_slug), _comision_pct,
    v_user_id, 'activo', v_sol.terms_accepted_at, v_sol.terms_version
  ) RETURNING id INTO v_partner_id;

  UPDATE public.partner_solicitudes
  SET status = 'approved', partner_id = v_partner_id, processed_at = now(), processed_by = auth.uid()
  WHERE id = _solicitud_id;
  RETURN v_partner_id;
END;
$$;

-- Resumen enriquecido para el listado Master. SELECT * sigue siendo compatible
-- con el frontend anterior durante el despliegue escalonado.
CREATE OR REPLACE VIEW public.partner_resumen
WITH (security_invoker = true)
AS
SELECT
  p.id AS partner_id,
  p.nombre,
  p.comision_pct,
  p.estado,
  p.ref_slug,
  (SELECT COUNT(*) FROM public.partner_atribuciones a WHERE a.partner_id = p.id) AS empresas_referidas,
  (SELECT COALESCE(SUM(c.monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id AND c.status <> 'anulada') AS total_generado,
  (SELECT COALESCE(SUM(c.monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id AND c.status = 'pagada') AS total_pagado,
  (SELECT COALESCE(SUM(c.monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id AND c.status = 'pendiente') AS saldo_pendiente,
  p.email,
  p.telefono,
  p.created_at,
  n.nombre AS nivel_nombre,
  n.emoji AS nivel_emoji,
  n.comision_pct AS comision_actual_pct,
  n.empresas_actuales AS empresas_activas,
  (SELECT COUNT(*) FROM public.cupones c WHERE c.partner_id = p.id AND c.activo) AS cupones_activos,
  p.terms_accepted_at,
  p.terms_version
FROM public.partners p
LEFT JOIN LATERAL public.get_partner_nivel(p.id) n ON true;

GRANT SELECT ON public.partner_resumen TO authenticated;
