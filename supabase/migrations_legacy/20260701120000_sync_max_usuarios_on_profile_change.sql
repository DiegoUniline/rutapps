-- Al dar de baja / archivar / crear un usuario, la suscripción debe reflejar
-- automáticamente la cantidad real de usuarios activos — pero NUNCA por debajo
-- de los usuarios incluidos en el plan (el "piso").
--
-- Antes: "Dar de baja" (useUsuarios.toggleEstado) y "Archivar" (archivar_usuario)
-- solo cambiaban profiles.estado y NUNCA tocaban subscriptions.max_usuarios,
-- así que se seguía cobrando de más (el mensaje "no generará costo" no se cumplía).
--
-- Definición de "activo": estado='activo' Y sin archivar (archivado_en IS NULL).
-- El piso sale de subscription_plans (tabla vigente). Si la empresa no tiene un
-- plan ahí, se conserva su max_usuarios actual (no se baja a ciegas).

create or replace function public.sync_max_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_activos int;
begin
  v_empresa := coalesce(new.empresa_id, old.empresa_id);
  if v_empresa is null then
    return coalesce(new, old);
  end if;

  select count(*) into v_activos
  from public.profiles
  where empresa_id = v_empresa
    and estado = 'activo'
    and archivado_en is null;

  update public.subscriptions s
  set max_usuarios = greatest(
        v_activos,
        coalesce(
          (select sp.usuarios_incluidos
             from public.subscription_plans sp
            where sp.id = s.plan_id),
          s.max_usuarios
        )
      ),
      updated_at = now()
  where s.empresa_id = v_empresa;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_max_usuarios on public.profiles;
create trigger trg_sync_max_usuarios
  after insert or delete or update of estado, archivado_en, empresa_id
  on public.profiles
  for each row
  execute function public.sync_max_usuarios();
