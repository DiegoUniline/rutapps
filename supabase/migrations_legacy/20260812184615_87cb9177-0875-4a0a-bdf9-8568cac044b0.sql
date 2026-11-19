ALTER TABLE public.venta_lineas
  ADD COLUMN IF NOT EXISTS comision_pct numeric,
  ADD COLUMN IF NOT EXISTS comision_monto numeric;

CREATE OR REPLACE FUNCTION public.resolver_comision_pct_linea(
  p_empresa_id uuid, p_tarifa_id uuid, p_cliente_id uuid, p_producto_id uuid
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tarifa uuid := p_tarifa_id;
  v_clas uuid;
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

  SELECT p.clasificacion_id INTO v_clas FROM productos p WHERE p.id = p_producto_id;

  SELECT tl.comision_pct INTO v_pct
  FROM tarifa_lineas tl
  WHERE tl.tarifa_id = v_tarifa
    AND tl.comision_pct IS NOT NULL
    AND (
      (tl.aplica_a = 'producto' AND p_producto_id = ANY(COALESCE(tl.producto_ids, '{}')))
      OR (tl.aplica_a = 'categoria' AND v_clas IS NOT NULL AND v_clas = ANY(COALESCE(tl.clasificacion_ids, '{}')))
      OR tl.aplica_a = 'todos'
    )
  ORDER BY CASE tl.aplica_a WHEN 'producto' THEN 1 WHEN 'categoria' THEN 2 ELSE 3 END
  LIMIT 1;

  RETURN v_pct;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_fill_venta_linea_comision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid; v_tarifa uuid; v_cliente uuid; v_pct numeric;
BEGIN
  SELECT v.empresa_id, v.tarifa_id, v.cliente_id INTO v_empresa, v_tarifa, v_cliente
  FROM ventas v WHERE v.id = NEW.venta_id;

  v_pct := public.resolver_comision_pct_linea(v_empresa, v_tarifa, v_cliente, NEW.producto_id);
  NEW.comision_pct := v_pct;
  NEW.comision_monto := CASE WHEN v_pct IS NULL THEN NULL
    ELSE ROUND(COALESCE(NEW.subtotal, 0) * v_pct / 100.0, 2) END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fill_venta_linea_comision ON public.venta_lineas;
CREATE TRIGGER trg_fill_venta_linea_comision
BEFORE INSERT OR UPDATE OF producto_id, subtotal, cantidad ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.fn_fill_venta_linea_comision();

-- Backfill histórico
WITH calc AS (
  SELECT vl.id,
         public.resolver_comision_pct_linea(v.empresa_id, v.tarifa_id, v.cliente_id, vl.producto_id) AS pct,
         COALESCE(vl.subtotal, 0) AS base
  FROM venta_lineas vl
  JOIN ventas v ON v.id = vl.venta_id
  WHERE v.status <> 'cancelado'
)
UPDATE venta_lineas vl
SET comision_pct = c.pct,
    comision_monto = CASE WHEN c.pct IS NULL THEN NULL ELSE ROUND(c.base * c.pct / 100.0, 2) END
FROM calc c WHERE c.id = vl.id;

-- Registrar en detalle de comisiones
INSERT INTO public.venta_comisiones (empresa_id, venta_id, venta_linea_id, vendedor_id, producto_id, monto_venta, comision_pct, comision_monto, fecha_venta)
SELECT v.empresa_id, v.id, vl.id, v.vendedor_id, vl.producto_id, COALESCE(vl.subtotal,0), vl.comision_pct, vl.comision_monto, v.fecha
FROM venta_lineas vl
JOIN ventas v ON v.id = vl.venta_id
WHERE v.status <> 'cancelado'
  AND vl.comision_pct IS NOT NULL
  AND v.vendedor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM venta_comisiones vc WHERE vc.venta_linea_id = vl.id);