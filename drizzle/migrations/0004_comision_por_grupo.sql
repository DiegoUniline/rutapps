CREATE OR REPLACE FUNCTION public.resolver_comision_pct_linea(p_empresa_id uuid, p_tarifa_id uuid, p_cliente_id uuid, p_producto_id uuid)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tarifa uuid := p_tarifa_id;
  v_clas uuid;
  v_lista uuid;
  v_pct numeric;
BEGIN
  IF v_tarifa IS NULL AND p_cliente_id IS NOT NULL THEN
    SELECT c.tarifa_id INTO v_tarifa FROM clientes c WHERE c.id = p_cliente_id;
  END IF;
  IF v_tarifa IS NULL THEN
    SELECT t.id INTO v_tarifa FROM tarifas t
    WHERE t.empresa_id = p_empresa_id AND t.tipo = 'general'
    ORDER BY t.created_at LIMIT 1;
  END IF;
  IF v_tarifa IS NULL THEN RETURN NULL; END IF;

  SELECT p.clasificacion_id, p.lista_id INTO v_clas, v_lista FROM productos p WHERE p.id = p_producto_id;

  SELECT tl.comision_pct INTO v_pct
  FROM tarifa_lineas tl
  WHERE tl.tarifa_id = v_tarifa
    AND tl.comision_pct IS NOT NULL
    AND (
      (tl.aplica_a = 'producto' AND p_producto_id = ANY(COALESCE(tl.producto_ids, '{}')))
      OR (tl.aplica_a = 'grupo' AND v_lista IS NOT NULL AND v_lista::text = ANY(COALESCE(tl.grupos, '{}')))
      OR (tl.aplica_a = 'categoria' AND v_clas IS NOT NULL AND v_clas = ANY(COALESCE(tl.clasificacion_ids, '{}')))
      OR tl.aplica_a = 'todos'
    )
  ORDER BY CASE tl.aplica_a WHEN 'producto' THEN 1 WHEN 'grupo' THEN 2 WHEN 'categoria' THEN 3 ELSE 4 END
  LIMIT 1;

  RETURN v_pct;
END; $function$;

-- Backfill: líneas sin comisión que ahora resuelven porcentaje (ventas no canceladas)
WITH calc AS (
  SELECT vl.id, public.resolver_comision_pct_linea(v.empresa_id, v.tarifa_id, v.cliente_id, vl.producto_id) AS pct
  FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
  WHERE vl.comision_pct IS NULL AND v.status <> 'cancelado'
)
UPDATE venta_lineas vl
SET comision_pct = c.pct,
    comision_monto = ROUND(COALESCE(vl.subtotal,0) * c.pct / 100.0, 2)
FROM calc c
WHERE c.id = vl.id AND c.pct IS NOT NULL;