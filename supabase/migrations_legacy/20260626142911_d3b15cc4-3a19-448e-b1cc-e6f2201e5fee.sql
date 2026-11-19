
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
  -- Obtener empresa y zona horaria del almacén
  SELECT a.empresa_id, COALESCE(e.zona_horaria, 'America/Mexico_City')
    INTO v_empresa_id, v_tz
  FROM public.almacenes a
  LEFT JOIN public.empresas e ON e.id = a.empresa_id
  WHERE a.id = p_almacen_id;

  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  -- Fin del día p_fecha en la zona horaria de la empresa, convertido a UTC
  v_cutoff := ((p_fecha + 1)::timestamp AT TIME ZONE v_tz);

  RETURN QUERY
  WITH live AS (
    SELECT s.producto_id, COALESCE(s.cantidad, 0)::numeric AS cantidad
    FROM public.stock_almacen s
    WHERE s.almacen_id = p_almacen_id
  ),
  -- Movimientos posteriores al cierre del día solicitado (los revertimos)
  posteriores AS (
    SELECT
      m.producto_id,
      SUM(
        CASE
          WHEN m.tipo IN ('entrada','entrada_compra','entrada_traspaso','entrada_devolucion','entrada_ajuste','ajuste_positivo','entrada_carga')
            THEN COALESCE(m.cantidad,0)
          WHEN m.tipo IN ('salida','salida_venta','salida_traspaso','salida_merma','salida_ajuste','ajuste_negativo','salida_carga','salida_descarga')
            THEN -COALESCE(m.cantidad,0)
          ELSE 0
        END
      )::numeric AS delta
    FROM public.movimientos_inventario m
    WHERE m.almacen_id = p_almacen_id
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

GRANT EXECUTE ON FUNCTION public.stock_almacen_at_eod_v2(uuid, date) TO authenticated, service_role;
