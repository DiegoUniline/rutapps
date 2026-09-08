-- Customer Intelligence for Dashboard.
-- Aggregates behavior in PostgreSQL so the browser never downloads the full
-- sales history. Both functions validate the tenant once and are read-only.

CREATE OR REPLACE FUNCTION public.fn_customer_intelligence_snapshot(
  p_empresa_id uuid,
  p_window_days integer DEFAULT 30,
  p_inactive_days integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_window_days integer := LEAST(180, GREATEST(7, COALESCE(p_window_days, 30)));
  v_inactive_days integer := LEAST(365, GREATEST(15, COALESCE(p_inactive_days, 45)));
  v_current_from date := current_date - (v_window_days - 1);
  v_previous_from date := current_date - (v_window_days * 2 - 1);
  v_result jsonb;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'p_empresa_id es obligatorio' USING ERRCODE = '22004';
  END IF;

  IF p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para consultar esta empresa'
      USING ERRCODE = '42501';
  END IF;

  WITH eligible_sales AS MATERIALIZED (
    SELECT v.id, v.cliente_id, v.fecha, COALESCE(v.total_efectivo, v.total, 0)::numeric AS total
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND v.cliente_id IS NOT NULL
      AND v.fecha <= current_date
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('cancelado', 'borrador')
  ),
  sale_days AS MATERIALIZED (
    SELECT DISTINCT es.cliente_id, es.fecha
    FROM eligible_sales es
  ),
  sale_gaps AS MATERIALIZED (
    SELECT
      sd.cliente_id,
      sd.fecha - LAG(sd.fecha) OVER (PARTITION BY sd.cliente_id ORDER BY sd.fecha) AS gap_days
    FROM sale_days sd
  ),
  gap_stats AS MATERIALIZED (
    SELECT sg.cliente_id, ROUND(AVG(sg.gap_days) FILTER (WHERE sg.gap_days > 0), 1) AS avg_gap_days
    FROM sale_gaps sg
    GROUP BY sg.cliente_id
  ),
  sales_stats AS MATERIALIZED (
    SELECT
      es.cliente_id,
      MIN(es.fecha) AS first_purchase,
      MAX(es.fecha) AS last_purchase,
      COUNT(*)::integer AS lifetime_orders,
      COALESCE(SUM(es.total), 0)::numeric AS lifetime_total,
      COUNT(DISTINCT date_trunc('month', es.fecha::timestamp))::integer AS active_months,
      COUNT(*) FILTER (WHERE es.fecha >= v_current_from)::integer AS recent_orders,
      COALESCE(SUM(es.total) FILTER (WHERE es.fecha >= v_current_from), 0)::numeric AS recent_total,
      COUNT(*) FILTER (WHERE es.fecha >= v_previous_from AND es.fecha < v_current_from)::integer AS previous_orders,
      COALESCE(SUM(es.total) FILTER (WHERE es.fecha >= v_previous_from AND es.fecha < v_current_from), 0)::numeric AS previous_total,
      MAX(es.fecha) FILTER (WHERE es.fecha < v_current_from) AS purchase_before_window
    FROM eligible_sales es
    GROUP BY es.cliente_id
  ),
  client_base AS MATERIALIZED (
    SELECT
      c.id,
      c.codigo,
      c.nombre,
      c.status,
      COALESCE(c.fecha_alta, c.created_at::date) AS signup_date,
      c.vendedor_id,
      COALESCE(pr.nombre, 'Sin vendedor') AS seller_name,
      c.zona_id,
      COALESCE(z.nombre, 'Sin zona') AS zone_name,
      ss.first_purchase,
      ss.last_purchase,
      COALESCE(ss.lifetime_orders, 0) AS lifetime_orders,
      COALESCE(ss.lifetime_total, 0) AS lifetime_total,
      COALESCE(ss.active_months, 0) AS active_months,
      COALESCE(ss.recent_orders, 0) AS recent_orders,
      COALESCE(ss.recent_total, 0) AS recent_total,
      COALESCE(ss.previous_orders, 0) AS previous_orders,
      COALESCE(ss.previous_total, 0) AS previous_total,
      ss.purchase_before_window,
      gs.avg_gap_days,
      CASE WHEN ss.last_purchase IS NULL THEN NULL ELSE current_date - ss.last_purchase END AS days_since_purchase,
      CASE
        WHEN COALESCE(ss.lifetime_orders, 0) = 0 THEN 0
        ELSE ROUND(ss.lifetime_total / ss.lifetime_orders, 2)
      END AS avg_ticket,
      CASE
        WHEN COALESCE(ss.previous_total, 0) > 0
          THEN ROUND(((COALESCE(ss.recent_total, 0) - ss.previous_total) / ss.previous_total) * 100, 1)
        WHEN COALESCE(ss.recent_total, 0) > 0 THEN 100
        ELSE NULL
      END AS change_pct,
      CASE
        WHEN ss.last_purchase IS NULL THEN NULL
        ELSE ss.last_purchase + GREATEST(7, CEIL(COALESCE(gs.avg_gap_days, v_inactive_days))::integer)
      END AS expected_next_purchase
    FROM public.clientes c
    LEFT JOIN sales_stats ss ON ss.cliente_id = c.id
    LEFT JOIN gap_stats gs ON gs.cliente_id = c.id
    LEFT JOIN public.profiles pr ON pr.id = c.vendedor_id
    LEFT JOIN public.zonas z ON z.id = c.zona_id
    WHERE c.empresa_id = p_empresa_id
  ),
  classified AS MATERIALIZED (
    SELECT
      cb.*,
      CASE
        WHEN cb.lifetime_orders = 0 THEN 'sin_compras'
        WHEN cb.first_purchase >= v_current_from THEN 'nuevo'
        WHEN cb.recent_orders > 0
             AND cb.previous_orders = 0
             AND cb.purchase_before_window < v_previous_from THEN 'recuperado'
        WHEN cb.days_since_purchase > v_inactive_days * 2 THEN 'perdido'
        WHEN cb.days_since_purchase > v_inactive_days THEN 'inactivo'
        WHEN cb.expected_next_purchase IS NOT NULL
             AND current_date > cb.expected_next_purchase + GREATEST(3, CEIL(COALESCE(cb.avg_gap_days, 7) * 0.5)::integer)
          THEN 'en_riesgo'
        WHEN cb.previous_total > 0 AND cb.recent_total < cb.previous_total * 0.85 THEN 'bajando'
        WHEN cb.previous_total > 0 AND cb.recent_total > cb.previous_total * 1.15 THEN 'creciendo'
        ELSE 'estable'
      END AS segment,
      CASE
        WHEN cb.expected_next_purchase IS NULL THEN NULL
        ELSE current_date - cb.expected_next_purchase
      END AS days_overdue
    FROM client_base cb
  ),
  segment_stats AS MATERIALIZED (
    SELECT
      c.segment,
      COUNT(*)::integer AS clients,
      COALESCE(SUM(c.recent_total), 0)::numeric AS recent_total,
      COALESCE(SUM(c.previous_total), 0)::numeric AS previous_total,
      COALESCE(SUM(c.lifetime_total), 0)::numeric AS lifetime_total
    FROM classified c
    GROUP BY c.segment
  ),
  portfolio_months AS MATERIALIZED (
    SELECT generate_series(
      date_trunc('month', current_date)::date - interval '11 months',
      date_trunc('month', current_date)::date,
      interval '1 month'
    )::date AS month
  ),
  portfolio_sales AS MATERIALIZED (
    SELECT
      date_trunc('month', es.fecha::timestamp)::date AS month,
      COUNT(*)::integer AS orders,
      COUNT(DISTINCT es.cliente_id)::integer AS buyers,
      COALESCE(SUM(es.total), 0)::numeric AS total
    FROM eligible_sales es
    WHERE es.fecha >= date_trunc('month', current_date)::date - interval '11 months'
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_days', v_window_days,
    'inactive_days', v_inactive_days,
    'metrics', jsonb_build_object(
      'clients_total', (SELECT COUNT(*) FROM classified),
      'active_clients', (SELECT COUNT(*) FROM classified WHERE status = 'activo'),
      'buyers_lifetime', (SELECT COUNT(*) FROM classified WHERE lifetime_orders > 0),
      'buyers_recent', (SELECT COUNT(*) FROM classified WHERE recent_orders > 0),
      'new_signups', (SELECT COUNT(*) FROM classified WHERE signup_date >= v_current_from),
      'retained_buyers', (SELECT COUNT(*) FROM classified WHERE recent_orders > 0 AND previous_orders > 0),
      'previous_buyers', (SELECT COUNT(*) FROM classified WHERE previous_orders > 0),
      'retention_pct', COALESCE((
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE recent_orders > 0 AND previous_orders > 0)
          / NULLIF(COUNT(*) FILTER (WHERE previous_orders > 0), 0), 1)
        FROM classified
      ), 0),
      'recent_revenue', (SELECT COALESCE(SUM(recent_total), 0) FROM classified),
      'previous_revenue', (SELECT COALESCE(SUM(previous_total), 0) FROM classified),
      'revenue_at_risk', (SELECT COALESCE(SUM(previous_total), 0) FROM classified WHERE segment IN ('bajando', 'en_riesgo', 'inactivo', 'perdido')),
      'avg_ticket_recent', COALESCE((
        SELECT ROUND(SUM(recent_total) / NULLIF(SUM(recent_orders), 0), 2) FROM classified
      ), 0)
    ),
    'segments', COALESCE((
      SELECT jsonb_object_agg(ss.segment, jsonb_build_object(
        'clients', ss.clients,
        'recent_total', ss.recent_total,
        'previous_total', ss.previous_total,
        'lifetime_total', ss.lifetime_total
      )) FROM segment_stats ss
    ), '{}'::jsonb),
    'monthly_portfolio', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', pm.month,
        'orders', COALESCE(ps.orders, 0),
        'buyers', COALESCE(ps.buyers, 0),
        'total', COALESCE(ps.total, 0)
      ) ORDER BY pm.month)
      FROM portfolio_months pm
      LEFT JOIN portfolio_sales ps ON ps.month = pm.month
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY
        CASE c.segment
          WHEN 'en_riesgo' THEN 1 WHEN 'bajando' THEN 2 WHEN 'inactivo' THEN 3
          WHEN 'perdido' THEN 4 WHEN 'recuperado' THEN 5 WHEN 'creciendo' THEN 6
          WHEN 'nuevo' THEN 7 WHEN 'estable' THEN 8 ELSE 9
        END,
        c.previous_total DESC,
        c.nombre
      ) FROM classified c
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_customer_intelligence_detail(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_months integer DEFAULT 12,
  p_window_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_months integer := LEAST(36, GREATEST(3, COALESCE(p_months, 12)));
  v_window_days integer := LEAST(180, GREATEST(7, COALESCE(p_window_days, 30)));
  v_current_from date := current_date - (v_window_days - 1);
  v_previous_from date := current_date - (v_window_days * 2 - 1);
  v_history_from date := (date_trunc('month', current_date) - ((v_months - 1) || ' months')::interval)::date;
  v_result jsonb;
BEGIN
  IF p_empresa_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Empresa y cliente son obligatorios' USING ERRCODE = '22004';
  END IF;

  IF p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para consultar esta empresa'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id = p_cliente_id AND c.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece a la empresa' USING ERRCODE = '22023';
  END IF;

  WITH client_sales AS MATERIALIZED (
    SELECT v.id, v.folio, v.fecha, v.tipo::text AS type, v.status::text AS status,
      COALESCE(v.total_efectivo, v.total, 0)::numeric AS total
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND v.cliente_id = p_cliente_id
      AND v.fecha <= current_date
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('cancelado', 'borrador')
  ),
  months AS MATERIALIZED (
    SELECT generate_series(
      date_trunc('month', current_date)::date - ((v_months - 1) || ' months')::interval,
      date_trunc('month', current_date)::date,
      interval '1 month'
    )::date AS period
  ),
  month_sales AS MATERIALIZED (
    SELECT date_trunc('month', cs.fecha::timestamp)::date AS period,
      COUNT(*)::integer AS orders, COALESCE(SUM(cs.total), 0)::numeric AS total
    FROM client_sales cs
    WHERE cs.fecha >= v_history_from
    GROUP BY 1
  ),
  weeks AS MATERIALIZED (
    SELECT generate_series(
      date_trunc('week', current_date)::date - interval '15 weeks',
      date_trunc('week', current_date)::date,
      interval '1 week'
    )::date AS period
  ),
  week_sales AS MATERIALIZED (
    SELECT date_trunc('week', cs.fecha::timestamp)::date AS period,
      COUNT(*)::integer AS orders, COALESCE(SUM(cs.total), 0)::numeric AS total
    FROM client_sales cs
    WHERE cs.fecha >= date_trunc('week', current_date)::date - interval '15 weeks'
    GROUP BY 1
  ),
  product_sales AS MATERIALIZED (
    SELECT
      vl.producto_id,
      COALESCE(SUM(vl.cantidad), 0)::numeric AS history_qty,
      COALESCE(SUM(vl.total), 0)::numeric AS history_total,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE cs.fecha >= v_current_from), 0)::numeric AS recent_qty,
      COALESCE(SUM(vl.total) FILTER (WHERE cs.fecha >= v_current_from), 0)::numeric AS recent_total,
      COALESCE(SUM(vl.cantidad) FILTER (WHERE cs.fecha >= v_previous_from AND cs.fecha < v_current_from), 0)::numeric AS previous_qty,
      COALESCE(SUM(vl.total) FILTER (WHERE cs.fecha >= v_previous_from AND cs.fecha < v_current_from), 0)::numeric AS previous_total,
      MAX(cs.fecha) AS last_purchase
    FROM client_sales cs
    JOIN public.venta_lineas vl ON vl.venta_id = cs.id
    WHERE cs.fecha >= v_history_from
      AND vl.producto_id IS NOT NULL
    GROUP BY vl.producto_id
  ),
  product_detail AS MATERIALIZED (
    SELECT
      ps.producto_id AS id,
      p.codigo,
      p.nombre,
      COALESCE(u.abreviatura, u.nombre, 'uds') AS unit,
      ps.history_qty,
      ps.history_total,
      ps.recent_qty,
      ps.recent_total,
      ps.previous_qty,
      ps.previous_total,
      ps.last_purchase,
      CASE
        WHEN ps.previous_qty > 0 THEN ROUND(((ps.recent_qty - ps.previous_qty) / ps.previous_qty) * 100, 1)
        WHEN ps.recent_qty > 0 THEN 100
        ELSE NULL
      END AS qty_change_pct,
      CASE
        WHEN ps.previous_total > 0 THEN ROUND(((ps.recent_total - ps.previous_total) / ps.previous_total) * 100, 1)
        WHEN ps.recent_total > 0 THEN 100
        ELSE NULL
      END AS total_change_pct,
      CASE
        WHEN ps.recent_qty = 0 AND ps.previous_qty > 0 THEN 'detenido'
        WHEN ps.previous_qty > 0 AND ps.recent_qty < ps.previous_qty * 0.85 THEN 'bajando'
        WHEN ps.previous_qty > 0 AND ps.recent_qty > ps.previous_qty * 1.15 THEN 'creciendo'
        ELSE 'estable'
      END AS trend
    FROM product_sales ps
    JOIN public.productos p ON p.id = ps.producto_id AND p.empresa_id = p_empresa_id
    LEFT JOIN public.unidades u ON u.id = p.unidad_venta_id
  ),
  client_summary AS MATERIALIZED (
    SELECT
      COUNT(*)::integer AS orders,
      COALESCE(SUM(total), 0)::numeric AS lifetime_total,
      MIN(fecha) AS first_purchase,
      MAX(fecha) AS last_purchase,
      COALESCE(SUM(total) FILTER (WHERE fecha >= v_current_from), 0)::numeric AS recent_total,
      COALESCE(SUM(total) FILTER (WHERE fecha >= v_previous_from AND fecha < v_current_from), 0)::numeric AS previous_total
    FROM client_sales
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_days', v_window_days,
    'client', (
      SELECT jsonb_build_object(
        'id', c.id,
        'codigo', c.codigo,
        'nombre', c.nombre,
        'status', c.status,
        'signup_date', COALESCE(c.fecha_alta, c.created_at::date),
        'seller_name', COALESCE(pr.nombre, 'Sin vendedor'),
        'zone_name', COALESCE(z.nombre, 'Sin zona'),
        'first_purchase', cs.first_purchase,
        'last_purchase', cs.last_purchase,
        'orders', cs.orders,
        'lifetime_total', cs.lifetime_total,
        'avg_ticket', CASE WHEN cs.orders > 0 THEN ROUND(cs.lifetime_total / cs.orders, 2) ELSE 0 END,
        'recent_total', cs.recent_total,
        'previous_total', cs.previous_total,
        'change_pct', CASE
          WHEN cs.previous_total > 0 THEN ROUND(((cs.recent_total - cs.previous_total) / cs.previous_total) * 100, 1)
          WHEN cs.recent_total > 0 THEN 100 ELSE NULL END
      )
      FROM public.clientes c
      CROSS JOIN client_summary cs
      LEFT JOIN public.profiles pr ON pr.id = c.vendedor_id
      LEFT JOIN public.zonas z ON z.id = c.zona_id
      WHERE c.id = p_cliente_id AND c.empresa_id = p_empresa_id
    ),
    'monthly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'period', m.period,
        'orders', COALESCE(ms.orders, 0),
        'total', COALESCE(ms.total, 0)
      ) ORDER BY m.period)
      FROM months m LEFT JOIN month_sales ms ON ms.period = m.period
    ), '[]'::jsonb),
    'weekly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'period', w.period,
        'orders', COALESCE(ws.orders, 0),
        'total', COALESCE(ws.total, 0)
      ) ORDER BY w.period)
      FROM weeks w LEFT JOIN week_sales ws ON ws.period = w.period
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(to_jsonb(pd) ORDER BY
        CASE pd.trend WHEN 'detenido' THEN 1 WHEN 'bajando' THEN 2 WHEN 'creciendo' THEN 3 ELSE 4 END,
        pd.previous_total DESC,
        pd.nombre
      ) FROM product_detail pd
    ), '[]'::jsonb),
    'recent_purchases', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.fecha DESC, r.id DESC)
      FROM (
        SELECT cs.id, cs.folio, cs.fecha, cs.type, cs.status, cs.total
        FROM client_sales cs ORDER BY cs.fecha DESC, cs.id DESC LIMIT 25
      ) r
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_customer_intelligence_snapshot(uuid, integer, integer)
  IS 'Radar agregado y segmentación de comportamiento de clientes por empresa.';
COMMENT ON FUNCTION public.fn_customer_intelligence_detail(uuid, uuid, integer, integer)
  IS 'Historia mensual, semanal y por producto de un cliente.';

REVOKE ALL ON FUNCTION public.fn_customer_intelligence_snapshot(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_customer_intelligence_detail(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_customer_intelligence_snapshot(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_customer_intelligence_detail(uuid, uuid, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
