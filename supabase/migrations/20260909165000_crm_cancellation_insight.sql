BEGIN;

CREATE OR REPLACE FUNCTION public.fn_crm_cancellation_insight(p_empresa_id uuid)
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

  SELECT jsonb_build_object(
    'empresa_id', p_empresa_id,
    'total_requests', count(*),
    'has_cancelled', COALESCE(bool_or(cr.cancelled), false),
    'latest', (
      SELECT jsonb_build_object(
        'id', latest.id,
        'reason', latest.reason,
        'reason_detail', latest.reason_detail,
        'offered_discount', latest.offered_discount,
        'discount_accepted', latest.discount_accepted,
        'cancelled', latest.cancelled,
        'created_at', latest.created_at
      )
      FROM public.cancellation_requests latest
      WHERE latest.empresa_id = p_empresa_id
      ORDER BY latest.created_at DESC, latest.id DESC
      LIMIT 1
    ),
    'latest_cancelled', (
      SELECT jsonb_build_object(
        'id', cancelled_row.id,
        'reason', cancelled_row.reason,
        'reason_detail', cancelled_row.reason_detail,
        'offered_discount', cancelled_row.offered_discount,
        'discount_accepted', cancelled_row.discount_accepted,
        'cancelled', cancelled_row.cancelled,
        'created_at', cancelled_row.created_at
      )
      FROM public.cancellation_requests cancelled_row
      WHERE cancelled_row.empresa_id = p_empresa_id
        AND cancelled_row.cancelled = true
      ORDER BY cancelled_row.created_at DESC, cancelled_row.id DESC
      LIMIT 1
    )
  )
  INTO v_result
  FROM public.cancellation_requests cr
  WHERE cr.empresa_id = p_empresa_id;

  RETURN COALESCE(
    v_result,
    jsonb_build_object(
      'empresa_id', p_empresa_id,
      'total_requests', 0,
      'has_cancelled', false,
      'latest', null,
      'latest_cancelled', null
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_crm_cancellation_insight(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_crm_cancellation_insight(uuid) TO authenticated;

COMMIT;
