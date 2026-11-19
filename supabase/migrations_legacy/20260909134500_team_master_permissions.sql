BEGIN;

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

COMMIT;
