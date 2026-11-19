-- =====================================================================
-- Facturación · Fase 2 (D-015): facturar por cantidad, complemento de pago,
-- factura global y sustitución.
-- A. Una venta se reparte en varias facturas: se aparta la CANTIDAD pendiente de
--    cada línea (apartar_cfdi_timbrado reescrita) y recalcular_facturacion_cfdi()
--    deja facturado / factura_cfdi_id / facturado_global según las facturas vigentes.
-- B. REP: columnas de apartado/incierto en cfdi_pagos, serie/folio de pagos,
--    un solo REP vigente por cobro, apartar_rep() transaccional.
-- C. Candados: un cobro con REP vigente no se edita, cancela ni desaplica.
-- D. cfdis: es_global + datos de InformacionGlobal, sustituye_cfdi_id, impuestos_detalle.
-- Idempotente. Todo o nada. Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

-- ── D. columnas de cfdis ──────────────────────────────────────────────
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS es_global boolean NOT NULL DEFAULT false;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS global_periodicidad text;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS global_meses text;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS global_anio integer;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS sustituye_cfdi_id uuid REFERENCES public.cfdis(id);
-- Impuestos agrupados del CFDI timbrado (los usa el REP para el proporcional).
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS impuestos_detalle jsonb;
CREATE INDEX IF NOT EXISTS idx_cfdi_lineas_venta_linea ON public.cfdi_lineas (venta_linea_id) WHERE venta_linea_id IS NOT NULL;

-- ── A. estados ────────────────────────────────────────────────────────
-- Ocupa cantidad: en proceso, incierta o vigente. Vigente: timbrada y no cancelada.
CREATE OR REPLACE FUNCTION public.cfdi_status_ocupa(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('timbrando','incierto','timbrado','cancelacion_pendiente','cancelacion_rechazada')
$$;
CREATE OR REPLACE FUNCTION public.cfdi_status_vigente(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('timbrado','cancelacion_pendiente','cancelacion_rechazada')
$$;

-- Recalcula las líneas de venta que toca un CFDI.
--  facturado        = toda la cantidad está en facturas vigentes
--  factura_cfdi_id  = la factura más reciente que ocupa la línea (candado de edición de la venta)
--  facturado_global = alguna factura global vigente la cubre (o marca previa sin líneas CFDI)
CREATE OR REPLACE FUNCTION public.recalcular_facturacion_cfdi(p_cfdi_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  UPDATE venta_lineas vl SET
    facturado = x.qty_vigente > 0 AND x.qty_vigente >= COALESCE(vl.cantidad, 0) - 0.000001,
    factura_cfdi_id = x.ultimo_cfdi,
    facturado_global = COALESCE(x.global_vigente, false)
  FROM (
    SELECT l.id,
           COALESCE(sum(cl.cantidad) FILTER (WHERE public.cfdi_status_vigente(c.status)), 0) AS qty_vigente,
           (array_agg(c.id ORDER BY c.created_at DESC) FILTER (WHERE public.cfdi_status_ocupa(c.status)))[1] AS ultimo_cfdi,
           bool_or(c.es_global AND public.cfdi_status_vigente(c.status)) AS global_vigente
    FROM venta_lineas l
    JOIN cfdi_lineas cl ON cl.venta_linea_id = l.id
    JOIN cfdis c ON c.id = cl.cfdi_id
    WHERE l.id IN (SELECT venta_linea_id FROM cfdi_lineas WHERE cfdi_id = p_cfdi_id AND venta_linea_id IS NOT NULL)
    GROUP BY l.id
  ) x
  WHERE vl.id = x.id;
END;
$$;
REVOKE ALL ON FUNCTION public.recalcular_facturacion_cfdi(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_facturacion_cfdi(uuid) TO service_role;

-- Aparta el CFDI para timbrar: bloquea, valida la CANTIDAD pendiente de cada línea
-- (vendida − ocupada por otras facturas; la factura que se sustituye no cuenta) y asigna serie/folio.
CREATE OR REPLACE FUNCTION public.apartar_cfdi_timbrado(p_cfdi_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfdi record;
  v_ids uuid[];
  r record;
  v_ocupada numeric;
  v_serie text;
  v_folio text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT id, empresa_id, status, facturama_id, serie, folio, sustituye_cfdi_id INTO v_cfdi
  FROM cfdis WHERE id = p_cfdi_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CFDI no encontrado'; END IF;
  IF v_cfdi.facturama_id IS NOT NULL THEN RAISE EXCEPTION 'Esta factura ya está timbrada'; END IF;
  IF v_cfdi.status NOT IN ('borrador', 'error') THEN
    RAISE EXCEPTION 'Esta factura ya se está timbrando o quedó incierta (estado %). Usa Reconciliar.', v_cfdi.status;
  END IF;

  SELECT array_agg(DISTINCT venta_linea_id ORDER BY venta_linea_id) INTO v_ids
  FROM cfdi_lineas WHERE cfdi_id = p_cfdi_id AND venta_linea_id IS NOT NULL;

  IF v_ids IS NOT NULL THEN
    -- Bloqueo en orden fijo: dos timbrados sobre la misma venta se esperan, no se cruzan.
    PERFORM 1 FROM venta_lineas WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

    IF (SELECT count(*) FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
        WHERE vl.id = ANY (v_ids) AND v.empresa_id = v_cfdi.empresa_id) <> array_length(v_ids, 1) THEN
      RAISE EXCEPTION 'Alguna línea no pertenece a una venta de esta empresa';
    END IF;

    FOR r IN
      SELECT cl.venta_linea_id, sum(cl.cantidad) AS pedida, max(cl.descripcion) AS descripcion,
             vl.cantidad AS vendida, COALESCE(vl.facturado, false) AS facturado, COALESCE(vl.facturado_global, false) AS fglobal
      FROM cfdi_lineas cl JOIN venta_lineas vl ON vl.id = cl.venta_linea_id
      WHERE cl.cfdi_id = p_cfdi_id
      GROUP BY cl.venta_linea_id, vl.cantidad, vl.facturado, vl.facturado_global
    LOOP
      SELECT COALESCE(sum(x.cantidad), 0) INTO v_ocupada
      FROM cfdi_lineas x JOIN cfdis c ON c.id = x.cfdi_id
      WHERE x.venta_linea_id = r.venta_linea_id AND x.cfdi_id <> p_cfdi_id
        AND public.cfdi_status_ocupa(c.status)
        AND c.id IS DISTINCT FROM v_cfdi.sustituye_cfdi_id;
      -- Marcas anteriores a la Fase 2 sin factura vigente que las explique: la línea cuenta como facturada completa.
      IF (r.facturado OR r.fglobal) AND NOT EXISTS (
        SELECT 1 FROM cfdi_lineas x JOIN cfdis c ON c.id = x.cfdi_id
        WHERE x.venta_linea_id = r.venta_linea_id AND public.cfdi_status_vigente(c.status)
      ) THEN
        v_ocupada := COALESCE(r.vendida, 0);
      END IF;
      IF r.pedida > COALESCE(r.vendida, 0) - v_ocupada + 0.000001 THEN
        RAISE EXCEPTION '"%": solo quedan % por facturar (pides %)', r.descripcion,
          greatest(COALESCE(r.vendida, 0) - v_ocupada, 0), r.pedida;
      END IF;
    END LOOP;

    UPDATE venta_lineas SET factura_cfdi_id = p_cfdi_id WHERE id = ANY (v_ids);
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

-- ── B. complemento de pago ────────────────────────────────────────────
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS timbre_reserva_id uuid;
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS stamping_started_at timestamptz;
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS receiver_rfc text;
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS receiver_name text;
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS receiver_fiscal_regime text;
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS receiver_tax_zip_code text;
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS cancel_motivo text;
ALTER TABLE public.cfdi_pago_documentos ADD COLUMN IF NOT EXISTS impuestos_dr jsonb;

ALTER TABLE public.cfdi_series ADD COLUMN IF NOT EXISTS serie_pago text NOT NULL DEFAULT 'P';
ALTER TABLE public.cfdi_series ADD COLUMN IF NOT EXISTS siguiente_folio_pago bigint NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cfdi_series_pago_chk') THEN
    ALTER TABLE public.cfdi_series ADD CONSTRAINT cfdi_series_pago_chk
      CHECK (serie_pago ~ '^[A-Za-z0-9]{1,25}$' AND siguiente_folio_pago >= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cfdi_pagos_cobro_vigente ON public.cfdi_pagos (cobro_id)
  WHERE cobro_id IS NOT NULL
    AND status IN ('timbrando','incierto','timbrado','cancelacion_pendiente','cancelacion_rechazada');

-- Crea el REP en proceso (cabecera + documentos) y asigna serie/folio de pagos, todo o nada.
CREATE OR REPLACE FUNCTION public.apartar_rep(p_empresa_id uuid, p_cobro_id uuid, p_user_id uuid,
                                              p_cabecera jsonb, p_documentos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro record;
  v_id uuid;
  v_serie text;
  v_folio text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT id, empresa_id, status INTO v_cobro FROM cobros WHERE id = p_cobro_id FOR UPDATE;
  IF NOT FOUND OR v_cobro.empresa_id <> p_empresa_id THEN RAISE EXCEPTION 'Cobro no encontrado'; END IF;
  IF COALESCE(v_cobro.status, 'activo') = 'cancelado' THEN RAISE EXCEPTION 'El cobro está cancelado'; END IF;

  INSERT INTO cfdi_series (empresa_id) VALUES (p_empresa_id) ON CONFLICT (empresa_id) DO NOTHING;
  UPDATE cfdi_series SET siguiente_folio_pago = siguiente_folio_pago + 1, updated_at = now()
  WHERE empresa_id = p_empresa_id
  RETURNING serie_pago, (siguiente_folio_pago - 1)::text INTO v_serie, v_folio;

  BEGIN
    INSERT INTO cfdi_pagos (empresa_id, cobro_id, user_id, status, stamping_started_at, serie, folio,
                            fecha_pago, forma_pago, moneda, tipo_cambio, monto, expedition_place, facturama_ambiente,
                            receiver_rfc, receiver_name, receiver_fiscal_regime, receiver_tax_zip_code)
    VALUES (p_empresa_id, p_cobro_id, p_user_id, 'timbrando', now(), v_serie, v_folio,
            (p_cabecera->>'fecha_pago')::timestamptz, p_cabecera->>'forma_pago', 'MXN', 1,
            (p_cabecera->>'monto')::numeric, p_cabecera->>'expedition_place', COALESCE(p_cabecera->>'facturama_ambiente', 'produccion'),
            p_cabecera->>'receiver_rfc', p_cabecera->>'receiver_name',
            p_cabecera->>'receiver_fiscal_regime', p_cabecera->>'receiver_tax_zip_code')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este cobro ya tiene un complemento de pago vigente o en proceso';
  END;

  INSERT INTO cfdi_pago_documentos (cfdi_pago_id, empresa_id, cfdi_id, venta_id, cfdi_relacionado_uuid, serie_dr, folio_dr,
                                    moneda_dr, tipo_cambio_dr, num_parcialidad, imp_saldo_ant, imp_pagado,
                                    imp_saldo_insoluto, objeto_imp_dr, metodo_pago_dr, iva_trasladado_dr, impuestos_dr)
  SELECT v_id, p_empresa_id, d.cfdi_id, d.venta_id, d.uuid, d.serie, d.folio, 'MXN', 1, d.num_parcialidad,
         d.imp_saldo_ant, d.imp_pagado, d.imp_saldo_insoluto, d.objeto_imp, 'PPD', d.iva, d.impuestos
  FROM jsonb_to_recordset(p_documentos) AS d(cfdi_id uuid, venta_id uuid, uuid text, serie text, folio text,
       num_parcialidad int, imp_saldo_ant numeric, imp_pagado numeric, imp_saldo_insoluto numeric,
       objeto_imp text, iva numeric, impuestos jsonb);

  RETURN jsonb_build_object('id', v_id, 'serie', v_serie, 'folio', v_folio);
END;
$$;
REVOKE ALL ON FUNCTION public.apartar_rep(uuid, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apartar_rep(uuid, uuid, uuid, jsonb, jsonb) TO service_role;

-- ── C. candados del cobro con REP vigente ─────────────────────────────
CREATE OR REPLACE FUNCTION public.cobro_tiene_rep_vigente(p_cobro_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM cfdi_pagos WHERE cobro_id = p_cobro_id AND public.cfdi_status_ocupa(status))
$$;

CREATE OR REPLACE FUNCTION public.trg_cobros_candado_rep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.cobro_tiene_rep_vigente(OLD.id) AND (
       TG_OP = 'DELETE'
       OR NEW.monto IS DISTINCT FROM OLD.monto
       OR NEW.fecha IS DISTINCT FROM OLD.fecha
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago) THEN
    RAISE EXCEPTION 'Este cobro tiene complemento de pago (REP) timbrado; cancela primero el complemento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_cobros_candado_rep ON public.cobros;
CREATE TRIGGER trg_cobros_candado_rep BEFORE UPDATE OR DELETE ON public.cobros
  FOR EACH ROW EXECUTE FUNCTION public.trg_cobros_candado_rep();

CREATE OR REPLACE FUNCTION public.trg_cobro_aplicaciones_candado_rep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND public.cobro_tiene_rep_vigente(OLD.cobro_id))
     OR (TG_OP <> 'DELETE' AND public.cobro_tiene_rep_vigente(NEW.cobro_id)) THEN
    RAISE EXCEPTION 'Este cobro tiene complemento de pago (REP) timbrado; cancela primero el complemento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_cobro_aplicaciones_candado_rep ON public.cobro_aplicaciones;
CREATE TRIGGER trg_cobro_aplicaciones_candado_rep BEFORE INSERT OR UPDATE OR DELETE ON public.cobro_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_cobro_aplicaciones_candado_rep();

COMMIT;
