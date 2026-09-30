CREATE OR REPLACE FUNCTION public.dashboard_costo_ventas(
  p_empresa_id uuid,
  p_from date,
  p_to date,
  p_vendedor_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_costo numeric;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR p_empresa_id = public.get_my_empresa_id()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(SUM(vl.cantidad * COALESCE(pr.costo, 0)), 0)
    INTO v_costo
  FROM public.venta_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  LEFT JOIN public.productos pr
    ON pr.id = vl.producto_id
   AND pr.empresa_id = p_empresa_id
   AND pr.status = 'activo'
  WHERE v.empresa_id = p_empresa_id
    AND v.es_saldo_inicial = false
    AND v.fecha >= p_from
    AND v.fecha <= p_to
    AND v.status <> 'cancelado'
    AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id);

  RETURN COALESCE(v_costo, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) TO authenticated;