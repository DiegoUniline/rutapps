import json, os, re, sys
S, root, out = sys.argv[1], sys.argv[2], sys.argv[3]
ty = json.load(open(f'{S}/types.json')); code = json.load(open(f'{S}/code.json'))
NOT_TABLES = {'avatars', 'csf', 'publicidad', 'tabla'}  # buckets de storage / nombre dinámico
types_cols = sorted({(t, c) for t, cols in ty['tables'].items() for c in cols})
code_tables = sorted(set(code['tables_used']) - NOT_TABLES)
rpcs = sorted(code['rpc_used'])
# referencias de columna del código (deduplicadas, solo tablas conocidas); la de lista_precios.venta_id es falso positivo del analizador
code_cols = {(t, c): w for t, c, w in code['col_refs_all'] if (t, c) != ('lista_precios', 'venta_id')}
versions = sorted(re.match(r'(\d+)', f).group(1) for f in os.listdir(os.path.join(root, 'supabase/migrations')) if f.endswith('.sql'))
buckets = sorted({'avatars', 'csf', 'publicidad'})
J = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
sql = f"""-- =====================================================================
-- RutApp · Validación del esquema REAL de producción contra repo/código
-- Generado 2026-10-19 desde: src/integrations/supabase/types.ts,
-- supabase/migrations ({len(versions)} archivos) y uso real en src/ + supabase/functions.
-- SOLO LECTURA: únicamente SELECT. No modifica datos ni estructura.
-- Ejecutar en Supabase → SQL Editor (proyecto rutapp) y compartir el resultado.
-- =====================================================================

-- 1) HALLAZGOS: una fila por discrepancia. Resultado vacío = todo coincide.
with
types_cols(tabla, columna) as (
  select x->>0, x->>1 from jsonb_array_elements($j${J(types_cols)}$j$::jsonb) x
),
types_tablas as (select distinct tabla from types_cols),
code_tablas(tabla) as (
  select jsonb_array_elements_text($j${J(code_tables)}$j$::jsonb)
),
code_cols(tabla, columna, donde) as (
  select x->>0, x->>1, x->>2 from jsonb_array_elements($j${J([[t, c, w] for (t, c), w in sorted(code_cols.items())])}$j$::jsonb) x
),
code_rpc(funcion) as (
  select jsonb_array_elements_text($j${J(rpcs)}$j$::jsonb)
),
repo_mig(version) as (
  select jsonb_array_elements_text($j${J(versions)}$j$::jsonb)
),
bd_cols as (
  select c.table_name as tabla, c.column_name as columna, c.data_type, c.udt_name
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type in ('BASE TABLE', 'VIEW')
),
bd_tablas as (select distinct tabla from bd_cols),
hallazgos as (
  select 'ALTA' sev, 'TABLA usada por el código NO existe en BD' tipo, ct.tabla objeto, null::text detalle
    from code_tablas ct where not exists (select 1 from bd_tablas b where b.tabla = ct.tabla)
  union all
  select 'ALTA', 'COLUMNA usada por el código NO existe en BD', cc.tabla || '.' || cc.columna, cc.donde
    from code_cols cc where not exists (select 1 from bd_cols b where b.tabla = cc.tabla and b.columna = cc.columna)
  union all
  select 'ALTA', 'FUNCIÓN RPC llamada por el código NO existe en BD', r.funcion, null
    from code_rpc r where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = r.funcion)
  union all
  select 'MEDIA', 'TABLA en types.ts NO existe en BD (types desactualizado)', tt.tabla, null
    from types_tablas tt where not exists (select 1 from bd_tablas b where b.tabla = tt.tabla)
  union all
  select 'MEDIA', 'COLUMNA en types.ts NO existe en BD (types desactualizado)', tc.tabla || '.' || tc.columna, null
    from types_cols tc where exists (select 1 from bd_tablas b where b.tabla = tc.tabla)
      and not exists (select 1 from bd_cols b where b.tabla = tc.tabla and b.columna = tc.columna)
  union all
  select 'MEDIA', 'TABLA en BD que NO está en types.ts', b.tabla, null
    from bd_tablas b where not exists (select 1 from types_tablas tt where tt.tabla = b.tabla)
  union all
  select 'BAJA', 'COLUMNA en BD que NO está en types.ts', b.tabla || '.' || b.columna, b.data_type
    from bd_cols b where exists (select 1 from types_tablas tt where tt.tabla = b.tabla)
      and not exists (select 1 from types_cols tc where tc.tabla = b.tabla and tc.columna = b.columna)
  union all
  select 'MEDIA', 'MIGRACIÓN aplicada en BD que NO está en el repo', m.version, m.name
    from supabase_migrations.schema_migrations m where not exists (select 1 from repo_mig r where r.version = m.version)
  union all
  select 'MEDIA', 'MIGRACIÓN del repo NO registrada como aplicada', r.version, null
    from repo_mig r where not exists (select 1 from supabase_migrations.schema_migrations m where m.version = r.version)
  union all
  select 'ALTA', 'TABLA pública SIN RLS', c.relname, null
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  union all
  select 'ALTA', 'TABLA con RLS activo pero SIN políticas (nadie puede leer/escribir salvo service_role)', c.relname, null
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
  union all
  select 'ALTA', 'TABLA con empresa_id cuyas políticas NO mencionan empresa', b.tabla, string_agg(p.policyname, ', ')
    from bd_cols b join pg_policies p on p.schemaname = 'public' and p.tablename = b.tabla
    where b.columna = 'empresa_id'
    group by b.tabla
    having bool_and(coalesce(p.qual, '') || coalesce(p.with_check, '') !~* 'empresa')
  union all
  select 'MEDIA', 'DINERO en tipo flotante (usar numeric)', b.tabla || '.' || b.columna, b.data_type
    from bd_cols b
    where b.data_type in ('real', 'double precision')
      and b.columna ~* '(total|precio|monto|saldo|costo|importe|subtotal|descuento|comision|pago|iva|ieps)'
  union all
  select 'BAJA', 'BUCKET de storage usado por el código NO existe', bk, null
    from jsonb_array_elements_text($j${J(buckets)}$j$::jsonb) bk
    where not exists (select 1 from storage.buckets s where s.id = bk)
)
select sev, tipo, objeto, detalle
from hallazgos
order by case sev when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end, tipo, objeto;

-- 2) RESUMEN de conteos (para comparar con el inventario: types.ts = {len(ty['tables'])} tablas, {len(types_cols)} columnas).
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as tablas_bd,
  (select count(*) from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE') as columnas_bd,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funciones_bd,
  (select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not tg.tgisinternal) as triggers_bd,
  (select count(*) from pg_policies where schemaname = 'public') as politicas_bd,
  (select count(*) from supabase_migrations.schema_migrations) as migraciones_aplicadas,
  {len(versions)} as migraciones_repo;

-- 3) NOMBRES ENGAÑOSOS: confirmar a qué tabla apuntan realmente estas llaves foráneas.
select tc.table_name as tabla, kcu.column_name as columna, ccu.table_name as apunta_a
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  and kcu.column_name in ('vendedor_id', 'cobrador_id', 'zona_id', 'tarifa_id', 'lista_id', 'lista_precio_id')
order by 1, 2;

-- 4) TABLAS SIN MIGRACIÓN EN EL REPO (existen en types.ts, nadie las crea en supabase/migrations).
select c.table_name, c.ordinal_position, c.column_name, c.data_type, c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('auditoria_reparaciones_inventario', 'email_send_log', 'email_send_state', 'email_unsubscribe_tokens', 'suppressed_emails')
order by 1, 2;

-- 5) TABLAS SIN USO en el código: filas actuales y última escritura (¿legado o vivas?).
select s.relname as tabla, s.n_live_tup as filas_aprox, s.n_tup_ins as inserts, s.n_tup_upd as updates,
       greatest(s.last_autovacuum, s.last_autoanalyze, s.last_analyze) as ultima_actividad_aprox
from pg_stat_user_tables s
where s.schemaname = 'public' and s.relname = any (array{J(code['types_tables_unused'])}::text[])
order by s.n_live_tup desc;
"""
# convertir lista JSON a array de texto Postgres
sql = re.sub(r"array\[(.*?)\]::text\[\]", lambda m: "array[" + ",".join("'" + x.strip().strip('"') + "'" for x in m.group(1).split(',')) + "]::text[]", sql)
open(out, 'w').write(sql)
print(len(sql), 'bytes', len(types_cols), 'cols types', len(code_tables), 'tablas código', len(rpcs), 'rpc', len(code_cols), 'cols usadas por código', len(versions), 'migraciones')
