-- RutApp · VISTA PREVIA de la optimización RLS (solo lectura, no cambia nada)
-- Lista cada política que cambiaría, con su texto actual y el nuevo.
BEGIN;

create or replace function pg_temp.rls_wrap(expr text) returns text language plpgsql immutable as $f$
declare t text := expr;
begin
  if t is null then return null; end if;
  -- 1) proteger lo que ya está envuelto
  t := replace(t, '( SELECT auth.uid() AS uid)', '§U§');
  t := replace(t, '( SELECT auth.jwt() AS jwt)', '§J§');
  t := replace(t, '( SELECT get_my_empresa_id() AS get_my_empresa_id)', '§E§');
  t := replace(t, '( SELECT is_super_admin(§U§) AS is_super_admin)', '§S§');
  t := replace(t, '( SELECT is_active_app_user(§U§) AS is_active_app_user)', '§A§');
  t := replace(t, '( SELECT is_active_app_user() AS is_active_app_user)', '§A0§');
  -- 2) marcar llamadas sin envolver
  t := replace(t, 'auth.uid()', '§U§');
  t := replace(t, 'auth.jwt()', '§J§');
  t := replace(t, 'public.get_my_empresa_id()', '§E§');
  t := replace(t, 'get_my_empresa_id()', '§E§');
  t := replace(t, 'public.is_super_admin(§U§)', '§S§');
  t := replace(t, 'is_super_admin(§U§)', '§S§');
  t := replace(t, 'public.is_active_app_user(§U§)', '§A§');
  t := replace(t, 'is_active_app_user(§U§)', '§A§');
  t := replace(t, 'public.is_active_app_user()', '§A0§');
  t := replace(t, 'is_active_app_user()', '§A0§');
  -- 3) expandir como subconsultas escalares (se evalúan una vez por consulta)
  t := replace(t, '§S§', '( SELECT is_super_admin(( SELECT auth.uid() AS uid)) AS is_super_admin)');
  t := replace(t, '§A0§', '( SELECT is_active_app_user() AS is_active_app_user)');
  t := replace(t, '§A§', '( SELECT is_active_app_user(( SELECT auth.uid() AS uid)) AS is_active_app_user)');
  t := replace(t, '§E§', '( SELECT get_my_empresa_id() AS get_my_empresa_id)');
  t := replace(t, '§J§', '( SELECT auth.jwt() AS jwt)');
  t := replace(t, '§U§', '( SELECT auth.uid() AS uid)');
  return t;
end $f$;

SELECT tablename AS tabla, policyname AS politica, permissive, cmd,
       qual AS using_actual, pg_temp.rls_wrap(qual) AS using_nuevo,
       with_check AS check_actual, pg_temp.rls_wrap(with_check) AS check_nuevo
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual IS DISTINCT FROM pg_temp.rls_wrap(qual) OR with_check IS DISTINCT FROM pg_temp.rls_wrap(with_check))
ORDER BY tablename, policyname;

ROLLBACK;
