-- Configuración editable del pitch de llamada del CRM interno.
-- Lectura: cualquier usuario autenticado (el pitch no contiene datos sensibles).
-- Escritura: exclusivamente super admins.

create table if not exists public.internal_crm_call_pitch_config (
  id text primary key default 'default',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint internal_crm_call_pitch_singleton check (id = 'default')
);

insert into public.internal_crm_call_pitch_config (id, config)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.internal_crm_call_pitch_config enable row level security;
revoke all on table public.internal_crm_call_pitch_config from anon, authenticated;

create or replace function public.fn_crm_call_pitch_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select config
    into v_config
  from public.internal_crm_call_pitch_config
  where id = 'default';

  return coalesce(v_config, '{}'::jsonb);
end;
$$;

create or replace function public.fn_admin_crm_call_pitch_save(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.super_admins sa
    where sa.user_id = auth.uid()
  ) then
    raise exception 'Super admin required';
  end if;

  if p_config is null
     or jsonb_typeof(p_config) <> 'object'
     or jsonb_typeof(p_config -> 'steps') <> 'array'
     or jsonb_array_length(p_config -> 'steps') = 0 then
    raise exception 'Invalid pitch configuration';
  end if;

  insert into public.internal_crm_call_pitch_config (id, config, updated_at, updated_by)
  values ('default', p_config, now(), auth.uid())
  on conflict (id) do update
    set config = excluded.config,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
  returning config into v_saved;

  return v_saved;
end;
$$;

revoke all on function public.fn_crm_call_pitch_get() from public;
revoke all on function public.fn_admin_crm_call_pitch_save(jsonb) from public;
grant execute on function public.fn_crm_call_pitch_get() to authenticated;
grant execute on function public.fn_admin_crm_call_pitch_save(jsonb) to authenticated;

comment on table public.internal_crm_call_pitch_config is 'Configuración singleton del pitch de llamada compartido por Super Admin y Equipo.';
comment on function public.fn_crm_call_pitch_get() is 'Devuelve la configuración vigente del pitch de llamada para usuarios autenticados.';
comment on function public.fn_admin_crm_call_pitch_save(jsonb) is 'Guarda la configuración del pitch; solo puede ejecutarla un super admin.';
