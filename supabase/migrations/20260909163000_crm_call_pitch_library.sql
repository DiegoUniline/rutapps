-- Biblioteca de pitches del CRM interno.
-- Mantiene compatibilidad con la configuración singleton anterior.

create or replace function public.fn_crm_call_pitch_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value jsonb;
  v_active text;
  v_pitch jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select config into v_value from public.internal_crm_call_pitch_config where id = 'default';
  v_value := coalesce(v_value, '{}'::jsonb);

  if jsonb_typeof(v_value -> 'pitches') = 'array' then
    v_active := coalesce(v_value ->> 'active_pitch_id', '');
    select item -> 'config' into v_pitch
    from jsonb_array_elements(v_value -> 'pitches') item
    where item ->> 'id' = v_active
    limit 1;
    if v_pitch is null then
      select item -> 'config' into v_pitch from jsonb_array_elements(v_value -> 'pitches') item limit 1;
    end if;
    return coalesce(v_pitch, '{}'::jsonb);
  end if;

  return v_value;
end;
$$;

create or replace function public.fn_admin_crm_call_pitch_catalog_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_value jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.super_admins sa where sa.user_id = auth.uid()) then raise exception 'Super admin required'; end if;
  select config into v_value from public.internal_crm_call_pitch_config where id = 'default';
  return coalesce(v_value, '{}'::jsonb);
end;
$$;

create or replace function public.fn_admin_crm_call_pitch_catalog_save(p_catalog jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_saved jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.super_admins sa where sa.user_id = auth.uid()) then raise exception 'Super admin required'; end if;
  if p_catalog is null or jsonb_typeof(p_catalog) <> 'object' or jsonb_typeof(p_catalog -> 'pitches') <> 'array' or jsonb_array_length(p_catalog -> 'pitches') = 0 then raise exception 'Invalid pitch catalog'; end if;
  if coalesce(p_catalog ->> 'active_pitch_id','') = '' then raise exception 'Active pitch required'; end if;

  insert into public.internal_crm_call_pitch_config (id, config, updated_at, updated_by)
  values ('default', p_catalog, now(), auth.uid())
  on conflict (id) do update set config=excluded.config, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  returning config into v_saved;
  return v_saved;
end;
$$;

-- El editor anterior sigue funcionando: si existe catálogo, actualiza únicamente el pitch activo.
create or replace function public.fn_admin_crm_call_pitch_save(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current jsonb;
  v_active text;
  v_new_pitches jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.super_admins sa where sa.user_id = auth.uid()) then raise exception 'Super admin required'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config -> 'steps') <> 'array' or jsonb_array_length(p_config -> 'steps') = 0 then raise exception 'Invalid pitch configuration'; end if;

  select config into v_current from public.internal_crm_call_pitch_config where id='default';
  if jsonb_typeof(v_current -> 'pitches') = 'array' then
    v_active := v_current ->> 'active_pitch_id';
    select jsonb_agg(case when item ->> 'id' = v_active then jsonb_set(item,'{config}',p_config,true) else item end)
      into v_new_pitches from jsonb_array_elements(v_current -> 'pitches') item;
    v_current := jsonb_set(v_current,'{pitches}',coalesce(v_new_pitches,'[]'::jsonb),true);
    update public.internal_crm_call_pitch_config set config=v_current,updated_at=now(),updated_by=auth.uid() where id='default';
  else
    update public.internal_crm_call_pitch_config set config=p_config,updated_at=now(),updated_by=auth.uid() where id='default';
  end if;
  return p_config;
end;
$$;

revoke all on function public.fn_admin_crm_call_pitch_catalog_get() from public;
revoke all on function public.fn_admin_crm_call_pitch_catalog_save(jsonb) from public;
grant execute on function public.fn_admin_crm_call_pitch_catalog_get() to authenticated;
grant execute on function public.fn_admin_crm_call_pitch_catalog_save(jsonb) to authenticated;
