BEGIN;

-- Una sola fuente para "Stock a la fecha" y su Kardex. El cálculo parte del
-- stock vigente (la fuente operativa) y revierte únicamente los movimientos
-- aplicados después del cierre solicitado. Así no presupone que el ledger
-- comenzó en cero y una corrección registrada hoy no altera el pasado por usar
-- la fecha comercial del documento.

CREATE INDEX IF NOT EXISTS idx_mov_inv_empresa_created_at
  ON public.movimientos_inventario (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mov_inv_empresa_producto_created_at
  ON public.movimientos_inventario (empresa_id, producto_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_inventory_stock_at_date(
  p_empresa_id uuid,
  p_fecha date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz text;
  v_cutoff timestamptz;
  v_today date;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    p_empresa_id = public.get_my_empresa_id()
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar esta empresa' USING ERRCODE = '42501';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha de corte es obligatoria' USING ERRCODE = '22004';
  END IF;

  SELECT COALESCE(NULLIF(e.zona_horaria, ''), 'America/Mexico_City')
    INTO v_tz
  FROM public.empresas e
  WHERE e.id = p_empresa_id;

  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_today := (now() AT TIME ZONE v_tz)::date;
  IF p_fecha > v_today THEN
    RAISE EXCEPTION 'No se puede consultar una fecha futura' USING ERRCODE = '22023';
  END IF;

  -- Instante UTC que corresponde al inicio del día siguiente en la empresa.
  v_cutoff := ((p_fecha + 1)::timestamp AT TIME ZONE v_tz);

  WITH post_base AS MATERIALIZED (
    SELECT
      m.producto_id,
      m.almacen_origen_id,
      m.almacen_destino_id,
      COALESCE(m.cantidad, 0)::numeric AS cantidad
    FROM public.movimientos_inventario m
    WHERE m.empresa_id = p_empresa_id
      AND m.created_at >= v_cutoff
      AND m.producto_id IS NOT NULL
      AND (m.almacen_origen_id IS NOT NULL OR m.almacen_destino_id IS NOT NULL)
  ),
  post_delta AS MATERIALIZED (
    SELECT d.producto_id, d.almacen_id,
           SUM(d.delta)::numeric AS delta,
           COUNT(*)::integer AS movements_after_cutoff
    FROM (
      SELECT producto_id, almacen_destino_id AS almacen_id, cantidad AS delta
      FROM post_base WHERE almacen_destino_id IS NOT NULL
      UNION ALL
      SELECT producto_id, almacen_origen_id AS almacen_id, -cantidad AS delta
      FROM post_base WHERE almacen_origen_id IS NOT NULL
    ) d
    GROUP BY d.producto_id, d.almacen_id
  ),
  live AS MATERIALIZED (
    SELECT s.producto_id, s.almacen_id,
           COALESCE(s.cantidad, 0)::numeric AS current_quantity
    FROM public.stock_almacen s
    WHERE s.empresa_id = p_empresa_id
  ),
  keys AS MATERIALIZED (
    SELECT producto_id, almacen_id FROM live
    UNION
    SELECT producto_id, almacen_id FROM post_delta
  ),
  rows AS MATERIALIZED (
    SELECT
      k.producto_id,
      p.codigo AS product_code,
      p.nombre AS product_name,
      p.status::text AS product_status,
      p.clasificacion_id AS category_id,
      c.nombre AS category_name,
      p.marca_id AS brand_id,
      b.nombre AS brand_name,
      p.proveedor_preferido_id AS supplier_id,
      pr.nombre AS supplier_name,
      u.abreviatura AS unit_name,
      COALESCE(p.costo, 0)::numeric AS current_unit_cost,
      k.almacen_id AS location_id,
      a.nombre AS location_name,
      COALESCE(NULLIF(a.tipo, ''), 'almacen') AS location_type,
      COALESCE(a.activo, false) AS location_active,
      (COALESCE(l.current_quantity, 0) - COALESCE(pd.delta, 0))::numeric AS quantity,
      COALESCE(l.current_quantity, 0)::numeric AS current_quantity,
      COALESCE(pd.delta, 0)::numeric AS change_since_cutoff,
      COALESCE(pd.movements_after_cutoff, 0)::integer AS movements_after_cutoff
    FROM keys k
    JOIN public.productos p
      ON p.id = k.producto_id AND p.empresa_id = p_empresa_id
    JOIN public.almacenes a
      ON a.id = k.almacen_id AND a.empresa_id = p_empresa_id
    LEFT JOIN live l
      ON l.producto_id = k.producto_id AND l.almacen_id = k.almacen_id
    LEFT JOIN post_delta pd
      ON pd.producto_id = k.producto_id AND pd.almacen_id = k.almacen_id
    LEFT JOIN public.clasificaciones c ON c.id = p.clasificacion_id
    LEFT JOIN public.marcas b ON b.id = p.marca_id
    LEFT JOIN public.proveedores pr ON pr.id = p.proveedor_preferido_id
    LEFT JOIN public.unidades u ON u.id = p.unidad_venta_id
    WHERE COALESCE(l.current_quantity, 0) <> 0
       OR COALESCE(pd.delta, 0) <> 0
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'cutoff_date', p_fecha,
    'cutoff_at', v_cutoff,
    'timezone', v_tz,
    'method', 'current_stock_minus_later_movements',
    'ledger_started_at', (
      SELECT MIN(m.created_at) FROM public.movimientos_inventario m
      WHERE m.empresa_id = p_empresa_id
    ),
    'metrics', jsonb_build_object(
      'units', COALESCE((SELECT SUM(r.quantity) FROM rows r), 0),
      'products', (SELECT COUNT(DISTINCT r.producto_id) FROM rows r WHERE r.quantity <> 0),
      'locations', (SELECT COUNT(DISTINCT r.location_id) FROM rows r WHERE r.quantity <> 0),
      'warehouse_units', COALESCE((SELECT SUM(r.quantity) FROM rows r WHERE r.location_type <> 'ruta'), 0),
      'route_units', COALESCE((SELECT SUM(r.quantity) FROM rows r WHERE r.location_type = 'ruta'), 0),
      'estimated_value_at_current_cost', COALESCE((SELECT SUM(r.quantity * r.current_unit_cost) FROM rows r), 0),
      'movements_reversed', COALESCE((SELECT SUM(r.movements_after_cutoff) FROM rows r), 0)
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id', r.producto_id,
        'codigo', r.product_code,
        'producto', r.product_name,
        'producto_status', r.product_status,
        'categoria_id', r.category_id,
        'categoria', r.category_name,
        'marca_id', r.brand_id,
        'marca', r.brand_name,
        'proveedor_id', r.supplier_id,
        'proveedor', r.supplier_name,
        'unidad', r.unit_name,
        'costo_actual', r.current_unit_cost,
        'almacen_id', r.location_id,
        'almacen', r.location_name,
        'ubicacion_tipo', r.location_type,
        'ubicacion_activa', r.location_active,
        'cantidad', r.quantity,
        'cantidad_actual', r.current_quantity,
        'diferencia_actual', r.current_quantity - r.quantity,
        'movimientos_posteriores', r.movements_after_cutoff
      ) ORDER BY r.product_name, r.location_type, r.location_name)
      FROM rows r
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_inventory_kardex_at_date(
  p_empresa_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_today date;
  v_current numeric := 0;
  v_opening numeric := 0;
  v_final numeric := 0;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    p_empresa_id = public.get_my_empresa_id()
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar esta empresa' USING ERRCODE = '42501';
  END IF;

  IF p_producto_id IS NULL OR p_almacen_id IS NULL
     OR p_fecha_desde IS NULL OR p_fecha_hasta IS NULL THEN
    RAISE EXCEPTION 'Producto, ubicación y fechas son obligatorios' USING ERRCODE = '22004';
  END IF;

  IF p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la final' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(e.zona_horaria, ''), 'America/Mexico_City')
    INTO v_tz
  FROM public.empresas e
  WHERE e.id = p_empresa_id;

  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.id = p_producto_id AND p.empresa_id = p_empresa_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'Producto o ubicación no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;

  v_today := (now() AT TIME ZONE v_tz)::date;
  IF p_fecha_hasta > v_today THEN
    RAISE EXCEPTION 'No se puede consultar una fecha futura' USING ERRCODE = '22023';
  END IF;

  v_start := (p_fecha_desde::timestamp AT TIME ZONE v_tz);
  v_end := ((p_fecha_hasta + 1)::timestamp AT TIME ZONE v_tz);

  SELECT COALESCE(s.cantidad, 0)::numeric
    INTO v_current
  FROM public.stock_almacen s
  WHERE s.empresa_id = p_empresa_id
    AND s.producto_id = p_producto_id
    AND s.almacen_id = p_almacen_id;
  v_current := COALESCE(v_current, 0);

  WITH later AS (
    SELECT m.created_at,
      (CASE WHEN m.almacen_destino_id = p_almacen_id THEN COALESCE(m.cantidad, 0) ELSE 0 END
       - CASE WHEN m.almacen_origen_id = p_almacen_id THEN COALESCE(m.cantidad, 0) ELSE 0 END)::numeric AS delta
    FROM public.movimientos_inventario m
    WHERE m.empresa_id = p_empresa_id
      AND m.producto_id = p_producto_id
      AND (m.almacen_origen_id = p_almacen_id OR m.almacen_destino_id = p_almacen_id)
  )
  SELECT
    v_current - COALESCE(SUM(delta) FILTER (WHERE created_at >= v_start), 0),
    v_current - COALESCE(SUM(delta) FILTER (WHERE created_at >= v_end), 0)
  INTO v_opening, v_final
  FROM later;

  WITH movements AS MATERIALIZED (
    SELECT
      m.id,
      m.fecha,
      m.created_at,
      m.tipo::text AS tipo,
      m.referencia_tipo,
      m.referencia_id,
      m.notas,
      m.user_id,
      m.lote_id,
      m.almacen_origen_id,
      ao.nombre AS origen,
      m.almacen_destino_id,
      ad.nombre AS destino,
      COALESCE(m.cantidad, 0)::numeric AS cantidad,
      (CASE WHEN m.almacen_destino_id = p_almacen_id THEN COALESCE(m.cantidad, 0) ELSE 0 END
       - CASE WHEN m.almacen_origen_id = p_almacen_id THEN COALESCE(m.cantidad, 0) ELSE 0 END)::numeric AS delta
    FROM public.movimientos_inventario m
    LEFT JOIN public.almacenes ao ON ao.id = m.almacen_origen_id
    LEFT JOIN public.almacenes ad ON ad.id = m.almacen_destino_id
    WHERE m.empresa_id = p_empresa_id
      AND m.producto_id = p_producto_id
      AND (m.almacen_origen_id = p_almacen_id OR m.almacen_destino_id = p_almacen_id)
      AND m.created_at >= v_start
      AND m.created_at < v_end
  ),
  running AS MATERIALIZED (
    SELECT m.*,
      (v_opening + SUM(m.delta) OVER (
        ORDER BY m.created_at, m.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ))::numeric AS balance
    FROM movements m
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'timezone', v_tz,
    'from_date', p_fecha_desde,
    'to_date', p_fecha_hasta,
    'cutoff_at', v_end,
    'producto', (SELECT jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre)
                 FROM public.productos p WHERE p.id = p_producto_id),
    'ubicacion', (SELECT jsonb_build_object('id', a.id, 'nombre', a.nombre, 'tipo', a.tipo, 'activa', a.activo)
                  FROM public.almacenes a WHERE a.id = p_almacen_id),
    'metrics', jsonb_build_object(
      'opening_stock', v_opening,
      'final_stock', v_final,
      'current_stock', v_current,
      'entries', COALESCE((SELECT SUM(r.delta) FROM running r WHERE r.delta > 0), 0),
      'exits', ABS(COALESCE((SELECT SUM(r.delta) FROM running r WHERE r.delta < 0), 0)),
      'movements', (SELECT COUNT(*) FROM running),
      'reconciled', ABS(v_opening + COALESCE((SELECT SUM(r.delta) FROM running r), 0) - v_final) < 0.0001
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'fecha_documento', r.fecha,
        'registrado_at', r.created_at,
        'tipo', r.tipo,
        'referencia_tipo', r.referencia_tipo,
        'referencia_id', r.referencia_id,
        'notas', r.notas,
        'user_id', r.user_id,
        'lote_id', r.lote_id,
        'almacen_origen_id', r.almacen_origen_id,
        'origen', r.origen,
        'almacen_destino_id', r.almacen_destino_id,
        'destino', r.destino,
        'cantidad', r.cantidad,
        'delta', r.delta,
        'saldo', r.balance
      ) ORDER BY r.created_at, r.id)
      FROM running r
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Compatibilidad: Reportes conserva el nombre anterior, pero ahora consume la
-- misma fuente segura que Inventario.
CREATE OR REPLACE FUNCTION public.stock_a_la_fecha(
  p_empresa_id uuid,
  p_fecha date
)
RETURNS TABLE (
  producto_id uuid,
  producto text,
  almacen_id uuid,
  almacen text,
  cantidad numeric
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT x.producto_id, x.producto, x.almacen_id, x.almacen, x.cantidad
  FROM jsonb_to_recordset(
    public.fn_inventory_stock_at_date(p_empresa_id, p_fecha)->'rows'
  ) AS x(
    producto_id uuid,
    producto text,
    almacen_id uuid,
    almacen text,
    cantidad numeric
  )
  WHERE x.cantidad <> 0
  ORDER BY x.producto, x.almacen;
$$;

REVOKE ALL ON FUNCTION public.fn_inventory_stock_at_date(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_inventory_kardex_at_date(uuid, uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_a_la_fecha(uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_inventory_stock_at_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_inventory_kardex_at_date(uuid, uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_a_la_fecha(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
