---
name: rls-multiempresa
description: Cómo diseñar, revisar y probar Row Level Security en Supabase para que ninguna empresa vea ni toque datos de otra, con permisos por rol. Úsala al crear tablas, funciones, edge functions o al auditar seguridad.
---

# RLS multiempresa

## Modelo base
```sql
create table empresas (id uuid primary key default gen_random_uuid(), nombre text not null, created_at timestamptz default now());
create table usuarios_empresa (
  usuario_id uuid not null references auth.users(id),
  empresa_id uuid not null references empresas(id),
  rol text not null check (rol in ('dueno','admin','cajero','operador')),  -- ajustar a roles aprobados
  activo boolean not null default true,
  primary key (usuario_id, empresa_id)
);
```

## Funciones helper (security definer, search_path fijo)
```sql
create or replace function mis_empresas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios_empresa where usuario_id = auth.uid() and activo
$$;

create or replace function tengo_rol(p_empresa uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios_empresa
                 where usuario_id = auth.uid() and empresa_id = p_empresa
                   and activo and rol = any(p_roles))
$$;
```

## Políticas por tabla
```sql
alter table <t> enable row level security;

create policy <t>_select on <t> for select to authenticated
  using (empresa_id in (select mis_empresas()));

create policy <t>_insert on <t> for insert to authenticated
  with check (empresa_id in (select mis_empresas()) and tengo_rol(empresa_id, array['dueno','admin','cajero']));

create policy <t>_update on <t> for update to authenticated
  using (empresa_id in (select mis_empresas()))
  with check (empresa_id in (select mis_empresas()) and tengo_rol(empresa_id, array['dueno','admin']));
-- sin policy de delete = nadie borra desde el cliente; borrado vía RPC.
```
Campos sensibles (ej. solo admin cambia RFC/precio): trigger `before update` que compare old/new y valide `tengo_rol`, porque RLS no es por columna.

## Reglas
- RLS activo en TODAS las tablas del esquema public. Sin excepción.
- `with check` siempre en insert/update: impide mover un registro a otra empresa.
- FK entre tablas de negocio: validar que el padre sea de la misma empresa (trigger o FK compuesta `(empresa_id, id)`).
- Funciones `security definer`: siempre `set search_path` y validar empresa del usuario adentro. Si no lo necesitan, `security invoker`.
- Edge functions: usar el JWT del usuario (cliente con su token). `service_role` solo para tareas de sistema, y entonces validar empresa manualmente.
- Vistas: `with (security_invoker = true)`.
- Storage: políticas por carpeta `<empresa_id>/…`.

## Auditar
```sql
-- tablas sin RLS
select tablename from pg_tables where schemaname='public' and not rowsecurity;
-- políticas existentes
select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public' order by 1;
-- funciones security definer
select proname, prosecdef, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where nspname='public' and prosecdef;
```
Buscar en código: `service_role`, `SUPABASE_SERVICE_ROLE_KEY` fuera de supabase/functions, queries sin `.eq('empresa_id', …)` cuando dependen de ello.

## Probar
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid_usuario_empresa_B>","role":"authenticated"}';
select count(*) from clientes where empresa_id = '<empresa_A>';  -- debe ser 0
insert into clientes (empresa_id, …) values ('<empresa_A>', …);    -- debe fallar
rollback;
```
