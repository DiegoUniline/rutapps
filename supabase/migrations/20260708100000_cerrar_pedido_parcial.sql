-- ============================================================================
-- CERRAR PEDIDO PARCIAL · Terminar un pedido con solo lo entregado
--
-- El pedido es proyección (líneas intocables). Las entregas son lo real. Si se
-- pidió 10 y se entregó 5, hoy el pedido queda pendiente por los 5 para siempre.
-- Esto permite CERRARLO con solo lo entregado, sin modificar sus líneas.
--
-- Diseño seguro:
--   • NO se agrega valor al enum status_venta (irreversible, usado en todos lados).
--     El status del pedido NO cambia; la bandera de cerrado es ventas.cerrado_at.
--     La UI muestra "Cerrado parcial" cuando cerrado_at IS NOT NULL y hubo faltante.
--   • Se congela el COBRABLE en ventas.total_efectivo (no el saldo): así los pagos
--     posteriores siguen bajando el saldo, pero el monto entregado ya no cambia.
--   • fn_recalc_venta_saldo: si el pedido está cerrado, saldo = total_efectivo − cobros.
--   • Se bloquean entregas nuevas y cambios de entregas en pedidos cerrados
--     (para que ni el inventario ni el monto entregado se muevan tras cerrar).
--   • Reversible: reabrir_pedido_parcial() limpia la bandera y descongela.
--
-- ALCANCE: solo pedidos con politica_cobro='entregado'. Venta directa / contado /
-- crédito no aplican. Sin tocar histórico.
-- ============================================================================

-- 1) Columnas de cierre en ventas (idempotente).
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS cerrado_at        timestamptz NULL;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS cerrado_por       uuid        NULL;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS total_efectivo    numeric     NULL;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS cerrado_snapshot  jsonb       NULL;

-- ----------------------------------------------------------------------------
-- 2) fn_recalc_venta_saldo: respeta el cierre parcial (usa total_efectivo).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recalc_venta_saldo(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta        public.ventas%ROWTYPE;
  v_cobros       numeric;
  v_cobrable     numeric;
  v_orig_base    numeric;
  v_deliv_base   numeric;
  v_es_entregado boolean;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id
    AND COALESCE(c.status, 'activo') <> 'cancelado';

  IF v_venta.cerrado_at IS NOT NULL THEN
    -- Pedido cerrado parcial: el cobrable quedó congelado.
    v_cobrable := COALESCE(v_venta.total_efectivo, 0);
  ELSE
    v_es_entregado :=
          v_venta.tipo::text = 'pedido'
      AND v_venta.politica_cobro IS NOT DISTINCT FROM 'entregado'
      AND COALESCE(v_venta.es_saldo_inicial, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.venta_lineas
        WHERE venta_id = p_venta_id
          AND (COALESCE(facturado, false) = true OR factura_cfdi_id IS NOT NULL)
      );

    IF v_es_entregado THEN
      SELECT COALESCE(SUM(base), 0), COALESCE(SUM(base * ratio), 0)
        INTO v_orig_base, v_deliv_base
      FROM (
        SELECT
          (COALESCE(vl.subtotal,0) + COALESCE(vl.iva_monto,0) + COALESCE(vl.ieps_monto,0)) AS base,
          CASE WHEN vl.cantidad > 0
               THEN LEAST(COALESCE(ent.entregado, 0), vl.cantidad) / vl.cantidad
               ELSE 0 END AS ratio
        FROM public.venta_lineas vl
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(el.cantidad_entregada), 0) AS entregado
          FROM public.entrega_lineas el
          JOIN public.entregas e ON e.id = el.entrega_id
          WHERE e.pedido_id = p_venta_id
            AND e.status::text NOT IN ('cancelado','no_entregado')
            AND el.producto_id = vl.producto_id
        ) ent ON true
        WHERE vl.venta_id = p_venta_id
      ) q;

      IF COALESCE(v_orig_base, 0) > 0 THEN
        v_cobrable := ROUND(COALESCE(v_venta.total, 0) * (v_deliv_base / v_orig_base), 2);
      ELSE
        v_cobrable := 0;
      END IF;
    ELSE
      v_cobrable := COALESCE(v_venta.total, 0);
    END IF;
  END IF;

  UPDATE public.ventas
  SET saldo_pendiente = GREATEST(0, v_cobrable - COALESCE(v_cobros, 0))
  WHERE id = p_venta_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3) cerrar_pedido_parcial: valida, congela el cobrable, guarda snapshot.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_pedido_parcial(
  p_venta_id uuid,
  p_user_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta      public.ventas%ROWTYPE;
  v_orig_base  numeric;
  v_deliv_base numeric;
  v_cobrable   numeric;
  v_cobros     numeric;
  v_saldo      numeric;
  v_snapshot   jsonb;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  -- Reglas.
  IF v_venta.tipo::text <> 'pedido' THEN
    RAISE EXCEPTION 'Solo se pueden cerrar pedidos'; END IF;
  IF v_venta.politica_cobro IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Solo aplica a pedidos con política de cobro por entregado'; END IF;
  IF v_venta.cerrado_at IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'; END IF;
  IF v_venta.status::text IN ('cancelado','facturado') THEN
    RAISE EXCEPTION 'No se puede cerrar un pedido cancelado o facturado'; END IF;
  IF COALESCE(v_venta.es_saldo_inicial,false) THEN
    RAISE EXCEPTION 'No aplica a saldos iniciales'; END IF;

  -- Base original y entregada (prorrateo por lo efectivamente entregado).
  SELECT COALESCE(SUM(base), 0), COALESCE(SUM(base * ratio), 0)
    INTO v_orig_base, v_deliv_base
  FROM (
    SELECT
      (COALESCE(vl.subtotal,0) + COALESCE(vl.iva_monto,0) + COALESCE(vl.ieps_monto,0)) AS base,
      CASE WHEN vl.cantidad > 0
           THEN LEAST(COALESCE(ent.entregado, 0), vl.cantidad) / vl.cantidad
           ELSE 0 END AS ratio
    FROM public.venta_lineas vl
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(el.cantidad_entregada), 0) AS entregado
      FROM public.entrega_lineas el
      JOIN public.entregas e ON e.id = el.entrega_id
      WHERE e.pedido_id = p_venta_id
        AND e.status::text NOT IN ('cancelado','no_entregado')
        AND el.producto_id = vl.producto_id
    ) ent ON true
    WHERE vl.venta_id = p_venta_id
  ) q;

  -- Debe haber algo entregado; si no, se cancela el pedido, no se cierra.
  IF COALESCE(v_deliv_base, 0) <= 0 THEN
    RAISE EXCEPTION 'No hay nada entregado: cancela el pedido en vez de cerrarlo';
  END IF;

  v_cobrable := CASE WHEN COALESCE(v_orig_base,0) > 0
                     THEN ROUND(COALESCE(v_venta.total,0) * (v_deliv_base / v_orig_base), 2)
                     ELSE 0 END;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';

  v_saldo := GREATEST(0, v_cobrable - v_cobros);

  -- Foto entregado vs pedido (auditoría + tooltip).
  v_snapshot := jsonb_build_object(
    'pedido_total',    COALESCE(v_venta.total,0),
    'total_efectivo',  v_cobrable,
    'cobros',          v_cobros,
    'saldo',           v_saldo,
    'base_original',   v_orig_base,
    'base_entregada',  v_deliv_base,
    'lineas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'producto_id', vl.producto_id,
               'pedido',      vl.cantidad,
               'entregado',   COALESCE((
                  SELECT SUM(el.cantidad_entregada)
                  FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
                  WHERE e.pedido_id = p_venta_id
                    AND e.status::text NOT IN ('cancelado','no_entregado')
                    AND el.producto_id = vl.producto_id), 0)
             )), '[]'::jsonb)
      FROM public.venta_lineas vl WHERE vl.venta_id = p_venta_id
    )
  );

  UPDATE public.ventas
  SET cerrado_at       = now(),
      cerrado_por      = COALESCE(p_user_id, auth.uid()),
      total_efectivo   = v_cobrable,
      cerrado_snapshot = v_snapshot
  WHERE id = p_venta_id;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) reabrir_pedido_parcial: revierte el cierre y descongela (UI exige PIN admin).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reabrir_pedido_parcial(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ventas
  SET cerrado_at = NULL, cerrado_por = NULL, total_efectivo = NULL, cerrado_snapshot = NULL
  WHERE id = p_venta_id AND cerrado_at IS NOT NULL;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cerrar_pedido_parcial(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_pedido_parcial(uuid)      TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) Candados: en pedidos cerrados no se crean ni se modifican entregas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloquea_entrega_pedido_cerrado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pedido_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.ventas WHERE id = NEW.pedido_id AND cerrado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'El pedido está cerrado parcial. Reábrelo para crear o cambiar entregas.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquea_entrega_insert_cerrado ON public.entregas;
CREATE TRIGGER trg_bloquea_entrega_insert_cerrado
BEFORE INSERT ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.bloquea_entrega_pedido_cerrado();

DROP TRIGGER IF EXISTS trg_bloquea_entrega_status_cerrado ON public.entregas;
CREATE TRIGGER trg_bloquea_entrega_status_cerrado
BEFORE UPDATE OF status ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.bloquea_entrega_pedido_cerrado();

-- Bloquear también editar la cantidad entregada de las líneas de un pedido cerrado.
CREATE OR REPLACE FUNCTION public.bloquea_entrega_linea_pedido_cerrado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pedido uuid;
BEGIN
  SELECT e.pedido_id INTO v_pedido FROM public.entregas e WHERE e.id = NEW.entrega_id;
  IF v_pedido IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.ventas WHERE id = v_pedido AND cerrado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'El pedido está cerrado parcial. Reábrelo para cambiar lo entregado.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquea_entrega_linea_cerrado ON public.entrega_lineas;
CREATE TRIGGER trg_bloquea_entrega_linea_cerrado
BEFORE UPDATE OF cantidad_entregada ON public.entrega_lineas
FOR EACH ROW EXECUTE FUNCTION public.bloquea_entrega_linea_pedido_cerrado();
