-- D-061 (2026-11-23) · «Según uso de Entregas»: ajuste por empresa para contar pedidos como venta.
--
-- Problema: con D-060 un pedido solo cuenta como venta cuando está entregado/facturado. Las
-- empresas que NO usan el módulo de Entregas (sus pedidos se quedan en «confirmado» aunque ya
-- se surtieron y cobraron) quedaban sin ventas en Dashboard y Reportes → Utilidad
-- (GLOBAL TRADE LOGISTICS: octubre 2026 pasaba de HNL 2.84M a 95k).
--
-- Regla (misma que src/lib/ventasRealizadas.ts):
--   * empresas.pedidos_cuentan_al_confirmar = false (default) → regla D-060 sin cambios:
--       pedido entregado/facturado, por fecha de entrega (`fecha_entrega`; si es null, `fecha`).
--   * empresas.pedidos_cuentan_al_confirmar = true → pedido confirmado/entregado/facturado
--     cuenta por `fecha` del pedido (también los entregados: siempre por `fecha`).
--   * Ventas directas: sin cambios (confirmado/entregado/facturado por `fecha`).
--   * Nunca borradores ni cancelados; siempre es_saldo_inicial = false y filtro por empresa.
--
-- 1. Columna nueva (aditiva, NOT NULL DEFAULT false: no reescribe la tabla en PG ≥ 11).
-- 2. Inicialización: true para las empresas con pedidos en los últimos 90 días y CERO entregas
--    con status 'hecho' en los últimos 90 días (medido al aplicar la migración). El dueño de
--    cada empresa lo puede cambiar en Configuración → Visibilidad.
-- 3. Funciones de D-060 (misma firma, CREATE OR REPLACE; permisos y autorización iguales):
--      dashboard_costo_ventas(uuid,date,date,uuid)  SECURITY DEFINER, chequeo is_super_admin OR
--                                                    get_my_empresa_id como antes.
--      dashboard_top_productos(uuid,date,date)       SECURITY INVOKER (RLS como antes).
--      dashboard_evolucion_mensual(uuid,date,date)   SECURITY INVOKER (RLS como antes).
--    El ajuste se lee una sola vez de empresas (InitPlan); las ramas de pedidos D-060 y la rama
--    «al confirmar» se excluyen entre sí, así que UNION ALL no duplica.
--    Índice de la rama nueva: idx_ventas_logistica_pedidos_fecha (empresa_id, fecha DESC)
--    WHERE tipo='pedido' (existente).
--
-- CÓMO REVERTIR (no toca ventas; solo lectura + una columna de ajuste):
--   a) Funciones: volver a ejecutar las tres CREATE OR REPLACE de
--      supabase/migrations/20261123050000_dashboard_utilidad_entregado.sql (regla D-060 pura).
--   b) Apagar el ajuste sin quitar la columna: UPDATE public.empresas SET pedidos_cuentan_al_confirmar = false;
--   c) Quitar la columna (requiere CONFIRMO; antes revertir a) y el front que la lee):
--      ALTER TABLE public.empresas DROP COLUMN pedidos_cuentan_al_confirmar;

-- ─── 1. Columna ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS pedidos_cuentan_al_confirmar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.empresas.pedidos_cuentan_al_confirmar IS
  'D-061: true = la empresa no usa Entregas; sus pedidos confirmados/entregados/facturados cuentan como venta por fecha del pedido en Dashboard y Reportes → Utilidad. false = regla D-060 (pedido cuenta al entregarse, por fecha_entrega).';

-- ─── 2. Inicialización por uso real de Entregas ──────────────────────────────────────
UPDATE public.empresas e
   SET pedidos_cuentan_al_confirmar = true
 WHERE e.pedidos_cuentan_al_confirmar = false
   AND EXISTS (
         SELECT 1 FROM public.ventas v
          WHERE v.empresa_id = e.id
            AND v.tipo = 'pedido'
            AND v.fecha >= current_date - 90)
   AND NOT EXISTS (
         SELECT 1 FROM public.entregas en
          WHERE en.empresa_id = e.id
            AND en.status = 'hecho'
            AND en.fecha >= current_date - 90);

-- ─── 3a. Costo de lo vendido ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_costo_ventas(p_empresa_id uuid, p_from date, p_to date, p_vendedor_id uuid DEFAULT NULL::uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_costo numeric;
  v_al_confirmar boolean;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR p_empresa_id = public.get_my_empresa_id()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- D-061: ajuste de la empresa (si no existe la fila, regla D-060).
  SELECT COALESCE(e.pedidos_cuentan_al_confirmar, false)
    INTO v_al_confirmar
    FROM public.empresas e
   WHERE e.id = p_empresa_id;
  v_al_confirmar := COALESCE(v_al_confirmar, false);

  -- Conjuntos disjuntos (UNION ALL no duplica): cada uno usa su índice.
  WITH realizadas AS (
    SELECT v.id
      FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id
       AND v.es_saldo_inicial = false
       AND v.tipo = 'venta_directa'
       AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
       AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
    UNION ALL
    -- D-060 (empresa usa Entregas): pedido entregado, por fecha de entrega.
    SELECT v.id
      FROM public.ventas v
     WHERE NOT v_al_confirmar
       AND v.empresa_id = p_empresa_id
       AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido'
       AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NOT NULL
       AND v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to
       AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
    UNION ALL
    SELECT v.id
      FROM public.ventas v
     WHERE NOT v_al_confirmar
       AND v.empresa_id = p_empresa_id
       AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido'
       AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NULL
       AND v.fecha >= p_from AND v.fecha <= p_to
       AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
    UNION ALL
    -- D-061 (empresa no usa Entregas): pedido confirmado/entregado/facturado, por fecha.
    SELECT v.id
      FROM public.ventas v
     WHERE v_al_confirmar
       AND v.empresa_id = p_empresa_id
       AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido'
       AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
       AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
  )
  SELECT COALESCE(SUM(vl.cantidad * COALESCE(pr.costo, 0)), 0)
    INTO v_costo
  FROM realizadas r
  JOIN public.venta_lineas vl ON vl.venta_id = r.id
  LEFT JOIN public.productos pr
    ON pr.id = vl.producto_id
   AND pr.empresa_id = p_empresa_id
   AND pr.status = 'activo';

  RETURN COALESCE(v_costo, 0);
END;
$function$;

-- Mismos permisos que deja 20261123050000 (sin PUBLIC ni anon).
REVOKE ALL ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) TO authenticated, service_role;

-- ─── 3b. Top productos (Rankings) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_top_productos(p_empresa_id uuid, p_from date, p_to date)
RETURNS TABLE(id uuid, nombre text, codigo text, qty numeric, total numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH realizadas AS (
    SELECT v.id FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'venta_directa' AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
    UNION ALL
    SELECT v.id FROM public.ventas v
     WHERE NOT COALESCE((SELECT e.pedidos_cuentan_al_confirmar FROM public.empresas e WHERE e.id = p_empresa_id), false)
       AND v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NOT NULL AND v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to
    UNION ALL
    SELECT v.id FROM public.ventas v
     WHERE NOT COALESCE((SELECT e.pedidos_cuentan_al_confirmar FROM public.empresas e WHERE e.id = p_empresa_id), false)
       AND v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NULL AND v.fecha >= p_from AND v.fecha <= p_to
    UNION ALL
    SELECT v.id FROM public.ventas v
     WHERE COALESCE((SELECT e.pedidos_cuentan_al_confirmar FROM public.empresas e WHERE e.id = p_empresa_id), false)
       AND v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
  )
  SELECT vl.producto_id, p.nombre::text, p.codigo::text,
         SUM(COALESCE(vl.cantidad, 0))::numeric, SUM(COALESCE(vl.total, 0))::numeric
  FROM realizadas r
  JOIN public.venta_lineas vl ON vl.venta_id = r.id
  LEFT JOIN public.productos p ON p.id = vl.producto_id
  WHERE vl.empresa_id = p_empresa_id
    AND vl.producto_id IS NOT NULL
  GROUP BY vl.producto_id, p.nombre, p.codigo
  ORDER BY 5 DESC;
$function$;

-- ─── 3c. Evolución mensual (producto / cliente / vendedor) ──────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_evolucion_mensual(p_empresa_id uuid, p_from date, p_to date)
RETURNS TABLE(tipo text, entidad_id uuid, nombre text, mes text, total numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH realizadas AS (
    SELECT v.id, v.cliente_id, v.vendedor_id, v.fecha AS fecha_venta FROM public.ventas v
     WHERE v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'venta_directa' AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
    UNION ALL
    SELECT v.id, v.cliente_id, v.vendedor_id, v.fecha_entrega FROM public.ventas v
     WHERE NOT COALESCE((SELECT e.pedidos_cuentan_al_confirmar FROM public.empresas e WHERE e.id = p_empresa_id), false)
       AND v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NOT NULL AND v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to
    UNION ALL
    SELECT v.id, v.cliente_id, v.vendedor_id, v.fecha FROM public.ventas v
     WHERE NOT COALESCE((SELECT e.pedidos_cuentan_al_confirmar FROM public.empresas e WHERE e.id = p_empresa_id), false)
       AND v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('entregado', 'facturado')
       AND v.fecha_entrega IS NULL AND v.fecha >= p_from AND v.fecha <= p_to
    UNION ALL
    SELECT v.id, v.cliente_id, v.vendedor_id, v.fecha FROM public.ventas v
     WHERE COALESCE((SELECT e.pedidos_cuentan_al_confirmar FROM public.empresas e WHERE e.id = p_empresa_id), false)
       AND v.empresa_id = p_empresa_id AND v.es_saldo_inicial = false
       AND v.tipo = 'pedido' AND v.status IN ('confirmado', 'entregado', 'facturado')
       AND v.fecha >= p_from AND v.fecha <= p_to
  ),
  l AS (
    SELECT vl.producto_id, r.cliente_id, r.vendedor_id, to_char(r.fecha_venta, 'YYYY-MM') AS mes, COALESCE(vl.total, 0) AS total
    FROM realizadas r JOIN public.venta_lineas vl ON vl.venta_id = r.id
    WHERE vl.empresa_id = p_empresa_id)
  SELECT 'producto', l.producto_id, p.nombre, l.mes, SUM(l.total) FROM l LEFT JOIN public.productos p ON p.id = l.producto_id WHERE l.producto_id IS NOT NULL GROUP BY l.producto_id, p.nombre, l.mes
  UNION ALL SELECT 'cliente', l.cliente_id, c.nombre, l.mes, SUM(l.total) FROM l LEFT JOIN public.clientes c ON c.id = l.cliente_id WHERE l.cliente_id IS NOT NULL GROUP BY l.cliente_id, c.nombre, l.mes
  UNION ALL SELECT 'vendedor', l.vendedor_id, pr.nombre, l.mes, SUM(l.total) FROM l LEFT JOIN public.profiles pr ON pr.id = l.vendedor_id WHERE l.vendedor_id IS NOT NULL GROUP BY l.vendedor_id, pr.nombre, l.mes;
$function$;
