
CREATE OR REPLACE FUNCTION public.wa_clientes_saldos(
  p_empresa uuid,
  p_query text DEFAULT NULL,
  p_solo_con_saldo boolean DEFAULT false,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  id uuid, codigo text, nombre text, telefono text, status text,
  credito boolean, limite_credito numeric, dias_credito int, saldo numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.codigo, c.nombre, c.telefono, c.status::text,
         c.credito, c.limite_credito, c.dias_credito,
         COALESCE(s.saldo, 0) AS saldo
  FROM public.clientes c
  LEFT JOIN (
    SELECT cliente_id, SUM(saldo_pendiente) AS saldo
    FROM public.ventas
    WHERE empresa_id = p_empresa
      AND status::text <> 'cancelada'
      AND COALESCE(saldo_pendiente,0) > 0
    GROUP BY cliente_id
  ) s ON s.cliente_id = c.id
  WHERE c.empresa_id = p_empresa
    AND (p_query IS NULL OR p_query = '' OR
         c.nombre ILIKE '%'||p_query||'%' OR
         COALESCE(c.codigo,'') ILIKE '%'||p_query||'%' OR
         COALESCE(c.telefono,'') ILIKE '%'||p_query||'%')
    AND (NOT p_solo_con_saldo OR COALESCE(s.saldo,0) > 0)
  ORDER BY COALESCE(s.saldo,0) DESC, c.nombre ASC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION public.wa_clientes_saldos(uuid, text, boolean, int) TO authenticated, service_role;
