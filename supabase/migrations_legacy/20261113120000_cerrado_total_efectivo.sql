-- Pedidos con cierre parcial: el total entregado (total_efectivo) se recalcula cuando cambia el total.
-- Caso real: Tampico PED-0903. Se cerró con total_efectivo 975.60; después se corrigieron precios
-- (corrección administrativa) y el total quedó en 951, pero total_efectivo siguió en 975.60 y dejó
-- un saldo fantasma de 11.02. Misma fórmula que cerrar_pedido_parcial: total × base entregada / base original.
DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.fn_total_efectivo_cerrado(p_venta_id uuid, p_total numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig_base  numeric;
  v_deliv_base numeric;
BEGIN
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

  IF COALESCE(v_orig_base, 0) <= 0 THEN RETURN 0; END IF;
  RETURN ROUND(COALESCE(p_total, 0) * (v_deliv_base / v_orig_base), 2);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_total_efectivo_cerrado(uuid, numeric) FROM PUBLIC, anon;

-- Mismo cuerpo que en 20261020210000_inventario_fase1.sql + recálculo de total_efectivo si está cerrado.
CREATE OR REPLACE FUNCTION public.recalc_venta_saldo_on_total_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pagado numeric;
BEGIN
  -- Pedido cerrado como parcial: si cambia el total (p. ej. corrección de precios),
  -- lo entregado se revalúa con los precios nuevos.
  IF NEW.cerrado_at IS NOT NULL AND NEW.total IS DISTINCT FROM OLD.total THEN
    NEW.total_efectivo := public.fn_total_efectivo_cerrado(NEW.id, NEW.total);
  END IF;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
  FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = NEW.id AND c.status <> 'cancelado';
  -- Misma regla que fn_recalc_venta_saldo (política de cobro, cierre parcial); nunca negativo.
  NEW.saldo_pendiente := GREATEST(0, public.fn_venta_cobrable(NEW) - v_pagado);
  RETURN NEW;
END;
$function$;
