BEGIN;

DO $patch$
DECLARE
  v_name text;
  v_def text;
  v_old text := 'IF NOT public.is_super_admin(auth.uid()) THEN';
  v_new text := 'IF NOT (public.is_super_admin(auth.uid()) OR COALESCE(current_setting(''app.crm_internal_team'', true), '''') = ''on'') THEN';
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'fn_admin_trial_crm_snapshot',
    'fn_admin_trial_crm_workspace',
    'fn_admin_trial_crm_history',
    'fn_admin_trial_crm_save',
    'fn_admin_trial_crm_mark_lost',
    'fn_admin_trial_crm_restore_lost'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name
    LIMIT 1;

    IF v_def IS NULL THEN
      RAISE NOTICE 'No existe %', v_name;
      CONTINUE;
    END IF;

    IF position(v_old IN v_def) = 0 THEN
      RAISE NOTICE 'Guardia no encontrada en %', v_name;
      CONTINUE;
    END IF;

    EXECUTE replace(v_def, v_old, v_new);
  END LOOP;
END
$patch$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_assert_lead(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_platform_team_member(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_trial_crm_leads lead
    WHERE lead.empresa_id = p_empresa_id
      AND lead.assigned_to IN (SELECT public.get_team_visible_people(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Este prospecto no pertenece a tu cartera' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_workspace(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_people uuid[];
  v_snapshot jsonb;
  v_leads jsonb;
BEGIN
  IF NOT public.is_platform_team_member(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_people
  FROM public.get_team_visible_people(auth.uid()) AS id;

  PERFORM set_config('app.crm_internal_team', 'on', true);
  v_snapshot := public.fn_admin_trial_crm_workspace(p_days);
  PERFORM set_config('app.crm_internal_team', 'off', true);

  SELECT COALESCE(jsonb_agg(lead), '[]'::jsonb) INTO v_leads
  FROM jsonb_array_elements(COALESCE(v_snapshot->'leads', '[]'::jsonb)) AS lead
  WHERE (lead->>'assigned_to') IS NOT NULL
    AND (lead->>'assigned_to')::uuid = ANY (v_people);

  RETURN v_snapshot
    || jsonb_build_object(
      'scope', 'team',
      'leads', v_leads,
      'assignees', COALESCE((
        SELECT jsonb_agg(person)
        FROM jsonb_array_elements(COALESCE(v_snapshot->'assignees', '[]'::jsonb)) AS person
        WHERE (person->>'id')::uuid = ANY (v_people)
      ), '[]'::jsonb),
      'operations', COALESCE((
        SELECT jsonb_agg(op)
        FROM jsonb_array_elements(COALESCE(v_snapshot->'operations', '[]'::jsonb)) AS op
        WHERE (op->>'person_id') IS NULL OR (op->>'person_id')::uuid = ANY (v_people)
      ), '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_history(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.fn_team_crm_assert_lead(p_empresa_id);
  PERFORM set_config('app.crm_internal_team', 'on', true);
  v_result := public.fn_admin_trial_crm_history(p_empresa_id);
  PERFORM set_config('app.crm_internal_team', 'off', true);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_save(
  p_empresa_id uuid,
  p_stage text,
  p_assigned_to uuid,
  p_next_follow_up_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_activity_type text DEFAULT 'note',
  p_outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.fn_team_crm_assert_lead(p_empresa_id);

  IF p_assigned_to IS NOT NULL
     AND p_assigned_to NOT IN (SELECT public.get_team_visible_people(auth.uid())) THEN
    RAISE EXCEPTION 'Solo puedes asignar prospectos a tu equipo visible' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.crm_internal_team', 'on', true);
  v_result := public.fn_admin_trial_crm_save(
    p_empresa_id, p_stage, p_assigned_to, p_next_follow_up_at, p_note, p_activity_type, p_outcome
  );
  PERFORM set_config('app.crm_internal_team', 'off', true);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_mark_lost(
  p_empresa_id uuid, p_reason text, p_outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.fn_team_crm_assert_lead(p_empresa_id);
  PERFORM set_config('app.crm_internal_team', 'on', true);
  v_result := public.fn_admin_trial_crm_mark_lost(p_empresa_id, p_reason, p_outcome);
  PERFORM set_config('app.crm_internal_team', 'off', true);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_team_crm_restore_lost(
  p_empresa_id uuid, p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.fn_team_crm_assert_lead(p_empresa_id);
  PERFORM set_config('app.crm_internal_team', 'on', true);
  v_result := public.fn_admin_trial_crm_restore_lost(p_empresa_id, p_note);
  PERFORM set_config('app.crm_internal_team', 'off', true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_team_crm_assert_lead(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_crm_workspace(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_crm_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_crm_save(uuid,text,uuid,timestamptz,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_crm_mark_lost(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_team_crm_restore_lost(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_team_crm_workspace(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_save(uuid,text,uuid,timestamptz,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_mark_lost(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_restore_lost(uuid,text) TO authenticated;

COMMIT;