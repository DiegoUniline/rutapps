-- F0a seguridad (auditoría 2026-11-19 S1). Autorizado: "CONFIRMO migración seguridad F0a" (dueño, 2026-11-19).
-- Las funciones SECURITY DEFINER de public dejan de ser ejecutables sin sesión (anon/PUBLIC).
-- authenticated y service_role conservan EXECUTE. Excepciones con anon:
--   is_email_blacklisted (registro, SignupPage) y los helpers que usan las políticas RLS.
-- Reversible: GRANT EXECUTE ON FUNCTION ... TO anon;
do $$
declare
  f record;
  keep_anon constant text[] := array[
    'is_email_blacklisted',
    'get_my_empresa_id', 'get_my_partner_id', 'is_super_admin',
    'is_active_app_user', 'is_diego_super_admin', 'user_role_empresa_id'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
    if not (f.proname = any (keep_anon)) then
      execute format('revoke execute on function %s from public, anon', f.sig);
    end if;
  end loop;
end $$;

-- Funciones nuevas: sin EXECUTE para anon/PUBLIC por defecto.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
