-- Filtro «Con/Sin promoción» de Ventas: antes el front bajaba hasta 10 000 ids y los mandaba en la URL
-- (.in / .not in), lo que falla con empresas grandes. Ahora cada venta guarda `tiene_promocion`,
-- mantenido por la BD (promoción aplicada registrada o renglón regalado: precio 0 con cantidad > 0).

ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS tiene_promocion boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_venta_tiene_promocion(p_venta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.promocion_aplicada WHERE venta_id = p_venta_id)
      OR EXISTS (SELECT 1 FROM public.venta_lineas
                  WHERE venta_id = p_venta_id AND COALESCE(precio_unitario, 0) = 0 AND COALESCE(cantidad, 0) > 0);
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_venta_tiene_promocion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ids uuid[];
BEGIN
  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[
             CASE WHEN TG_OP <> 'INSERT' THEN OLD.venta_id END,
             CASE WHEN TG_OP <> 'DELETE' THEN NEW.venta_id END]) x WHERE x IS NOT NULL);
  UPDATE public.ventas v
     SET tiene_promocion = public.fn_venta_tiene_promocion(v.id)
   WHERE v.id = ANY(v_ids)
     AND v.tiene_promocion IS DISTINCT FROM public.fn_venta_tiene_promocion(v.id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_promocion_aplicada_tiene_promo ON public.promocion_aplicada;
CREATE TRIGGER trg_promocion_aplicada_tiene_promo
  AFTER INSERT OR UPDATE OF venta_id OR DELETE ON public.promocion_aplicada
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_venta_tiene_promocion();

DROP TRIGGER IF EXISTS trg_venta_lineas_tiene_promo ON public.venta_lineas;
CREATE TRIGGER trg_venta_lineas_tiene_promo
  AFTER INSERT OR UPDATE OF precio_unitario, cantidad, venta_id OR DELETE ON public.venta_lineas
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_venta_tiene_promocion();

-- Valor inicial de las ventas existentes.
UPDATE public.ventas v SET tiene_promocion = true
 WHERE NOT v.tiene_promocion
   AND (EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id)
        OR EXISTS (SELECT 1 FROM public.venta_lineas vl
                    WHERE vl.venta_id = v.id AND COALESCE(vl.precio_unitario, 0) = 0 AND COALESCE(vl.cantidad, 0) > 0));

CREATE INDEX IF NOT EXISTS idx_ventas_emp_promo_created ON public.ventas (empresa_id, tiene_promocion, created_at DESC);

-- La vista del resumen de la lista también filtra por promoción.
CREATE OR REPLACE VIEW public.ventas_resumen_v
WITH (security_invoker = true) AS
 SELECT v.id,
    v.empresa_id,
    v.folio,
    v.fecha,
    v.created_at,
    v.tipo,
    v.status,
    v.condicion_pago,
    v.cliente_id,
    v.vendedor_id,
    v.almacen_id,
    v.es_saldo_inicial,
    v.total,
    v.iva_total,
    v.ieps_total,
    v.descuento_total,
    v.total_efectivo,
    v.cerrado_at,
        CASE
            WHEN jsonb_typeof(v.cerrado_snapshot -> 'total_efectivo'::text) = 'number'::text THEN (v.cerrado_snapshot ->> 'total_efectivo'::text)::numeric
            ELSE NULL::numeric
        END AS snapshot_total_efectivo,
    COALESCE(l.descuento, 0::numeric) AS lineas_descuento,
    COALESCE(p.descuento, 0::numeric) AS promo_descuento,
    COALESCE(c.cobrado, 0::numeric) AS cobrado_activo,
    GREATEST(0::numeric, COALESCE(q.vendida, 0::numeric) - COALESCE(d.devuelta, 0::numeric)) AS cantidad_neta,
    v.tiene_promocion
   FROM ventas v
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN x.desc_pct < 0.005 AND x.tot < 0.005 AND x.base > 0.005 THEN x.base
                    ELSE x.desc_pct
                END) AS descuento
           FROM ( SELECT COALESCE(vl.subtotal, 0::numeric) * COALESCE(vl.descuento_pct, 0::numeric) / 100::numeric AS desc_pct,
                    COALESCE(vl.total, 0::numeric) AS tot,
                        CASE
                            WHEN COALESCE(vl.subtotal, 0::numeric) > 0.005 THEN vl.subtotal
                            ELSE COALESCE(vl.precio_unitario, 0::numeric) * COALESCE(vl.cantidad, 0::numeric)
                        END AS base
                   FROM venta_lineas vl
                  WHERE vl.venta_id = v.id) x) l ON true
     LEFT JOIN LATERAL ( SELECT sum(COALESCE(pa.descuento_aplicado, 0::numeric)) AS descuento
           FROM promocion_aplicada pa
          WHERE pa.venta_id = v.id) p ON true
     LEFT JOIN LATERAL ( SELECT sum(COALESCE(ca.monto_aplicado, 0::numeric)) AS cobrado
           FROM cobro_aplicaciones ca
             JOIN cobros co ON co.id = ca.cobro_id
          WHERE ca.venta_id = v.id AND (co.status IS NULL OR co.status = 'activo'::text)) c ON true
     LEFT JOIN LATERAL ( SELECT sum(COALESCE(vl.cantidad, 0::numeric)) AS vendida
           FROM venta_lineas vl
          WHERE vl.venta_id = v.id) q ON true
     LEFT JOIN LATERAL ( SELECT sum(COALESCE(dl.cantidad, 0::numeric)) AS devuelta
           FROM devoluciones dv
             JOIN devolucion_lineas dl ON dl.devolucion_id = dv.id
          WHERE dv.venta_id = v.id) d ON true;
