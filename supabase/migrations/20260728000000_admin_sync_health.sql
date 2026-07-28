-- Panel de "Salud de Sincronización" para el Super Admin.
--
-- El blindaje de idempotencia (ids estables/determinísticos en la app) debe
-- mantener estos contadores en CERO. Si algo se duplicara (p. ej. un cliente
-- con build viejo), aquí saldría. Es la prueba en vivo de que "no falla".
--
-- Todo es SOLO LECTURA y gated a super admin.

SET lock_timeout = '5s';

-- Resumen: contadores de duplicación sobre TODAS las empresas.
CREATE OR REPLACE FUNCTION public.admin_sync_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobros_dup int;
  v_cobros_huerfanos int;
  v_aplic_dup int;
  v_ventas_dup int;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin';
  END IF;

  -- Cobros huérfanos (sin aplicación) que tienen un gemelo YA aplicado
  -- (mismo cliente/monto/fecha) = duplicado exacto del patrón del bug.
  SELECT count(*) INTO v_cobros_dup
  FROM cobros o
  WHERE NOT EXISTS (SELECT 1 FROM cobro_aplicaciones a WHERE a.cobro_id = o.id)
    AND EXISTS (
      SELECT 1 FROM cobros c2
      JOIN cobro_aplicaciones a2 ON a2.cobro_id = c2.id
      WHERE c2.id <> o.id AND c2.empresa_id = o.empresa_id
        AND c2.cliente_id = o.cliente_id AND c2.monto = o.monto AND c2.fecha = o.fecha
    );

  -- Cobros sin ninguna aplicación (INFORMATIVO: incluye anticipos legítimos).
  SELECT count(*) INTO v_cobros_huerfanos
  FROM cobros o
  WHERE NOT EXISTS (SELECT 1 FROM cobro_aplicaciones a WHERE a.cobro_id = o.id);

  -- Misma aplicación (cobro -> venta) repetida = doble aplicación (bug duro).
  SELECT count(*) INTO v_aplic_dup
  FROM (
    SELECT cobro_id, venta_id FROM cobro_aplicaciones
    GROUP BY cobro_id, venta_id HAVING count(*) > 1
  ) x;

  -- Ventas con mismo cliente/total/fecha repetidas (posible duplicado; INFORMATIVO,
  -- puede haber compras legítimas del mismo monto el mismo día).
  SELECT count(*) INTO v_ventas_dup
  FROM (
    SELECT empresa_id, cliente_id, total, fecha
    FROM ventas WHERE total > 0
    GROUP BY empresa_id, cliente_id, total, fecha HAVING count(*) > 1
  ) y;

  RETURN jsonb_build_object(
    'cobros_duplicados', v_cobros_dup,
    'cobros_huerfanos', v_cobros_huerfanos,
    'aplicaciones_duplicadas', v_aplic_dup,
    'ventas_posibles_dup', v_ventas_dup,
    'generado_en', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_sync_health() TO authenticated;

-- Detalle: los cobros duplicados, con su folio y el gemelo aplicado.
CREATE OR REPLACE FUNCTION public.admin_sync_duplicados()
RETURNS TABLE(
  empresa_id uuid, cliente_id uuid, folio text, monto numeric, fecha date,
  cobro_huerfano uuid, cobro_aplicado uuid, seg_diferencia numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin';
  END IF;
  RETURN QUERY
  SELECT o.empresa_id, o.cliente_id, v.folio, o.monto, o.fecha,
         o.id, t.id,
         round(abs(extract(epoch from (o.created_at - t.created_at)))::numeric, 1)
  FROM cobros o
  JOIN LATERAL (
    SELECT c2.id, c2.created_at FROM cobros c2
    JOIN cobro_aplicaciones a2 ON a2.cobro_id = c2.id
    WHERE c2.id <> o.id AND c2.empresa_id = o.empresa_id
      AND c2.cliente_id = o.cliente_id AND c2.monto = o.monto AND c2.fecha = o.fecha
    ORDER BY abs(extract(epoch from (c2.created_at - o.created_at))) ASC
    LIMIT 1
  ) t ON true
  LEFT JOIN cobro_aplicaciones ap ON ap.cobro_id = t.id
  LEFT JOIN ventas v ON v.id = ap.venta_id
  WHERE NOT EXISTS (SELECT 1 FROM cobro_aplicaciones a WHERE a.cobro_id = o.id)
  ORDER BY o.fecha DESC
  LIMIT 200;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_sync_duplicados() TO authenticated;

-- Últimos cobros con su id (para VER que los ids se generan y no se repiten).
CREATE OR REPLACE FUNCTION public.admin_sync_recientes()
RETURNS TABLE(
  id uuid, empresa_id uuid, cliente_id uuid, monto numeric,
  metodo_pago text, fecha date, created_at timestamptz, aplicado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin';
  END IF;
  RETURN QUERY
  SELECT c.id, c.empresa_id, c.cliente_id, c.monto, c.metodo_pago, c.fecha, c.created_at,
         EXISTS (SELECT 1 FROM cobro_aplicaciones a WHERE a.cobro_id = c.id)
  FROM cobros c
  ORDER BY c.created_at DESC
  LIMIT 30;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_sync_recientes() TO authenticated;
