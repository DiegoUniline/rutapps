-- Aplicada en producción por el dueño 2026-10-20 (CONFIRMO). Ninguna pantalla escucha
-- cliente_orden_ruta en vivo; generaba carga de Realtime sin uso. Idempotente.
-- Reversa: alter publication supabase_realtime add table public.cliente_orden_ruta;
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cliente_orden_ruta') then
    alter publication supabase_realtime drop table public.cliente_orden_ruta;
  end if;
end $$;
