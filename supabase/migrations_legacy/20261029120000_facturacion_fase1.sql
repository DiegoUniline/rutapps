-- =====================================================================
-- Facturación · Fase 1 (D-013, D-014): factura de venta correcta
-- 1. productos.cfdi_iva_sin_iva: cómo va en el CFDI un producto SIN IVA
--    (tasa0 | exento | no_objeto). NULL = no se puede timbrar hasta elegirlo.
-- 2. cfdi_lineas.descuento y cfdis.descuento_total (nodo Discount).
-- 3. cfdis: stamping_started_at (apartado), timbre_reserva_id, cancel_motivo, cancel_uuid_sustitucion.
--    Estados nuevos de cfdis.status: 'timbrando' e 'incierto' (sin CHECK hoy).
-- 4. cfdi_series: serie y siguiente folio por empresa (solo lectura para la app;
--    escribe la función facturama con service_role).
-- 5. apartar_cfdi_timbrado(): en una sola transacción bloquea el CFDI, aparta las
--    líneas de venta (nadie más puede facturarlas) y asigna serie/folio.
-- Idempotente. Todo o nada. Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

-- 1
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS cfdi_iva_sin_iva text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_cfdi_iva_sin_iva_chk') THEN
    ALTER TABLE public.productos ADD CONSTRAINT productos_cfdi_iva_sin_iva_chk
      CHECK (cfdi_iva_sin_iva IS NULL OR cfdi_iva_sin_iva IN ('tasa0','exento','no_objeto'));
  END IF;
END $$;

-- 2
ALTER TABLE public.cfdi_lineas ADD COLUMN IF NOT EXISTS descuento numeric NOT NULL DEFAULT 0;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS descuento_total numeric NOT NULL DEFAULT 0;

-- 3
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS stamping_started_at timestamptz;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS cancel_motivo text;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS cancel_uuid_sustitucion text;
-- Reserva de timbre del intento en curso (se confirma o libera al reconciliar).
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS timbre_reserva_id uuid;

-- 4
CREATE TABLE IF NOT EXISTS public.cfdi_series (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  serie text NOT NULL DEFAULT 'A' CHECK (serie ~ '^[A-Za-z0-9]{1,25}$'),
  siguiente_folio bigint NOT NULL DEFAULT 1 CHECK (siguiente_folio >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cfdi_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cfdi_series_select ON public.cfdi_series;
CREATE POLICY cfdi_series_select ON public.cfdi_series FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())) OR empresa_id = (SELECT public.get_my_empresa_id()));

-- 5
CREATE OR REPLACE FUNCTION public.apartar_cfdi_timbrado(p_cfdi_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfdi record;
  v_ids uuid[];
  v_apartadas int;
  v_serie text;
  v_folio text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT id, empresa_id, status, facturama_id, serie, folio INTO v_cfdi
  FROM cfdis WHERE id = p_cfdi_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CFDI no encontrado'; END IF;
  IF v_cfdi.facturama_id IS NOT NULL THEN RAISE EXCEPTION 'Esta factura ya está timbrada'; END IF;
  IF v_cfdi.status NOT IN ('borrador', 'error') THEN
    RAISE EXCEPTION 'Esta factura ya se está timbrando o quedó incierta (estado %). Usa Reconciliar.', v_cfdi.status;
  END IF;

  SELECT array_agg(DISTINCT venta_linea_id) INTO v_ids
  FROM cfdi_lineas WHERE cfdi_id = p_cfdi_id AND venta_linea_id IS NOT NULL;

  IF v_ids IS NOT NULL THEN
    UPDATE venta_lineas vl SET factura_cfdi_id = p_cfdi_id
    FROM ventas v
    WHERE vl.id = ANY (v_ids)
      AND v.id = vl.venta_id AND v.empresa_id = v_cfdi.empresa_id
      AND (vl.factura_cfdi_id IS NULL OR vl.factura_cfdi_id = p_cfdi_id)
      AND NOT COALESCE(vl.facturado, false)
      AND NOT COALESCE(vl.facturado_global, false);
    GET DIAGNOSTICS v_apartadas = ROW_COUNT;
    IF v_apartadas <> array_length(v_ids, 1) THEN
      RAISE EXCEPTION 'Alguna línea de la venta ya está facturada o en otra factura en proceso';
    END IF;
  END IF;

  IF COALESCE(btrim(v_cfdi.folio), '') = '' THEN
    INSERT INTO cfdi_series (empresa_id) VALUES (v_cfdi.empresa_id) ON CONFLICT (empresa_id) DO NOTHING;
    UPDATE cfdi_series SET siguiente_folio = siguiente_folio + 1, updated_at = now()
    WHERE empresa_id = v_cfdi.empresa_id
    RETURNING serie, (siguiente_folio - 1)::text INTO v_serie, v_folio;
  ELSE
    v_serie := COALESCE(NULLIF(btrim(v_cfdi.serie), ''), 'A');
    v_folio := btrim(v_cfdi.folio);
  END IF;

  UPDATE cfdis SET status = 'timbrando', stamping_started_at = now(), error_detalle = NULL,
         serie = v_serie, folio = v_folio, updated_at = now()
  WHERE id = p_cfdi_id;

  RETURN jsonb_build_object('serie', v_serie, 'folio', v_folio);
END;
$$;

REVOKE ALL ON FUNCTION public.apartar_cfdi_timbrado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apartar_cfdi_timbrado(uuid) TO service_role;

COMMIT;
