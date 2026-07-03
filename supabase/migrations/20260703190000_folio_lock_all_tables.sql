-- ============================================================================
-- Blindaje de folios consecutivos en TODAS las tablas (además de ventas).
-- ----------------------------------------------------------------------------
-- Mismo problema que en ventas: cada tabla generaba su folio con MAX+1 SIN
-- candado y respetaba el folio que mandaba el cliente (guard IF NEW.folio IS
-- NULL). Bajo concurrencia → duplicados; y con apps viejas que mandan folios
-- basura (p. ej. compras enviaba `id.slice(0,8)`, traspasos enviaba 'Nuevo')
-- el trigger los respetaba.
--
-- Solución por tabla:
--   • compras (COM), entregas (ENT), traspasos (TRA), cotizaciones (COT):
--     el trigger AHORA es autoritario (siempre regenera, ignora el folio del
--     cliente) y toma un pg_advisory_xact_lock por (prefijo, empresa).
--   • facturas (FAC): se conserva el folio que ponga el cliente/Stripe
--     (numero_factura = número del invoice de Stripe), pero la rama de
--     autogeneración toma el mismo advisory lock.
--   • ventas (VTA/PED/SAL): ya cubierto en 20260703160000 / 180000.
--   • mermas (MER): ya tiene índice único (empresa_id, folio) → no puede
--     duplicar; se deja igual.
-- Todos los triggers son BEFORE INSERT → no alteran folios al editar.
-- ============================================================================

-- ── compras (COM) ──
CREATE OR REPLACE FUNCTION public.auto_folio_compra()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('folio:COM'), hashtext(NEW.empresa_id::text));
  SELECT 'COM-' || LPAD((COALESCE(MAX(
    CASE WHEN folio ~ '^COM-[0-9]+$' THEN CAST(SUBSTRING(folio FROM 5) AS INT) ELSE 0 END
  ),0)+1)::TEXT,4,'0')
  INTO NEW.folio FROM public.compras WHERE empresa_id = NEW.empresa_id;
  RETURN NEW;
END; $$;

-- ── entregas (ENT) ──
CREATE OR REPLACE FUNCTION public.auto_folio_entrega()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('folio:ENT'), hashtext(NEW.empresa_id::text));
  SELECT 'ENT-' || LPAD((COALESCE(MAX(
    CASE WHEN folio ~ '^ENT-[0-9]+$' THEN CAST(SUBSTRING(folio FROM 5) AS INT) ELSE 0 END
  ),0)+1)::TEXT,4,'0')
  INTO NEW.folio FROM public.entregas WHERE empresa_id = NEW.empresa_id;
  RETURN NEW;
END; $$;

-- ── traspasos (TRA) ──
CREATE OR REPLACE FUNCTION public.auto_folio_traspaso()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('folio:TRA'), hashtext(NEW.empresa_id::text));
  SELECT 'TRA-' || LPAD((COALESCE(MAX(
    CASE WHEN folio ~ '^TRA-[0-9]+$' THEN CAST(SUBSTRING(folio FROM 5) AS INT) ELSE 0 END
  ),0)+1)::TEXT,4,'0')
  INTO NEW.folio FROM public.traspasos WHERE empresa_id = NEW.empresa_id;
  RETURN NEW;
END; $$;

-- ── cotizaciones (COT) — conserva la lógica de vence_at ──
CREATE OR REPLACE FUNCTION public.trg_cotizacion_before_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE next_num int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('folio:COT'), hashtext(NEW.empresa_id::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(folio, '\D', '', 'g'), '')::int), 0) + 1
    INTO next_num FROM public.cotizaciones WHERE empresa_id = NEW.empresa_id;
  NEW.folio := 'COT-' || LPAD(next_num::text, 5, '0');
  IF NEW.vence_at IS NULL THEN
    NEW.vence_at := NEW.fecha + (NEW.vigencia_dias || ' days')::interval;
  END IF;
  RETURN NEW;
END; $$;

-- ── facturas (FAC) — conserva numero_factura de Stripe; solo blinda la
--    autogeneración con el advisory lock ──
CREATE OR REPLACE FUNCTION public.auto_numero_factura()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.numero_factura IS NULL OR NEW.numero_factura = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('folio:FAC'), hashtext(NEW.empresa_id::text));
    SELECT 'FAC-' || LPAD((COALESCE(MAX(
      CASE WHEN numero_factura ~ '^FAC-[0-9]+$' THEN CAST(SUBSTRING(numero_factura FROM 5) AS INT) ELSE 0 END
    ),0)+1)::TEXT,5,'0')
    INTO NEW.numero_factura FROM public.facturas WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END; $$;
