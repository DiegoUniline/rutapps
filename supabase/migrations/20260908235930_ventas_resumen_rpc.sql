-- Fase 1 de rendimiento: resúmenes de Ventas calculados en PostgreSQL.
--
-- Antes, la pantalla descargaba todas las ventas/renglones/cobros/promociones
-- para sumar siete números en el navegador. Estas funciones devuelven una sola
-- fila y reproducen las mismas reglas visuales; no escriben datos ni cambian
-- cálculos de venta, inventario, cobro o promociones.

CREATE OR REPLACE FUNCTION public.fn_ventas_resumen(
  p_empresa_id uuid,
  p_vendedor_scope uuid DEFAULT NULL,
  p_statuses public.status_venta[] DEFAULT NULL,
  p_tipos public.tipo_venta[] DEFAULT NULL,
  p_condiciones public.condicion_pago[] DEFAULT NULL,
  p_vendedor_ids uuid[] DEFAULT NULL,
  p_cliente_ids uuid[] DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_promocion text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  ventas_count bigint,
  subtotal_sin_impuestos numeric,
  descuento numeric,
  impuestos numeric,
  total_efectivo numeric,
  pagado numeric,
  saldo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_service_role boolean := COALESCE(auth.role(), '') = 'service_role';
  v_database_admin boolean := session_user IN ('postgres', 'supabase_admin');
  v_search text := NULLIF(lower(btrim(p_search)), '');
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'La empresa es obligatoria' USING ERRCODE = '22023';
  END IF;

  IF NOT v_service_role AND NOT v_database_admin AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE = '42501';
  END IF;

  -- Una sola comprobación de tenant. La función no confía solamente en el
  -- empresa_id recibido y nunca devuelve información de otra empresa.
  IF NOT v_service_role AND NOT v_database_admin
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa' USING ERRCODE = '42501';
  END IF;

  IF p_promocion IS NOT NULL AND p_promocion NOT IN ('si', 'no') THEN
    RAISE EXCEPTION 'Filtro de promoción inválido' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH filtered AS MATERIALIZED (
    SELECT
      v.id,
      v.total,
      v.iva_total,
      v.ieps_total,
      v.descuento_total,
      v.status,
      v.total_efectivo,
      v.cerrado_at,
      v.cerrado_snapshot
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND v.es_saldo_inicial = false
      AND (p_vendedor_scope IS NULL OR v.vendedor_id = p_vendedor_scope)
      AND (p_statuses IS NULL OR v.status = ANY(p_statuses))
      AND (p_tipos IS NULL OR v.tipo = ANY(p_tipos))
      AND (p_condiciones IS NULL OR v.condicion_pago = ANY(p_condiciones))
      AND (p_vendedor_ids IS NULL OR v.vendedor_id = ANY(p_vendedor_ids))
      AND (p_cliente_ids IS NULL OR v.cliente_id = ANY(p_cliente_ids))
      AND (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
      AND (
        v_search IS NULL
        OR strpos(lower(COALESCE(v.folio, '')), v_search) > 0
        OR EXISTS (
          SELECT 1 FROM public.clientes c
          WHERE c.id = v.cliente_id
            AND strpos(lower(COALESCE(c.nombre, '')), v_search) > 0
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = v.vendedor_id
            AND strpos(lower(COALESCE(pr.nombre, '')), v_search) > 0
        )
        OR EXISTS (
          SELECT 1 FROM public.almacenes a
          WHERE a.id = v.almacen_id
            AND strpos(lower(COALESCE(a.nombre, '')), v_search) > 0
        )
      )
      AND (
        p_promocion IS NULL
        OR (
          p_promocion = 'si'
          AND (
            EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id)
            OR EXISTS (
              SELECT 1 FROM public.venta_lineas vlp
              WHERE vlp.venta_id = v.id
                AND vlp.precio_unitario = 0
                AND vlp.cantidad > 0
            )
          )
        )
        OR (
          p_promocion = 'no'
          AND NOT EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id)
          AND NOT EXISTS (
            SELECT 1 FROM public.venta_lineas vlp
            WHERE vlp.venta_id = v.id
              AND vlp.precio_unitario = 0
              AND vlp.cantidad > 0
          )
        )
      )
  ),
  line_discounts AS (
    SELECT
      vl.venta_id,
      round(sum(
        CASE
          WHEN COALESCE(vl.subtotal, 0) * (COALESCE(vl.descuento_pct, 0) / 100) < 0.005
               AND COALESCE(vl.total, 0) < 0.005
               AND CASE
                     WHEN COALESCE(vl.subtotal, 0) > 0.005 THEN COALESCE(vl.subtotal, 0)
                     ELSE COALESCE(vl.precio_unitario, 0) * COALESCE(vl.cantidad, 0)
                   END > 0.005
            THEN CASE
                   WHEN COALESCE(vl.subtotal, 0) > 0.005 THEN COALESCE(vl.subtotal, 0)
                   ELSE COALESCE(vl.precio_unitario, 0) * COALESCE(vl.cantidad, 0)
                 END
          ELSE COALESCE(vl.subtotal, 0) * (COALESCE(vl.descuento_pct, 0) / 100)
        END
      ), 2) AS descuento_lineas
    FROM public.venta_lineas vl
    JOIN filtered f ON f.id = vl.venta_id
    GROUP BY vl.venta_id
  ),
  promo_discounts AS (
    SELECT pa.venta_id, sum(COALESCE(pa.descuento_aplicado, 0)) AS descuento_promos
    FROM public.promocion_aplicada pa
    JOIN filtered f ON f.id = pa.venta_id
    GROUP BY pa.venta_id
  ),
  active_payments AS (
    SELECT ca.venta_id, sum(COALESCE(ca.monto_aplicado, 0)) AS cobrado
    FROM public.cobro_aplicaciones ca
    JOIN public.cobros c ON c.id = ca.cobro_id AND c.status = 'activo'
    JOIN filtered f ON f.id = ca.venta_id
    GROUP BY ca.venta_id
  ),
  calculated AS (
    SELECT
      f.id,
      f.status,
      COALESCE(f.iva_total, 0) + COALESCE(f.ieps_total, 0) AS impuestos_venta,
      greatest(
        COALESCE(ld.descuento_lineas, 0),
        COALESCE(pd.descuento_promos, 0),
        COALESCE(f.descuento_total, 0)
      ) AS descuento_venta,
      greatest(
        0::numeric,
        COALESCE(f.total, 0) - COALESCE(f.iva_total, 0) - COALESCE(f.ieps_total, 0)
      ) AS gravable,
      CASE
        WHEN f.cerrado_at IS NOT NULL THEN COALESCE(
          f.total_efectivo,
          NULLIF(f.cerrado_snapshot ->> 'total_efectivo', '')::numeric,
          f.total,
          0
        )
        ELSE COALESCE(f.total, 0)
      END AS total_real,
      COALESCE(ap.cobrado, 0) AS cobrado
    FROM filtered f
    LEFT JOIN line_discounts ld ON ld.venta_id = f.id
    LEFT JOIN promo_discounts pd ON pd.venta_id = f.id
    LEFT JOIN active_payments ap ON ap.venta_id = f.id
  ),
  with_balance AS (
    SELECT
      c.*,
      CASE
        WHEN c.status = 'cancelado' THEN 0::numeric
        ELSE greatest(0::numeric, c.total_real - c.cobrado)
      END AS saldo_real
    FROM calculated c
  )
  SELECT
    count(*)::bigint AS ventas_count,
    COALESCE(sum(wb.gravable + wb.descuento_venta), 0)::numeric AS subtotal_sin_impuestos,
    COALESCE(sum(wb.descuento_venta), 0)::numeric AS descuento,
    COALESCE(sum(wb.impuestos_venta), 0)::numeric AS impuestos,
    COALESCE(sum(wb.total_real), 0)::numeric AS total_efectivo,
    COALESCE(sum(greatest(0::numeric, wb.total_real - wb.saldo_real)), 0)::numeric AS pagado,
    COALESCE(sum(wb.saldo_real), 0)::numeric AS saldo
  FROM with_balance wb;
END;
$function$;


CREATE OR REPLACE FUNCTION public.fn_venta_lineas_resumen(
  p_empresa_id uuid,
  p_vendedor_scope uuid DEFAULT NULL,
  p_statuses public.status_venta[] DEFAULT NULL,
  p_tipos public.tipo_venta[] DEFAULT NULL,
  p_condiciones public.condicion_pago[] DEFAULT NULL,
  p_vendedor_ids uuid[] DEFAULT NULL,
  p_cliente_ids uuid[] DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_promocion text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  lineas_count bigint,
  cantidad numeric,
  total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_service_role boolean := COALESCE(auth.role(), '') = 'service_role';
  v_database_admin boolean := session_user IN ('postgres', 'supabase_admin');
  v_search text := NULLIF(lower(btrim(p_search)), '');
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'La empresa es obligatoria' USING ERRCODE = '22023';
  END IF;

  IF NOT v_service_role AND NOT v_database_admin AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE = '42501';
  END IF;

  IF NOT v_service_role AND NOT v_database_admin
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa' USING ERRCODE = '42501';
  END IF;

  IF p_promocion IS NOT NULL AND p_promocion NOT IN ('si', 'no') THEN
    RAISE EXCEPTION 'Filtro de promoción inválido' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH filtered_sales AS MATERIALIZED (
    SELECT v.id
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND (p_vendedor_scope IS NULL OR v.vendedor_id = p_vendedor_scope)
      AND (p_statuses IS NULL OR v.status = ANY(p_statuses))
      AND (p_tipos IS NULL OR v.tipo = ANY(p_tipos))
      AND (p_condiciones IS NULL OR v.condicion_pago = ANY(p_condiciones))
      AND (p_vendedor_ids IS NULL OR v.vendedor_id = ANY(p_vendedor_ids))
      AND (p_cliente_ids IS NULL OR v.cliente_id = ANY(p_cliente_ids))
      AND (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
      AND (
        p_promocion IS NULL
        OR (
          p_promocion = 'si'
          AND (
            EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id)
            OR EXISTS (
              SELECT 1 FROM public.venta_lineas vlp
              WHERE vlp.venta_id = v.id
                AND vlp.precio_unitario = 0
                AND vlp.cantidad > 0
            )
          )
        )
        OR (
          p_promocion = 'no'
          AND NOT EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id)
          AND NOT EXISTS (
            SELECT 1 FROM public.venta_lineas vlp
            WHERE vlp.venta_id = v.id
              AND vlp.precio_unitario = 0
              AND vlp.cantidad > 0
          )
        )
      )
  )
  SELECT
    count(*)::bigint AS lineas_count,
    COALESCE(sum(COALESCE(vl.cantidad, 0)), 0)::numeric AS cantidad,
    COALESCE(sum(COALESCE(vl.total, 0)), 0)::numeric AS total
  FROM public.venta_lineas vl
  JOIN filtered_sales fs ON fs.id = vl.venta_id
  WHERE v_search IS NULL
     OR EXISTS (
       SELECT 1 FROM public.productos p
       WHERE p.id = vl.producto_id
         AND (
           strpos(lower(COALESCE(p.nombre, '')), v_search) > 0
           OR strpos(lower(COALESCE(p.codigo, '')), v_search) > 0
         )
     )
     OR EXISTS (
       SELECT 1 FROM public.ventas vs
       WHERE vs.id = vl.venta_id
         AND strpos(lower(COALESCE(vs.folio, '')), v_search) > 0
     );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ventas_resumen(
  uuid, uuid, public.status_venta[], public.tipo_venta[], public.condicion_pago[],
  uuid[], uuid[], date, date, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ventas_resumen(
  uuid, uuid, public.status_venta[], public.tipo_venta[], public.condicion_pago[],
  uuid[], uuid[], date, date, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_venta_lineas_resumen(
  uuid, uuid, public.status_venta[], public.tipo_venta[], public.condicion_pago[],
  uuid[], uuid[], date, date, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_venta_lineas_resumen(
  uuid, uuid, public.status_venta[], public.tipo_venta[], public.condicion_pago[],
  uuid[], uuid[], date, date, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_ventas_resumen(
  uuid, uuid, public.status_venta[], public.tipo_venta[], public.condicion_pago[],
  uuid[], uuid[], date, date, text, text
) IS 'Resumen de Ventas de solo lectura; reemplaza la descarga completa usada por el listado.';

COMMENT ON FUNCTION public.fn_venta_lineas_resumen(
  uuid, uuid, public.status_venta[], public.tipo_venta[], public.condicion_pago[],
  uuid[], uuid[], date, date, text, text
) IS 'Totales de la vista Productos vendidos sin descargar todos los renglones.';
