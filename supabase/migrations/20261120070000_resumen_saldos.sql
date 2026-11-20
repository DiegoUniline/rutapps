-- Saldos por cliente y por proveedor calculados en la BD.
-- Antes Estado de cuenta, Aplicar pagos y Saldos de proveedor bajaban todas las ventas/compras
-- (sin paginar: se cortaban en 1 000 renglones → saldos incompletos) y sumaban en el navegador.
-- SECURITY INVOKER: aplica RLS; además se filtra por la empresa para usar los índices.

-- Estado de cuenta: vendido, saldo pendiente y saldo a favor por cliente.
CREATE OR REPLACE FUNCTION public.resumen_saldos_clientes(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
  cliente_id uuid, nombre text, codigo text, telefono text, credito boolean, dias_credito integer,
  limite_credito numeric, rfc text, direccion text,
  total_vendido numeric, saldo_pendiente numeric, docs bigint, saldo_favor numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH emp AS (SELECT public.get_my_empresa_id() AS id),
  v AS (
    SELECT ve.cliente_id, SUM(COALESCE(ve.total, 0)) AS total, SUM(COALESCE(ve.saldo_pendiente, 0)) AS saldo, COUNT(*) AS docs
      FROM public.ventas ve, emp
     WHERE ve.empresa_id = emp.id
       AND ve.status::text IN ('confirmado', 'entregado', 'facturado')
       AND ve.cliente_id IS NOT NULL
       AND (p_desde IS NULL OR ve.fecha >= p_desde)
       AND (p_hasta IS NULL OR ve.fecha <= p_hasta)
     GROUP BY ve.cliente_id),
  f AS (SELECT s.cliente_id, s.disponible FROM public.saldos_a_favor_empresa() s WHERE s.disponible > 0.009),
  ids AS (SELECT cliente_id FROM v UNION SELECT cliente_id FROM f)
  SELECT c.id, c.nombre, c.codigo, c.telefono, COALESCE(c.credito, false), COALESCE(c.dias_credito, 0)::integer,
         COALESCE(c.limite_credito, 0), c.rfc, c.direccion,
         round(COALESCE(v.total, 0), 2), round(COALESCE(v.saldo, 0), 2), COALESCE(v.docs, 0), round(COALESCE(f.disponible, 0), 2)
    FROM ids
    JOIN public.clientes c ON c.id = ids.cliente_id
    LEFT JOIN v ON v.cliente_id = ids.cliente_id
    LEFT JOIN f ON f.cliente_id = ids.cliente_id;
$function$;

-- Aplicar pagos: clientes con saldo pendiente.
CREATE OR REPLACE FUNCTION public.clientes_con_saldo()
RETURNS TABLE (cliente_id uuid, nombre text, codigo text, telefono text, saldo numeric, docs bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.nombre, c.codigo, c.telefono, round(SUM(ve.saldo_pendiente), 2), COUNT(*)
    FROM public.ventas ve
    JOIN public.clientes c ON c.id = ve.cliente_id
   WHERE ve.empresa_id = public.get_my_empresa_id()
     AND ve.saldo_pendiente > 0.009
     AND ve.status::text <> 'cancelado'
   GROUP BY c.id, c.nombre, c.codigo, c.telefono
  HAVING SUM(ve.saldo_pendiente) >= 0.01
   ORDER BY 5 DESC;
$function$;

-- Saldos de proveedor.
CREATE OR REPLACE FUNCTION public.resumen_saldos_proveedores(
  p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_condicion text[] DEFAULT NULL
)
RETURNS TABLE (proveedor_id uuid, nombre text, total_comprado numeric, saldo_pendiente numeric, docs bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nombre, round(SUM(COALESCE(co.total, 0)), 2), round(SUM(COALESCE(co.saldo_pendiente, 0)), 2), COUNT(*)
    FROM public.compras co
    JOIN public.proveedores p ON p.id = co.proveedor_id
   WHERE co.empresa_id = public.get_my_empresa_id()
     AND co.status IN ('confirmada', 'recibida', 'pagada')
     AND (p_desde IS NULL OR co.fecha >= p_desde)
     AND (p_hasta IS NULL OR co.fecha <= p_hasta)
     AND (p_condicion IS NULL OR cardinality(p_condicion) = 0 OR co.condicion_pago::text = ANY(p_condicion))
   GROUP BY p.id, p.nombre
   ORDER BY 4 DESC;
$function$;

CREATE INDEX IF NOT EXISTS idx_ventas_emp_saldo_cliente ON public.ventas (empresa_id, cliente_id) WHERE saldo_pendiente > 0.009;

REVOKE ALL ON FUNCTION public.resumen_saldos_clientes(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clientes_con_saldo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resumen_saldos_proveedores(date, date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_saldos_clientes(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clientes_con_saldo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resumen_saldos_proveedores(date, date, text[]) TO authenticated;
