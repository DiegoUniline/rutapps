BEGIN;

CREATE OR REPLACE FUNCTION public.fn_crm_cancellations_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_allowed boolean := false;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_allowed := public.is_super_admin(auth.uid());

  IF NOT v_allowed THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.platform_team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND COALESCE((tm.permissions ->> 'crm')::boolean, false) = true
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Sin permiso para consultar CRM';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY cancelled_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'empresa_id', e.id,
      'empresa_nombre', e.nombre,
      'licencia', e.licencia,
      'email', e.email,
      'telefono', e.telefono,
      'reason', cr.reason,
      'reason_detail', cr.reason_detail,
      'offered_discount', cr.offered_discount,
      'discount_accepted', cr.discount_accepted,
      'cancelled', cr.cancelled,
      'cancelled_at', cr.created_at,
      'request_id', cr.id
    ) AS row_data,
    cr.created_at AS cancelled_at
    FROM public.cancellation_requests cr
    JOIN public.empresas e ON e.id = cr.empresa_id
    WHERE cr.cancelled = true
  ) q;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_crm_cancellations_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_crm_cancellations_list() TO authenticated;

COMMIT;
