-- Liquidación de saldos de clientes · GLOBAL TRADE LOGISTICS (licencia 72362383)
-- Decisión del dueño (2026-11-09): se liquida con un cobro de AJUSTE (metodo_pago
-- 'ajuste_liquidacion'), que no cuenta como dinero en reportes ni cortes.
-- No se tocan: pedidos sin entregar (siguen pendientes de pago), cancelados ni borradores.
-- Respaldo: public.liquidacion_saldos_respaldo (venta, saldo antes, cobro creado).
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

  -- Usuario que registra el ajuste: el dueño de la empresa (o su primer usuario activo).
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
      -- Pedido aún no entregado: se queda pendiente de pago.
      AND NOT (v.tipo::text = 'pedido' AND v.status::text NOT IN ('entregado', 'facturado'))
    GROUP BY v.cliente_id
  LOOP
    INSERT INTO public.liquidacion_saldos_respaldo (empresa_id, venta_id, folio, cliente_id, saldo_antes)
    SELECT v_empresa, v.id, v.folio, v.cliente_id, v.saldo_pendiente
    FROM public.ventas v WHERE v.id = ANY (c.ventas);

    v_cobro := public.aplicar_cobro(
      v_empresa, c.cliente_id, c.total, 'ajuste_liquidacion', 'LIQUIDACION-2026-11',
      current_date, c.apps, 'Liquidación de saldos pendientes (ajuste, no es dinero recibido)', v_user);

    UPDATE public.liquidacion_saldos_respaldo
       SET cobro_id = v_cobro
     WHERE venta_id = ANY (c.ventas) AND cobro_id IS NULL;
  END LOOP;
END $$;

-- Verificación (debe salir ventas_con_saldo_liquidables = 0)
SELECT
  (SELECT count(*) FROM public.liquidacion_saldos_respaldo r
     JOIN public.empresas e ON e.id = r.empresa_id AND e.licencia = '72362383'
    WHERE r.liquidado_at::date = current_date)                                   AS ventas_liquidadas,
  (SELECT round(sum(r.saldo_antes), 2) FROM public.liquidacion_saldos_respaldo r
     JOIN public.empresas e ON e.id = r.empresa_id AND e.licencia = '72362383'
    WHERE r.liquidado_at::date = current_date)                                   AS monto_liquidado,
  (SELECT count(*) FROM public.ventas v JOIN public.empresas e ON e.id = v.empresa_id AND e.licencia = '72362383'
    WHERE v.saldo_pendiente > 0.005 AND v.status::text NOT IN ('cancelado','borrador') AND v.cliente_id IS NOT NULL
      AND NOT (v.tipo::text = 'pedido' AND v.status::text NOT IN ('entregado','facturado'))) AS ventas_con_saldo_liquidables,
  (SELECT count(*) FROM public.ventas v JOIN public.empresas e ON e.id = v.empresa_id AND e.licencia = '72362383'
    WHERE v.saldo_pendiente > 0.005 AND v.status::text NOT IN ('cancelado','borrador') AND v.cliente_id IS NULL) AS ventas_sin_cliente_con_saldo,
  (SELECT count(*) FROM public.ventas v JOIN public.empresas e ON e.id = v.empresa_id AND e.licencia = '72362383'
    WHERE v.tipo::text = 'pedido' AND v.status::text NOT IN ('entregado','facturado','cancelado','borrador')) AS pedidos_sin_entregar_intactos;

COMMIT;
