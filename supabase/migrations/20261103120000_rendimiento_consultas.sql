-- Rendimiento (2026-10-31): las 3 consultas que más CPU consumían (pg_stat_statements).
-- Solo lectura + índices. Sin cambios de datos. RLS: vista y función son SECURITY INVOKER.
DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

-- 1) Totales de la lista de Ventas: una fila por venta con las sumas ya hechas,
--    en vez de embeber todas las partidas, cobros y promociones de cada venta.
--    lineas_descuento replica computeResumenFromLineas().descuento (src/lib/ventaResumen.ts);
--    cobrado_activo replica sumCobrosActivos() (src/lib/ventaCerrada.ts).
CREATE OR REPLACE VIEW public.ventas_resumen_v
WITH (security_invoker = true) AS
SELECT
  v.id, v.empresa_id, v.folio, v.fecha, v.created_at, v.tipo, v.status, v.condicion_pago,
  v.cliente_id, v.vendedor_id, v.almacen_id, v.es_saldo_inicial,
  v.total, v.iva_total, v.ieps_total, v.descuento_total, v.total_efectivo, v.cerrado_at,
  CASE WHEN jsonb_typeof(v.cerrado_snapshot -> 'total_efectivo') = 'number'
       THEN (v.cerrado_snapshot ->> 'total_efectivo')::numeric END AS snapshot_total_efectivo,
  COALESCE(l.descuento, 0) AS lineas_descuento,
  COALESCE(p.descuento, 0) AS promo_descuento,
  COALESCE(c.cobrado, 0)   AS cobrado_activo
FROM public.ventas v
LEFT JOIN LATERAL (
  SELECT sum(CASE WHEN x.desc_pct < 0.005 AND x.tot < 0.005 AND x.base > 0.005 THEN x.base ELSE x.desc_pct END) AS descuento
  FROM (
    SELECT COALESCE(vl.subtotal, 0) * COALESCE(vl.descuento_pct, 0) / 100 AS desc_pct,
           COALESCE(vl.total, 0) AS tot,
           CASE WHEN COALESCE(vl.subtotal, 0) > 0.005 THEN vl.subtotal
                ELSE COALESCE(vl.precio_unitario, 0) * COALESCE(vl.cantidad, 0) END AS base
    FROM public.venta_lineas vl WHERE vl.venta_id = v.id
  ) x
) l ON true
LEFT JOIN LATERAL (
  SELECT sum(COALESCE(pa.descuento_aplicado, 0)) AS descuento
  FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id
) p ON true
LEFT JOIN LATERAL (
  SELECT sum(COALESCE(ca.monto_aplicado, 0)) AS cobrado
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros co ON co.id = ca.cobro_id
  WHERE ca.venta_id = v.id AND (co.status IS NULL OR co.status = 'activo')
) c ON true;

REVOKE ALL ON public.ventas_resumen_v FROM anon;
GRANT SELECT ON public.ventas_resumen_v TO authenticated;

-- 2) Última visita por cliente en un rango (celular y Supervisor): una fila por cliente
--    en vez de descargar todas las visitas de la empresa de 40 días.
CREATE OR REPLACE FUNCTION public.ultima_visita_por_cliente(p_empresa_id uuid, p_desde timestamptz, p_hasta timestamptz)
RETURNS TABLE (cliente_id uuid, fecha timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT v.cliente_id, max(v.fecha)
  FROM public.visitas v
  WHERE v.empresa_id = p_empresa_id
    AND v.fecha >= p_desde AND v.fecha < p_hasta
    AND v.cliente_id IS NOT NULL
  GROUP BY v.cliente_id
$$;

REVOKE ALL ON FUNCTION public.ultima_visita_por_cliente(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ultima_visita_por_cliente(uuid, timestamptz, timestamptz) TO authenticated;

-- 3) Índices. Solo se crean si no existe ya uno que empiece por esas columnas.
DO $$
DECLARE
  r record;
  existe boolean;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('movimientos_inventario', ARRAY['empresa_id','created_at'],                'idx_mov_inv_empresa_created'),
    ('movimientos_inventario', ARRAY['empresa_id','producto_id','created_at'],  'idx_mov_inv_empresa_producto_created'),
    ('venta_lineas',           ARRAY['venta_id'],                               'idx_venta_lineas_venta'),
    ('cobro_aplicaciones',     ARRAY['venta_id'],                               'idx_cobro_aplicaciones_venta'),
    ('promocion_aplicada',     ARRAY['venta_id'],                               'idx_promocion_aplicada_venta'),
    ('visitas',                ARRAY['empresa_id','fecha'],                     'idx_visitas_empresa_fecha'),
    ('ventas',                 ARRAY['empresa_id','fecha'],                     'idx_ventas_empresa_fecha')
  ) t(tabla, cols, nombre)
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = ('public.' || r.tabla)::regclass
        AND i.indpred IS NULL
        AND i.indnkeyatts >= array_length(r.cols, 1)
        AND (SELECT array_agg(a.attname::text ORDER BY k.n)
             FROM unnest(i.indkey::int2[]) WITH ORDINALITY k(attnum, n)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
             WHERE k.n <= array_length(r.cols, 1)) = r.cols
    ) INTO existe;
    IF NOT existe THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', r.nombre, r.tabla,
        (SELECT string_agg(quote_ident(c), ', ') FROM unnest(r.cols) c));
      RAISE NOTICE 'Índice creado: %', r.nombre;
    END IF;
  END LOOP;
END $$;
