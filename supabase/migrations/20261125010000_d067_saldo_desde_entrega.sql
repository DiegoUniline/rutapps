-- D-067 (dueño, 2026-11-25; reemplaza la parte de saldo de D-034): en un pedido que se cobra «a lo entregado»,
-- la cuenta por cobrar nace en cuanto se genera la entrega, por las cantidades que lleva; se quita si la entrega
-- se cancela o queda «no entregado». Antes solo contaban las entregas validadas (hecho) y un pedido de contado
-- en ruta se veía en $0 (no se podía cobrar ni se exigía el cobro al entregar).
-- El estado del pedido (Entregado / Confirmado) sigue contando solo entregas «hecho» (fn_pedido_entregado_completo).

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
    -- D-034/D-067: todo pedido (contado o crédito) se cobra por lo que llevan sus entregas vigentes.
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
            AND e.status::text NOT IN ('cancelado', 'no_entregado')   -- D-067 (antes: = 'hecho')
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

-- Ahora una entrega sin validar ya pesa en el saldo: al borrarla (o quitarle renglones) se recalcula el pedido.
CREATE OR REPLACE FUNCTION public.fn_recalc_pedido_por_entrega_borrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pedido_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'entrega_lineas' THEN
    SELECT e.pedido_id INTO v_pedido_id FROM public.entregas e WHERE e.id = OLD.entrega_id;
  ELSE
    v_pedido_id := OLD.pedido_id;
  END IF;
  IF v_pedido_id IS NOT NULL THEN
    PERFORM public.fn_sync_status_pedido(v_pedido_id);
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_recalc_pedido_por_entrega_borrada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recalc_pedido_entrega_borrada ON public.entregas;
CREATE TRIGGER trg_recalc_pedido_entrega_borrada AFTER DELETE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_pedido_por_entrega_borrada();
DROP TRIGGER IF EXISTS trg_recalc_pedido_entrega_linea_borrada ON public.entrega_lineas;
CREATE TRIGGER trg_recalc_pedido_entrega_linea_borrada AFTER DELETE ON public.entrega_lineas
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_pedido_por_entrega_borrada();

-- Sin recálculo masivo (dueño: «corrige de aquí en adelante»): cada pedido toma la regla nueva la próxima vez
-- que su entrega o sus renglones cambian (trigger ajustar_pedido_por_entregado) o al registrar un cobro.
