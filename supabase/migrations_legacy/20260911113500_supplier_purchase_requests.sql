-- Portal de proveedores para solicitudes de compra
-- Flujo: solicitud interna -> correo/enlace público -> respuesta proveedor -> compra

create table if not exists public.solicitudes_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  folio text,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  proveedor_nombre text not null default '',
  proveedor_email text,
  almacen_id uuid references public.almacenes(id) on delete set null,
  fecha_requerida date,
  notas text,
  proveedor_observaciones text,
  status text not null default 'borrador' check (status in ('borrador','enviada','vista','borrador_proveedor','respondida','convertida','cancelada')),
  public_token uuid not null default gen_random_uuid(),
  token_expires_at timestamptz,
  cc_emails text[] not null default '{}'::text[],
  enviado_at timestamptz,
  visto_at timestamptz,
  borrador_proveedor_at timestamptz,
  respondido_at timestamptz,
  compra_id uuid references public.compras(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(public_token)
);

create table if not exists public.solicitud_compra_lineas (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_compra(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  producto_codigo text,
  producto_nombre text not null,
  unidad text,
  cantidad_solicitada numeric not null default 0 check (cantidad_solicitada > 0),
  cantidad_surtida numeric check (cantidad_surtida is null or cantidad_surtida >= 0),
  cantidad_aceptada numeric check (cantidad_aceptada is null or cantidad_aceptada >= 0),
  costo_unitario numeric check (costo_unitario is null or costo_unitario >= 0),
  fecha_entrega date,
  disponible boolean,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solicitud_compra_eventos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_compra(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null,
  actor_tipo text not null default 'interno',
  actor_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists solicitudes_compra_empresa_idx on public.solicitudes_compra(empresa_id, created_at desc);
create index if not exists solicitudes_compra_status_idx on public.solicitudes_compra(empresa_id, status);
create index if not exists solicitud_compra_lineas_solicitud_idx on public.solicitud_compra_lineas(solicitud_id, orden);
create index if not exists solicitud_compra_eventos_solicitud_idx on public.solicitud_compra_eventos(solicitud_id, created_at);

create or replace function public.solicitud_compra_empresa_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.empresa_id from public.profiles p where p.id = auth.uid() limit 1
$$;

revoke all on function public.solicitud_compra_empresa_actual() from public;
grant execute on function public.solicitud_compra_empresa_actual() to authenticated;

create or replace function public.solicitud_compra_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.folio is null or btrim(new.folio) = '' then
    new.folio := 'SC-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;
  if new.token_expires_at is null then
    new.token_expires_at := now() + interval '30 days';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_solicitud_compra_defaults on public.solicitudes_compra;
create trigger trg_solicitud_compra_defaults
before insert or update on public.solicitudes_compra
for each row execute function public.solicitud_compra_defaults();

create or replace function public.solicitud_compra_linea_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_solicitud_compra_linea_updated_at on public.solicitud_compra_lineas;
create trigger trg_solicitud_compra_linea_updated_at
before update on public.solicitud_compra_lineas
for each row execute function public.solicitud_compra_linea_updated_at();

alter table public.solicitudes_compra enable row level security;
alter table public.solicitud_compra_lineas enable row level security;
alter table public.solicitud_compra_eventos enable row level security;

drop policy if exists solicitudes_compra_empresa_all on public.solicitudes_compra;
create policy solicitudes_compra_empresa_all
on public.solicitudes_compra
for all
to authenticated
using (empresa_id = public.solicitud_compra_empresa_actual())
with check (empresa_id = public.solicitud_compra_empresa_actual());

drop policy if exists solicitud_compra_lineas_empresa_all on public.solicitud_compra_lineas;
create policy solicitud_compra_lineas_empresa_all
on public.solicitud_compra_lineas
for all
to authenticated
using (
  exists (
    select 1 from public.solicitudes_compra s
    where s.id = solicitud_id
      and s.empresa_id = public.solicitud_compra_empresa_actual()
  )
)
with check (
  exists (
    select 1 from public.solicitudes_compra s
    where s.id = solicitud_id
      and s.empresa_id = public.solicitud_compra_empresa_actual()
  )
);

drop policy if exists solicitud_compra_eventos_empresa_all on public.solicitud_compra_eventos;
create policy solicitud_compra_eventos_empresa_all
on public.solicitud_compra_eventos
for all
to authenticated
using (empresa_id = public.solicitud_compra_empresa_actual())
with check (empresa_id = public.solicitud_compra_empresa_actual());
