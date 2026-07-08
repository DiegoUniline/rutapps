-- CHEQUEO (solo lectura) de paridad stock_almacen vs suma(stock_lotes).
--
-- Para productos con maneja_lote = true, el stock general (stock_almacen) debería
-- ser igual a la suma de su stock por lote (stock_lotes). Cuando difieren, el
-- modal de surtido por lote ofrece cantidades que el RPC rechaza (valida contra
-- el general), causando "Stock insuficiente en almacén".
--
-- Esta función NO corrige nada: solo lista los descuadres para monitoreo/auditoría.
-- Casos típicos:
--   * suma_lotes = 0 y stock_general > 0 → producto marcado con lote pero sin
--     lotes cargados (tema de configuración/carga inicial).
--   * suma_lotes <> stock_general (ambos > 0) → descuadre real (alguien tocó una
--     tabla sin la otra, p.ej. un INSERT directo a stock_lotes sin movimiento).

CREATE OR REPLACE FUNCTION public.check_stock_lote_paridad(p_empresa_id uuid DEFAULT NULL)
RETURNS TABLE (
  empresa_id uuid,
  almacen_id uuid,
  almacen_nombre text,
  producto_id uuid,
  codigo text,
  nombre text,
  stock_general numeric,
  suma_lotes numeric,
  diferencia numeric,
  caso text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    sa.empresa_id,
    sa.almacen_id,
    a.nombre AS almacen_nombre,
    sa.producto_id,
    p.codigo,
    p.nombre,
    sa.cantidad AS stock_general,
    COALESCE(sl.suma_lotes, 0) AS suma_lotes,
    sa.cantidad - COALESCE(sl.suma_lotes, 0) AS diferencia,
    CASE
      WHEN COALESCE(sl.suma_lotes, 0) = 0 AND sa.cantidad <> 0 THEN 'con_lote_sin_lotes'
      ELSE 'descuadre_real'
    END AS caso
  FROM public.stock_almacen sa
  JOIN public.productos p ON p.id = sa.producto_id AND COALESCE(p.maneja_lote, false) = true
  LEFT JOIN public.almacenes a ON a.id = sa.almacen_id
  LEFT JOIN (
    SELECT almacen_id, producto_id, SUM(cantidad) AS suma_lotes
    FROM public.stock_lotes
    GROUP BY almacen_id, producto_id
  ) sl ON sl.almacen_id = sa.almacen_id AND sl.producto_id = sa.producto_id
  WHERE (p_empresa_id IS NULL OR sa.empresa_id = p_empresa_id)
    AND sa.cantidad <> COALESCE(sl.suma_lotes, 0)
  ORDER BY caso, p.codigo;
$function$;

GRANT EXECUTE ON FUNCTION public.check_stock_lote_paridad(uuid) TO authenticated, service_role;
