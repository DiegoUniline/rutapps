DROP FUNCTION IF EXISTS public.fn_team_crm_save(uuid, text, timestamptz, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_team_crm_workspace(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_people uuid[];
  v_users uuid[];
  v_snapshot jsonb;
  v_leads jsonb;
  v_ops jsonb;
BEGIN
  IF NOT public.is_platform_team_member(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_people
  FROM public.get_team_visible_people(auth.uid()) AS id;

  SELECT COALESCE(array_agg(tm.user_id), ARRAY[]::uuid[]) INTO v_users
  FROM public.platform_team_members tm
  WHERE tm.person_id = ANY (v_people) AND tm.user_id IS NOT NULL;

  PERFORM set_config('app.crm_internal_team', 'on', true);
  v_snapshot := public.fn_admin_trial_crm_workspace(p_days);
  PERFORM set_config('app.crm_internal_team', 'off', true);

  SELECT COALESCE(jsonb_agg(lead), '[]'::jsonb) INTO v_leads
  FROM jsonb_array_elements(COALESCE(v_snapshot->'leads', '[]'::jsonb)) AS lead
  WHERE (lead->>'assigned_to') IS NOT NULL
    AND (lead->>'assigned_to')::uuid = ANY (v_people);

  v_ops := COALESCE(v_snapshot->'operations', '{}'::jsonb);
  IF jsonb_typeof(v_ops) = 'object' THEN
    v_ops := v_ops || jsonb_build_object(
      'team', COALESCE((
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_ops->'team') = 'array' THEN v_ops->'team' ELSE '[]'::jsonb END) AS item
        WHERE (item->>'user_id') IS NOT NULL AND (item->>'user_id')::uuid = ANY (v_users)
      ), '[]'::jsonb),
      'recent', COALESCE((
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_ops->'recent') = 'array' THEN v_ops->'recent' ELSE '[]'::jsonb END) AS item
        WHERE (item->>'created_by') IS NULL OR (item->>'created_by')::uuid = ANY (v_users)
      ), '[]'::jsonb)
    );
  ELSE
    v_ops := '{}'::jsonb;
  END IF;

  RETURN v_snapshot
    || jsonb_build_object(
      'scope', 'team',
      'leads', v_leads,
      'operations', v_ops,
      'assignees', COALESCE((
        SELECT jsonb_agg(person)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_snapshot->'assignees') = 'array' THEN v_snapshot->'assignees' ELSE '[]'::jsonb END) AS person
        WHERE (person->>'id') IS NOT NULL AND (person->>'id')::uuid = ANY (v_people)
      ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_team_crm_workspace(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_team_crm_workspace(integer) TO authenticated;