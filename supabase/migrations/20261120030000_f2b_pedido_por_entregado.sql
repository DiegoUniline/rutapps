-- F2b (D-034): el PEDIDO dice qué se pidió; las ENTREGAS dicen qué se entregó de verdad.
--  · Solo cuenta como entregado lo de entregas en estado 'hecho' (no surtido/cargado/en ruta). [H8]
--  · El pedido queda 'entregado' cuando TODAS sus cantidades están entregadas; si falta algo vuelve/queda
--    'confirmado' (entregado parcial). Se recalcula al validar, cancelar o reabrir una entrega y al
--    ajustar cantidades. [H4, H5]
--  · El saldo de cualquier pedido (contado o crédito) es por lo entregado (antes contado debía el total).

CREATE OR REPLACE FUNCTION public.fn_venta_cobrable(v_venta ventas)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p_venta_id     uuid := v_venta.id;
  v_cobrable     numeric;
  v_orig_base    numeric;
  v_deliv_base   numeric;
  v_es_entregado boolean;
BEGIN
  IF v_venta.status::text = 'cancelado' THEN
    RETURN 0;
  END IF;

  IF v_venta.cerrado_at IS NOT NULL THEN
    v_cobrable := COALESCE(v_venta.total_efectivo, 0);
  ELSE
    -- D-034: todo pedido (contado o crédito) se cobra por lo realmente entregado.
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
            AND e.status::text = 'hecho'
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

  RETURN v_cobrable;
END;
$function$;

-- ¿Todas las cantidades del pedido ya se entregaron (entregas 'hecho')?
CREATE OR REPLACE FUNCTION public.fn_pedido_entregado_completo(p_pedido_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH pedido AS (
    SELECT producto_id, SUM(COALESCE(cantidad, 0)) AS pedida
      FROM public.venta_lineas
     WHERE venta_id = p_pedido_id AND producto_id IS NOT NULL
     GROUP BY producto_id),
  entregado AS (
    SELECT el.producto_id, SUM(COALESCE(el.cantidad_entregada, 0)) AS entregada
      FROM public.entrega_lineas el
      JOIN public.entregas e ON e.id = el.entrega_id
     WHERE e.pedido_id = p_pedido_id AND e.status::text = 'hecho'
     GROUP BY el.producto_id)
  SELECT EXISTS (SELECT 1 FROM pedido WHERE pedida > 0)
     AND NOT EXISTS (
       SELECT 1 FROM pedido p LEFT JOIN entregado d ON d.producto_id = p.producto_id
        WHERE COALESCE(d.entregada, 0) + 0.0001 < p.pedida);
$function$;

-- Estado del pedido según lo entregado. No toca borrador, facturado, cancelado ni cerrados parcial.
CREATE OR REPLACE FUNCTION public.fn_sync_status_pedido(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ped   public.ventas%ROWTYPE;
  v_nuevo text;
BEGIN
  IF p_pedido_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_ped FROM public.ventas WHERE id = p_pedido_id;
  IF NOT FOUND OR v_ped.tipo::text <> 'pedido' THEN RETURN; END IF;

  IF v_ped.status::text IN ('confirmado', 'entregado') AND v_ped.cerrado_at IS NULL THEN
    v_nuevo := CASE WHEN public.fn_pedido_entregado_completo(p_pedido_id) THEN 'entregado' ELSE 'confirmado' END;
    IF v_nuevo <> v_ped.status::text THEN
      UPDATE public.ventas SET status = v_nuevo::status_venta WHERE id = p_pedido_id;
    END IF;
  END IF;
  PERFORM public.fn_recalc_venta_saldo(p_pedido_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_sync_status_pedido(uuid) FROM PUBLIC, anon;

-- Trigger de entregas: cualquier cambio de estado (validar, cancelar, reabrir, no entregado).
CREATE OR REPLACE FUNCTION public.auto_venta_entregado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.pedido_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM public.fn_sync_status_pedido(NEW.pedido_id);
  RETURN NEW;
END;
$function$;

-- Trigger de entrega_lineas / entregas (cantidad entregada): saldo y estado.
CREATE OR REPLACE FUNCTION public.ajustar_pedido_por_entregado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pedido_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'entrega_lineas' THEN
    SELECT e.pedido_id INTO v_pedido_id FROM public.entregas e WHERE e.id = NEW.entrega_id;
  ELSE
    v_pedido_id := NEW.pedido_id;
  END IF;
  IF v_pedido_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.fn_sync_status_pedido(v_pedido_id);
  RETURN NEW;
END;
$function$;

-- Recalcular los pedidos existentes con la regla nueva.
DO $fix$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT e.pedido_id AS id FROM public.entregas e WHERE e.pedido_id IS NOT NULL LOOP
    PERFORM public.fn_sync_status_pedido(r.id);
  END LOOP;
  FOR r IN SELECT v.id FROM public.ventas v
            WHERE v.tipo::text = 'pedido' AND NOT EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = v.id) LOOP
    PERFORM public.fn_recalc_venta_saldo(r.id);
  END LOOP;
END
$fix$;
