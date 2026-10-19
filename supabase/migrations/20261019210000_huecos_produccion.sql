-- =====================================================================
-- RutApp · Huecos de BD en producción (R-009, R-010) — D-002, D-003
-- Aplica SOLO lo que falta en producción de 3 migraciones del repo que nunca
-- se ejecutaron (confirmado con docs/inventario/efectos-migraciones.sql):
--   20260909030000 customer_intelligence_product_dimensions
--   20260909134500 team_master_permissions
--   20260909040000 entrega_completion_timestamp (el relleno de fechas va aparte:
--   docs/inventario/relleno-fecha-entrega.sql)
-- NO incluye la política RESTRICTIVE de profiles (20260915222000): ver
-- docs/riesgos.md R-013.
-- Idempotente: se puede correr más de una vez. Todo o nada (una transacción).
-- Ejecutar en Supabase → SQL Editor del proyecto rutapp, de preferencia con
-- poco uso (los CREATE INDEX bloquean escrituras en entregas unos segundos).
-- =====================================================================
BEGIN;

-- 1) 20260909030000 · Dimensiones de producto del Customer 360 (dashboard)
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

COMMENT ON FUNCTION public.fn_customer_intelligence_product_dimensions(uuid, uuid)
  IS 'Categoría y marca de los productos comprados por un cliente; no recalcula importes ni cantidades.';
REVOKE ALL ON FUNCTION public.fn_customer_intelligence_product_dimensions(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_customer_intelligence_product_dimensions(uuid, uuid) TO authenticated;

-- 2) 20260909134500 · Permisos del equipo interno (Panel Master)
CREATE OR REPLACE FUNCTION public.admin_set_team_permissions(
  p_person_id uuid,
  p_permissions jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo un super administrador puede cambiar permisos' USING ERRCODE = '42501';
  END IF;
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'object' THEN
    RAISE EXCEPTION 'La configuración de permisos es inválida' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo del cambio de permisos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_team_members tm
    JOIN public.commission_people cp ON cp.id = tm.person_id
    WHERE tm.person_id = p_person_id AND cp.person_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'El integrante no existe' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.commission_change_reason', btrim(p_reason), true);
  UPDATE public.platform_team_members tm
  SET permissions = p_permissions, updated_by = auth.uid()
  WHERE tm.person_id = p_person_id;

  RETURN jsonb_build_object('ok', true, 'person_id', p_person_id, 'permissions', p_permissions);
END;
$$;

CREATE OR REPLACE FUNCTION public.team_has_master_permission(
  p_module text,
  p_action text DEFAULT 'view',
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    CASE
      WHEN public.is_super_admin(p_user_id) THEN true
      ELSE (
        SELECT
          COALESCE((tm.permissions ->> 'master_access')::boolean, false)
          AND COALESCE((tm.permissions -> p_module ->> p_action)::boolean, false)
        FROM public.platform_team_members tm
        JOIN public.commission_people cp ON cp.id = tm.person_id
        WHERE tm.user_id = p_user_id
          AND tm.status IN ('invited','active')
          AND cp.is_active = true
          AND cp.person_type = 'internal'
        LIMIT 1
      )
    END,
    false
  );
$$;

REVOKE ALL ON FUNCTION public.admin_set_team_permissions(uuid,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_has_master_permission(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_team_permissions(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_has_master_permission(text,text,uuid) TO authenticated;

-- 3) 20260909040000 · Fecha real de entrega
CREATE OR REPLACE FUNCTION public.ensure_entrega_completion_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'hecho'::public.status_entrega THEN
    IF TG_OP = 'INSERT' AND NEW.fecha_entrega IS NULL THEN
      NEW.fecha_entrega := now();
    ELSIF TG_OP = 'UPDATE'
      AND OLD.status IS DISTINCT FROM 'hecho'::public.status_entrega
      AND (NEW.fecha_entrega IS NULL OR NEW.fecha_entrega IS NOT DISTINCT FROM OLD.fecha_entrega)
    THEN
      NEW.fecha_entrega := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_entrega_completion_timestamp ON public.entregas;
CREATE TRIGGER trg_ensure_entrega_completion_timestamp
BEFORE INSERT OR UPDATE OF status ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.ensure_entrega_completion_timestamp();

CREATE INDEX IF NOT EXISTS idx_entregas_empresa_fecha_entrega_hecho
  ON public.entregas (empresa_id, fecha_entrega DESC)
  WHERE status = 'hecho'::public.status_entrega;

CREATE INDEX IF NOT EXISTS idx_entregas_empresa_fecha_pendiente
  ON public.entregas (empresa_id, fecha)
  WHERE status NOT IN (
    'hecho'::public.status_entrega,
    'cancelado'::public.status_entrega,
    'no_entregado'::public.status_entrega
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
