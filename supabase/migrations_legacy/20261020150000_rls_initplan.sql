-- =====================================================================
-- RutApp · Optimización de políticas RLS (velocidad) — auditoría 2026-10-20
-- Problema (medido en producción): las políticas llaman get_my_empresa_id(),
-- is_super_admin(auth.uid()), is_active_app_user(auth.uid()) y auth.uid()
-- sin envolver, así que Postgres las ejecuta UNA VEZ POR FILA.
-- venta_lineas 90 días: 5 833 ms con RLS actual vs 74 ms optimizada.
-- Arreglo: envolver esas llamadas en (select …) para que se evalúen una vez
-- por consulta (initPlan). NO cambia qué filas ve cada usuario: solo se
-- envuelven llamadas sin columnas de la fila; el resto del texto queda igual.
-- Se genera a partir de las políticas que existen HOY en producción.
-- Idempotente (una segunda corrida no cambia nada). Todo o nada.
-- Lo ejecuta el dueño (D-002) tras escribir CONFIRMO.
-- =====================================================================
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

do $apply$
declare r record; nq text; nc text; n int := 0;
begin
  for r in select * from pg_policies where schemaname = 'public' loop
    nq := pg_temp.rls_wrap(r.qual);
    nc := pg_temp.rls_wrap(r.with_check);
    if nq is distinct from r.qual or nc is distinct from r.with_check then
      execute format('ALTER POLICY %I ON %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
        case when r.qual is not null then format('USING (%s)', nq) else '' end,
        case when r.with_check is not null then format('WITH CHECK (%s)', nc) else '' end);
      n := n + 1;
    end if;
  end loop;
  raise notice 'políticas optimizadas: %', n;
end $apply$;

-- Verificación: políticas que aún tengan llamadas sin envolver (debe salir 0 filas)
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual IS DISTINCT FROM pg_temp.rls_wrap(qual) OR with_check IS DISTINCT FROM pg_temp.rls_wrap(with_check));

COMMIT;
