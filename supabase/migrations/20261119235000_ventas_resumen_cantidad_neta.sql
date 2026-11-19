-- Resumen de Ventas: cantidad neta (vendido − devuelto) para el encabezado de la lista.
-- Se agregan columnas al final de la vista (CREATE OR REPLACE solo permite agregar al final).
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
    GREATEST(0::numeric, COALESCE(q.vendida, 0::numeric) - COALESCE(d.devuelta, 0::numeric)) AS cantidad_neta
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
