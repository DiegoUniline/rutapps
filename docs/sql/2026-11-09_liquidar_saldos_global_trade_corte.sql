-- Liquidación de saldos · GLOBAL TRADE LOGISTICS (licencia 72362383) · corte al 2026-10-31
-- Decisiones del dueño (2026-11-09): cobro de AJUSTE ('ajuste_liquidacion', no es dinero);
-- la empresa no marca entregas, así que los pedidos CONFIRMADOS con fecha <= 2026-10-31 se
-- consideran entregados y se liquidan. Desde el 2026-11-01 siguen pendientes de pago.
-- No se tocan borradores ni cancelados. Respaldo en public.liquidacion_saldos_respaldo.
DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.liquidacion_saldos_respaldo (
  empresa_id uuid NOT NULL,
  venta_id uuid NOT NULL,
  folio text,
  cliente_id uuid,
  saldo_antes numeric NOT NULL,
  cobro_id uuid,
  liquidado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venta_id, liquidado_at)
);
ALTER TABLE public.liquidacion_saldos_respaldo ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_empresa uuid;
  v_user uuid;
  c record;
  v_cobro uuid;
BEGIN
  SELECT id INTO STRICT v_empresa FROM public.empresas WHERE licencia = '72362383';

  SELECT COALESCE(e.owner_user_id,
         (SELECT p.user_id FROM public.profiles p
           WHERE p.empresa_id = e.id AND p.estado = 'activo' AND p.user_id IS NOT NULL
           ORDER BY p.created_at LIMIT 1))
    INTO v_user FROM public.empresas e WHERE e.id = v_empresa;
  IF v_user IS NULL THEN RAISE EXCEPTION 'La empresa no tiene usuario para registrar el ajuste'; END IF;

  FOR c IN
    SELECT v.cliente_id,
           sum(v.saldo_pendiente) AS total,
           jsonb_agg(jsonb_build_object('venta_id', v.id, 'monto_aplicado', v.saldo_pendiente)) AS apps,
           array_agg(v.id) AS ventas
    FROM public.ventas v
    WHERE v.empresa_id = v_empresa
      AND v.cliente_id IS NOT NULL
      AND v.saldo_pendiente > 0.005
      AND v.status::text NOT IN ('cancelado', 'borrador')
      AND COALESCE(v.fecha, v.created_at::date) <= DATE '2026-10-31'
    GROUP BY v.cliente_id
  LOOP
    INSERT INTO public.liquidacion_saldos_respaldo (empresa_id, venta_id, folio, cliente_id, saldo_antes)
    SELECT v_empresa, v.id, v.folio, v.cliente_id, v.saldo_pendiente
    FROM public.ventas v WHERE v.id = ANY (c.ventas);

    v_cobro := public.aplicar_cobro(
      v_empresa, c.cliente_id, c.total, 'ajuste_liquidacion', 'LIQUIDACION-2026-10-31',
      current_date, c.apps, 'Liquidación de saldos al 31/10/2026 (ajuste, no es dinero recibido)', v_user);

    UPDATE public.liquidacion_saldos_respaldo
       SET cobro_id = v_cobro
     WHERE venta_id = ANY (c.ventas) AND cobro_id IS NULL;
  END LOOP;
END $$;

-- Verificación
WITH e AS (SELECT id FROM public.empresas WHERE licencia = '72362383')
SELECT
  (SELECT count(*) FROM public.liquidacion_saldos_respaldo r, e
    WHERE r.empresa_id = e.id AND r.liquidado_at::date = current_date)          AS ventas_liquidadas,
  (SELECT round(sum(r.saldo_antes), 2) FROM public.liquidacion_saldos_respaldo r, e
    WHERE r.empresa_id = e.id AND r.liquidado_at::date = current_date)          AS monto_liquidado,
  (SELECT count(*) FROM public.ventas v, e
    WHERE v.empresa_id = e.id AND v.saldo_pendiente > 0.005 AND v.cliente_id IS NOT NULL
      AND v.status::text NOT IN ('cancelado','borrador') AND COALESCE(v.fecha, v.created_at::date) <= DATE '2026-10-31') AS con_saldo_hasta_corte,
  (SELECT count(*) FROM public.ventas v, e
    WHERE v.empresa_id = e.id AND v.saldo_pendiente > 0.005 AND v.cliente_id IS NULL
      AND v.status::text NOT IN ('cancelado','borrador') AND COALESCE(v.fecha, v.created_at::date) <= DATE '2026-10-31') AS sin_cliente_con_saldo,
  (SELECT count(*) FROM public.ventas v, e
    WHERE v.empresa_id = e.id AND v.saldo_pendiente > 0.005
      AND v.status::text NOT IN ('cancelado','borrador') AND COALESCE(v.fecha, v.created_at::date) > DATE '2026-10-31')  AS pendientes_desde_noviembre,
  (SELECT round(sum(v.saldo_pendiente), 2) FROM public.ventas v, e
    WHERE v.empresa_id = e.id AND v.saldo_pendiente > 0.005
      AND v.status::text NOT IN ('cancelado','borrador') AND COALESCE(v.fecha, v.created_at::date) > DATE '2026-10-31')  AS saldo_pendiente_noviembre;

COMMIT;
