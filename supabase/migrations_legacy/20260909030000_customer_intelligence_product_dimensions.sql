-- Product dimensions for Customer 360.
-- Kept separate from the sales calculation so category/brand analysis can be
-- added without changing totals, trends or the original snapshot contract.

CREATE OR REPLACE FUNCTION public.fn_customer_intelligence_product_dimensions(
  p_empresa_id uuid,
  p_cliente_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_empresa_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Empresa y cliente son obligatorios' USING ERRCODE = '22004';
  END IF;

  IF p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para consultar esta empresa'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = p_cliente_id
      AND c.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece a la empresa' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', dimensions.id,
    'category_name', dimensions.category_name,
    'brand_name', dimensions.brand_name
  ) ORDER BY dimensions.id), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT DISTINCT
      p.id,
      COALESCE(cl.nombre, 'Sin categoría') AS category_name,
      COALESCE(m.nombre, 'Sin marca') AS brand_name
    FROM public.ventas v
    JOIN public.venta_lineas vl ON vl.venta_id = v.id
    JOIN public.productos p
      ON p.id = vl.producto_id
     AND p.empresa_id = p_empresa_id
    LEFT JOIN public.clasificaciones cl ON cl.id = p.clasificacion_id
    LEFT JOIN public.marcas m ON m.id = p.marca_id
    WHERE v.empresa_id = p_empresa_id
      AND v.cliente_id = p_cliente_id
      AND v.fecha <= current_date
      AND COALESCE(v.es_saldo_inicial, false) = false
      AND v.status::text NOT IN ('cancelado', 'borrador')
      AND vl.producto_id IS NOT NULL
  ) dimensions;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_customer_intelligence_product_dimensions(uuid, uuid)
  IS 'Categoría y marca de los productos comprados por un cliente; no recalcula importes ni cantidades.';

REVOKE ALL ON FUNCTION public.fn_customer_intelligence_product_dimensions(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_customer_intelligence_product_dimensions(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
