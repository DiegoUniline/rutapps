-- ─────────────────────────────────────────────────────────────────────────────
-- SALDO Y STOCK "A LA FECHA" (reconstrucción histórica)
--
-- Dos funciones de solo lectura que reconstruyen el estado a una fecha de corte,
-- considerando TODO el historial hasta esa fecha:
--   - stock_a_la_fecha: existencia por producto y almacén, sumando el ledger
--     completo de movimientos_inventario (entradas, salidas, traspasos, ajustes,
--     ventas, compras, devoluciones, mermas…) con fecha <= corte.
--   - saldo_clientes_a_la_fecha: cargos (ventas) menos abonos (cobros) por cliente
--     hasta la fecha de corte. Excluye cancelados.
--
-- Aditivas: no tocan datos, tablas, triggers ni comportamiento existente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Stock por producto y almacén a una fecha ────────────────────────────────
CREATE OR REPLACE FUNCTION public.stock_a_la_fecha(
  p_empresa_id uuid,
  p_fecha date
) RETURNS TABLE (
  producto_id uuid,
  producto    text,
  almacen_id  uuid,
  almacen     text,
  cantidad    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mov AS (
    -- Entradas al almacén destino (+)
    SELECT mi.producto_id, mi.almacen_destino_id AS almacen_id, mi.cantidad AS cant
    FROM public.movimientos_inventario mi
    WHERE mi.empresa_id = p_empresa_id
      AND mi.fecha <= p_fecha
      AND mi.almacen_destino_id IS NOT NULL
    UNION ALL
    -- Salidas desde el almacén origen (−)
    SELECT mi.producto_id, mi.almacen_origen_id AS almacen_id, -mi.cantidad AS cant
    FROM public.movimientos_inventario mi
    WHERE mi.empresa_id = p_empresa_id
      AND mi.fecha <= p_fecha
      AND mi.almacen_origen_id IS NOT NULL
  )
  SELECT
    m.producto_id,
    p.nombre AS producto,
    m.almacen_id,
    a.nombre AS almacen,
    SUM(m.cant) AS cantidad
  FROM mov m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.almacenes a ON a.id = m.almacen_id
  GROUP BY m.producto_id, p.nombre, m.almacen_id, a.nombre
  HAVING SUM(m.cant) <> 0
  ORDER BY p.nombre, a.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.stock_a_la_fecha(uuid, date) TO authenticated;

-- ── Saldo por cliente a una fecha (cargos − abonos) ─────────────────────────
CREATE OR REPLACE FUNCTION public.saldo_clientes_a_la_fecha(
  p_empresa_id uuid,
  p_fecha date
) RETURNS TABLE (
  cliente_id uuid,
  cliente    text,
  cargos     numeric,
  abonos     numeric,
  saldo      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cargos AS (
    SELECT v.cliente_id, COALESCE(SUM(v.total), 0) AS monto
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND v.fecha <= p_fecha
      AND v.status::text <> 'cancelado'
      AND v.cliente_id IS NOT NULL
    GROUP BY v.cliente_id
  ),
  abonos AS (
    SELECT c.cliente_id, COALESCE(SUM(c.monto), 0) AS monto
    FROM public.cobros c
    WHERE c.empresa_id = p_empresa_id
      AND c.fecha <= p_fecha
      AND COALESCE(c.status, 'activo') <> 'cancelado'
      AND c.cliente_id IS NOT NULL
    GROUP BY c.cliente_id
  ),
  ids AS (
    SELECT cliente_id FROM cargos
    UNION
    SELECT cliente_id FROM abonos
  )
  SELECT
    i.cliente_id,
    cl.nombre AS cliente,
    COALESCE(ca.monto, 0) AS cargos,
    COALESCE(ab.monto, 0) AS abonos,
    COALESCE(ca.monto, 0) - COALESCE(ab.monto, 0) AS saldo
  FROM ids i
  JOIN public.clientes cl ON cl.id = i.cliente_id
  LEFT JOIN cargos ca ON ca.cliente_id = i.cliente_id
  LEFT JOIN abonos ab ON ab.cliente_id = i.cliente_id
  WHERE cl.empresa_id = p_empresa_id
  ORDER BY (COALESCE(ca.monto, 0) - COALESCE(ab.monto, 0)) DESC, cl.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.saldo_clientes_a_la_fecha(uuid, date) TO authenticated;
