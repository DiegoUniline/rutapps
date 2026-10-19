-- RutApp · Verificación después de aplicar los huecos (solo SELECT)
select 'función' as tipo, f as objeto,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f) then 'OK' else 'FALTA' end as estado
from unnest(array['fn_customer_intelligence_product_dimensions','admin_set_team_permissions','team_has_master_permission','ensure_entrega_completion_timestamp']) f
union all
select 'trigger', 'trg_ensure_entrega_completion_timestamp',
       case when exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'entregas' and t.tgname = 'trg_ensure_entrega_completion_timestamp') then 'OK' else 'FALTA' end
union all
select 'índice', i, case when exists (select 1 from pg_indexes x where x.schemaname = 'public' and x.indexname = i) then 'OK' else 'FALTA' end
from unnest(array['idx_entregas_empresa_fecha_entrega_hecho','idx_entregas_empresa_fecha_pendiente']) i
union all
select 'datos', 'entregas hechas sin fecha_entrega', count(*)::text
from public.entregas where status = 'hecho' and fecha_entrega is null;
