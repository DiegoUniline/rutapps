-- Enforce canonical supplier linkage for purchase requests.
-- proveedores is the source of truth; nombre/email in solicitudes_compra are audit snapshots.

create index if not exists solicitudes_compra_proveedor_idx
  on public.solicitudes_compra(empresa_id, proveedor_id);

-- If solicitudes_compra existed before the original migration, CREATE TABLE IF NOT EXISTS
-- would not retrofit a missing foreign key. Ensure the relationship exists.
-- NOT VALID keeps the migration deployable even if a legacy row contains an orphan id;
-- PostgreSQL still enforces the FK for all new/changed values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and r.relname = 'solicitudes_compra'
      and pg_get_constraintdef(c.oid) like 'FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)%'
  ) then
    alter table public.solicitudes_compra
      add constraint solicitudes_compra_proveedor_id_fkey
      foreign key (proveedor_id)
      references public.proveedores(id)
      on delete set null
      not valid;
  end if;
end
$$;

-- Validate tenant ownership and always synchronize supplier snapshots from proveedores.
create or replace function public.solicitud_compra_sync_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_email text;
  v_empresa_id uuid;
begin
  -- New requests must always point to a real supplier. Legacy rows that were already
  -- created without proveedor_id remain editable so they can be repaired manually.
  if new.proveedor_id is null then
    if tg_op = 'INSERT' or old.proveedor_id is distinct from new.proveedor_id then
      raise exception 'Selecciona un proveedor registrado en el catálogo de proveedores.'
        using errcode = '23502';
    end if;
    return new;
  end if;

  select p.nombre, p.email, p.empresa_id
    into v_nombre, v_email, v_empresa_id
  from public.proveedores p
  where p.id = new.proveedor_id;

  if not found then
    raise exception 'El proveedor seleccionado no existe.'
      using errcode = '23503';
  end if;

  if v_empresa_id is distinct from new.empresa_id then
    raise exception 'El proveedor seleccionado no pertenece a esta empresa.'
      using errcode = '23514';
  end if;

  -- These fields are snapshots only. They cannot diverge from the supplier master.
  new.proveedor_nombre := coalesce(v_nombre, '');
  new.proveedor_email := nullif(btrim(coalesce(v_email, '')), '');

  return new;
end;
$$;

drop trigger if exists trg_solicitud_compra_sync_proveedor
  on public.solicitudes_compra;

create trigger trg_solicitud_compra_sync_proveedor
before insert or update
on public.solicitudes_compra
for each row
execute function public.solicitud_compra_sync_proveedor();

-- Bring existing linked requests back in sync with the supplier catalog.
update public.solicitudes_compra s
set
  proveedor_nombre = coalesce(p.nombre, ''),
  proveedor_email = nullif(btrim(coalesce(p.email, '')), '')
from public.proveedores p
where p.id = s.proveedor_id
  and p.empresa_id = s.empresa_id
  and (
    s.proveedor_nombre is distinct from coalesce(p.nombre, '')
    or s.proveedor_email is distinct from nullif(btrim(coalesce(p.email, '')), '')
  );

comment on column public.solicitudes_compra.proveedor_id is
  'Proveedor canónico ligado a public.proveedores. Nombre y email son snapshots de auditoría.';
