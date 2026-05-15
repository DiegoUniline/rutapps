
-- ─────────────────────────────────────────────────────────────
-- PARTNER SANDBOX
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS is_partner_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_owner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_partner_sandbox
  ON public.empresas(partner_owner_id)
  WHERE is_partner_sandbox = true;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS sandbox_empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL;

-- ── Helper: detect sandbox empresa ──
CREATE OR REPLACE FUNCTION public.is_sandbox_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_partner_sandbox FROM empresas WHERE id = p_empresa_id), false);
$$;

-- ── Generic limiter factory: trigger functions per table ──

CREATE OR REPLACE FUNCTION public.sandbox_limit_clientes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_sandbox_empresa(NEW.empresa_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM clientes WHERE empresa_id = NEW.empresa_id;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Sandbox limitado a 10 clientes. Para más, tu prospecto necesita su propia cuenta de Rutapp.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sandbox_limit_productos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_sandbox_empresa(NEW.empresa_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM productos WHERE empresa_id = NEW.empresa_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Sandbox limitado a 20 productos. Para más, tu prospecto necesita su propia cuenta de Rutapp.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sandbox_limit_ventas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_sandbox_empresa(NEW.empresa_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM ventas WHERE empresa_id = NEW.empresa_id;
  IF v_count >= 50 THEN
    RAISE EXCEPTION 'Sandbox limitado a 50 ventas. Borra ventas viejas o usa una cuenta real.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sandbox_limit_compras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_sandbox_empresa(NEW.empresa_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM compras WHERE empresa_id = NEW.empresa_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Sandbox limitado a 20 compras.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sandbox_limit_almacenes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_sandbox_empresa(NEW.empresa_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM almacenes WHERE empresa_id = NEW.empresa_id;
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'Sandbox limitado a 2 almacenes.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sandbox_limit_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NEW.empresa_id IS NULL THEN RETURN NEW; END IF;
  IF NOT public.is_sandbox_empresa(NEW.empresa_id) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM profiles WHERE empresa_id = NEW.empresa_id;
  IF v_count >= 1 THEN
    RAISE EXCEPTION 'El sandbox solo permite 1 usuario. No puedes invitar a tu equipo aquí.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Blockers (hard NO) ──

CREATE OR REPLACE FUNCTION public.sandbox_block_cfdis()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_sandbox_empresa(NEW.empresa_id) THEN
    RAISE EXCEPTION 'La facturación CFDI no está disponible en Sandbox Partner.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sandbox_block_wa_campaigns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_sandbox_empresa(NEW.empresa_id) THEN
    RAISE EXCEPTION 'El envío masivo de WhatsApp no está disponible en Sandbox Partner.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sandbox_block_share_lista()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.share_activo = true AND public.is_sandbox_empresa(NEW.empresa_id) THEN
    RAISE EXCEPTION 'Compartir catálogo público no está disponible en Sandbox Partner.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Wire triggers ──
DROP TRIGGER IF EXISTS trg_sandbox_limit_clientes ON public.clientes;
CREATE TRIGGER trg_sandbox_limit_clientes BEFORE INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_limit_clientes();

DROP TRIGGER IF EXISTS trg_sandbox_limit_productos ON public.productos;
CREATE TRIGGER trg_sandbox_limit_productos BEFORE INSERT ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_limit_productos();

DROP TRIGGER IF EXISTS trg_sandbox_limit_ventas ON public.ventas;
CREATE TRIGGER trg_sandbox_limit_ventas BEFORE INSERT ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_limit_ventas();

DROP TRIGGER IF EXISTS trg_sandbox_limit_compras ON public.compras;
CREATE TRIGGER trg_sandbox_limit_compras BEFORE INSERT ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_limit_compras();

DROP TRIGGER IF EXISTS trg_sandbox_limit_almacenes ON public.almacenes;
CREATE TRIGGER trg_sandbox_limit_almacenes BEFORE INSERT ON public.almacenes
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_limit_almacenes();

DROP TRIGGER IF EXISTS trg_sandbox_limit_profiles ON public.profiles;
CREATE TRIGGER trg_sandbox_limit_profiles BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_limit_profiles();

DROP TRIGGER IF EXISTS trg_sandbox_block_cfdis ON public.cfdis;
CREATE TRIGGER trg_sandbox_block_cfdis BEFORE INSERT ON public.cfdis
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_block_cfdis();

DROP TRIGGER IF EXISTS trg_sandbox_block_wa_campaigns ON public.wa_campaigns;
CREATE TRIGGER trg_sandbox_block_wa_campaigns BEFORE INSERT ON public.wa_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_block_wa_campaigns();

DROP TRIGGER IF EXISTS trg_sandbox_block_share_lista ON public.lista_precios;
CREATE TRIGGER trg_sandbox_block_share_lista BEFORE INSERT OR UPDATE ON public.lista_precios
  FOR EACH ROW EXECUTE FUNCTION public.sandbox_block_share_lista();

-- ── RPC: counts for UI banner ──
CREATE OR REPLACE FUNCTION public.get_sandbox_usage(p_empresa_id uuid)
RETURNS TABLE (
  clientes_count int, clientes_max int,
  productos_count int, productos_max int,
  ventas_count int, ventas_max int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM clientes WHERE empresa_id = p_empresa_id), 10,
    (SELECT count(*)::int FROM productos WHERE empresa_id = p_empresa_id), 20,
    (SELECT count(*)::int FROM ventas WHERE empresa_id = p_empresa_id), 50;
$$;

GRANT EXECUTE ON FUNCTION public.is_sandbox_empresa(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sandbox_usage(uuid) TO authenticated;
