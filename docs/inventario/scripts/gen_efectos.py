import json, sys
rows = json.load(open(sys.argv[1]))
pref = {'funcion': 'f', 'tabla': 't', 'columna': 'c', 'indice': 'i', 'trigger': 'g', 'politica': 'p'}
vals = ",\n".join("('%s','%s','%s','%s')" % (v, pref[k], o.replace("'", "''"), (t or '').replace("'", "''")) for v, n, k, o, t in rows)
sql = f"""-- RutApp · ¿Qué parte de cada migración NO registrada existe realmente en producción? Solo SELECT.
-- tipo: f=función t=tabla c=columna (tabla.columna) i=índice g=trigger p=política. Una función presente puede tener otra versión del cuerpo.
with o(version, tipo, objeto, tabla) as (values
{vals}
),
r as (
  select o.*,
    case o.tipo
      when 'f' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = o.objeto)
      when 't' then exists (select 1 from information_schema.tables x where x.table_schema = 'public' and x.table_name = o.objeto)
      when 'c' then exists (select 1 from information_schema.columns x where x.table_schema = 'public' and x.table_name = split_part(o.objeto, '.', 1) and x.column_name = split_part(o.objeto, '.', 2))
      when 'i' then exists (select 1 from pg_indexes x where x.schemaname = 'public' and x.indexname = o.objeto)
      when 'g' then exists (select 1 from pg_trigger x join pg_class c on c.oid = x.tgrelid where x.tgname = o.objeto and c.relname = o.tabla and not x.tgisinternal)
      when 'p' then exists (select 1 from pg_policies x where x.schemaname = 'public' and x.policyname = o.objeto and x.tablename = o.tabla)
    end as existe
  from o
)
select version,
  case when bool_and(existe) then 'COMPLETA' when bool_or(existe) then 'PARCIAL' else 'AUSENTE' end as en_bd,
  count(*) filter (where existe) || '/' || count(*) as objetos,
  string_agg(case when not existe then tipo || ':' || objeto end, ', ' order by tipo, objeto) as faltan
from r
group by version
order by case when bool_and(existe) then 3 when bool_or(existe) then 2 else 1 end, version;
"""
open(sys.argv[2], 'w').write(sql); print(len(sql))
