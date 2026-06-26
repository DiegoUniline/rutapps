
CREATE OR REPLACE FUNCTION public.stock_almacen_at_eod_v2(
  p_almacen_id uuid,
  p_fecha date
)
RETURNS TABLE(producto_id uuid, cantidad numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_tz text;
  v_cutoff timestamptz;
BEGIN
  SELECT a.empresa_id, COALESCE(e.zona_horaria, 'America/Mexico_City')
    INTO v_empresa_id, v_tz
  FROM public.almacenes a
  LEFT JOIN public.empresas e ON e.id = a.empresa_id
  WHERE a.id = p_almacen_id;

  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  v_cutoff := ((p_fecha + 1)::timestamp AT TIME ZONE v_tz);

  RETURN QUERY
  WITH live AS (
    SELECT s.producto_id, COALESCE(s.cantidad, 0)::numeric AS cantidad
    FROM public.stock_almacen s
    WHERE s.almacen_id = p_almacen_id
  ),
  posteriores AS (
    SELECT
      m.producto_id,
      SUM(
        CASE
          -- Entradas al almacén (sumaron stock → revertir restando)
          WHEN m.tipo = 'entrada' AND m.almacen_destino_id = p_almacen_id
            THEN COALESCE(m.cantidad,0)
          WHEN m.tipo = 'transferencia' AND m.almacen_destino_id = p_almacen_id
            THEN COALESCE(m.cantidad,0)
          -- Salidas del almacén (restaron stock → revertir sumando)
          WHEN m.tipo = 'salida' AND m.almacen_origen_id = p_almacen_id
            THEN -COALESCE(m.cantidad,0)
          WHEN m.tipo = 'transferencia' AND m.almacen_origen_id = p_almacen_id
            THEN -COALESCE(m.cantidad,0)
          ELSE 0
        END
      )::numeric AS delta
    FROM public.movimientos_inventario m
    WHERE m.empresa_id = v_empresa_id
      AND (m.almacen_origen_id = p_almacen_id OR m.almacen_destino_id = p_almacen_id)
      AND m.created_at >= v_cutoff
    GROUP BY m.producto_id
  )
  SELECT
    COALESCE(l.producto_id, p.producto_id) AS producto_id,
    (COALESCE(l.cantidad,0) - COALESCE(p.delta,0))::numeric AS cantidad
  FROM live l
  FULL OUTER JOIN posteriores p ON p.producto_id = l.producto_id;
END;
$$;
