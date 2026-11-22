#!/usr/bin/env bash
# Recarga TODOS los datos (public + auth.users/identities) desde un backup custom
# de Lovable (pg_dump -Fc) hacia el Supabase propio, sin tocar funciones, políticas
# ni crons. Todo en UNA transacción: si algo falla, no cambia nada.
#
# El destino puede tener MÁS que el backup (tablas, columnas y constraints agregados
# después de la base del 2026-11-19). Aborta solo si el backup trae tablas/columnas que
# el destino no tiene, o si una columna nueva del destino es NOT NULL sin default.
#
# Constraints nuevos (no están en el backup) sobre tablas del backup: se quitan antes de
# copiar y se vuelven a poner al final DENTRO de la misma transacción. Si los datos
# viejos los violan: CHECK/FK quedan NOT VALID (protegen lo nuevo, no se validan los
# viejos) y UNIQUE/índice único queda SIN CREAR; todo sale en el reporte para el dueño.
# Después del COPY corre scripts/migracion/post-carga.sql (backfills + verificaciones).
#
# Uso:
#   export PGPASSWORD='...'
#   ./scripts/migracion/recargar-datos.sh <backup> <db_url>              # ENSAYO: carga todo y ROLLBACK; deja reporte
#   ./scripts/migracion/recargar-datos.sh <backup> <db_url> --ejecutar   # carga real (pide CONFIRMO) y COMMIT
# Banderas opcionales (solo si el dueño lo decide; ver docs/migracion-corte.md):
#   --recalcular-pedidos          aplica B1 de post-carga (estado/saldo de pedidos por lo entregado, D-034)
#   --corregir-canceladas-devol   aplica B2 de post-carga (inventario de ventas canceladas con devoluciones)
set -euo pipefail

BK="${1:?falta ruta del backup}"
DB="${2:?falta db_url (Session pooler, sin password)}"
shift 2
MODO="ensayo"
RECALC_PEDIDOS="no"
CORREGIR_CANC="no"
for a in "$@"; do
  case "$a" in
    --ejecutar) MODO="ejecutar" ;;
    --recalcular-pedidos) RECALC_PEDIDOS="si" ;;
    --corregir-canceladas-devol) CORREGIR_CANC="si" ;;
    *) echo "!! opción desconocida: $a"; exit 1 ;;
  esac
done

DIR="$(cd "$(dirname "$0")" && pwd)"
POST="$DIR/post-carga.sql"
[ -f "$POST" ] || { echo "!! falta $POST"; exit 1; }
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
REPORTE="$PWD/corte-reporte-$(date +%Y%m%d-%H%M%S)-$MODO.txt"

echo "== Leyendo backup"
pg_restore -l "$BK" > "$W/toc.txt"
pg_restore -s -n public -n auth -f "$W/esquema.sql" "$BK"

# Tablas que el sistema ya no tiene (borradas a propósito): sus datos del backup se omiten.
#   payment_links: Openpay, D-053.
printf '%s\n' payment_links > "$W/retiradas.txt"

# 1) Tablas: el backup debe ser subconjunto del destino.
awk '$4=="TABLE" && $5=="public" {print $6}' "$W/toc.txt" | sort -u | grep -vxF -f "$W/retiradas.txt" > "$W/tablas_backup.txt"
psql -d "$DB" -Atc "select tablename from pg_tables where schemaname='public'" | sort -u > "$W/tablas_destino.txt"
comm -23 "$W/tablas_backup.txt" "$W/tablas_destino.txt" > "$W/tablas_solo_backup.txt"
if [ -s "$W/tablas_solo_backup.txt" ]; then
  echo "!! Tablas del backup que el destino NO tiene (llevar ese esquema al destino primero):"
  cat "$W/tablas_solo_backup.txt"
  echo "!! No se cargó nada."
  exit 1
fi
echo "   tablas public: $(wc -l < "$W/tablas_backup.txt" | tr -d ' ') del backup; nuevas solo en destino (quedan vacías):"
comm -13 "$W/tablas_backup.txt" "$W/tablas_destino.txt" | sed 's/^/     + /'

# 2) Columnas (public + auth.users/identities): backup subconjunto del destino.
#    cols_backup: esquema.tabla.columna<TAB>t|f (NOT NULL en el backup)
awk '
  /^CREATE TABLE (public|auth)\./ { split($3, p, "."); s = p[1]; t = p[2]; gsub(/"/, "", t); next }
  t && /^\);/ { t = ""; next }
  t && /^    [a-z_"]/ { c = $1; gsub(/"/, "", c); if (c != "CONSTRAINT") print s "." t "." c "\t" (index($0, " NOT NULL") ? "t" : "f") }
' "$W/esquema.sql" | grep -E '^(public\.|auth\.(users|identities)\.)' \
  | awk -F'\t' 'NR==FNR {r["public." $0]=1; next} { split($1, p, "."); if (!((p[1] "." p[2]) in r)) print }' "$W/retiradas.txt" - \
  | sort -u > "$W/cols_backup.txt"
cut -f1 "$W/cols_backup.txt" | sort -u > "$W/cols_backup_k.txt"
psql -d "$DB" -Atc "select table_schema||'.'||table_name||'.'||column_name from information_schema.columns
  where (table_schema='public' and table_name in (select tablename from pg_tables where schemaname='public'))
     or (table_schema='auth' and table_name in ('users','identities'))" | sort -u > "$W/cols_destino.txt"
comm -23 "$W/cols_backup_k.txt" "$W/cols_destino.txt" > "$W/cols_solo_backup.txt"
if [ -s "$W/cols_solo_backup.txt" ]; then
  echo "!! Columnas del backup que el destino NO tiene:"
  head -50 "$W/cols_solo_backup.txt"
  echo "!! No se cargó nada."
  exit 1
fi
echo "   columnas: $(wc -l < "$W/cols_backup_k.txt" | tr -d ' ') del backup, todas en destino; $(comm -13 "$W/cols_backup_k.txt" "$W/cols_destino.txt" | wc -l | tr -d ' ') nuevas en destino"

# 3) Columnas nuevas del destino en tablas del backup: NOT NULL sin default haría fallar el COPY.
sed 's/^/public./' "$W/tablas_backup.txt" > "$W/tablas_backup_q.txt"
printf 'auth.users\nauth.identities\n' >> "$W/tablas_backup_q.txt"
psql -d "$DB" -Atc "select table_schema||'.'||table_name||'.'||column_name from information_schema.columns
  where table_schema in ('public','auth') and is_nullable='NO' and column_default is null
    and is_identity='NO' and is_generated='NEVER'" | sort -u > "$W/cols_nn_destino.txt"
comm -23 "$W/cols_nn_destino.txt" "$W/cols_backup_k.txt" \
  | awk -F. 'NR==FNR {tb[$0]=1; next} (($1"."$2) in tb)' "$W/tablas_backup_q.txt" - > "$W/cols_nn_nuevas.txt"
if [ -s "$W/cols_nn_nuevas.txt" ]; then
  echo "!! Columnas nuevas NOT NULL sin default (el COPY no puede llenarlas):"
  cat "$W/cols_nn_nuevas.txt"
  echo "!! Agrega un default en una migración y vuelve a correr. No se cargó nada."
  exit 1
fi

# 4) Constraints e índices únicos que SÍ trae el backup (tabla.nombre). Lo que el destino
#    tenga además es «nuevo» y se trata como se explica arriba.
awk '
  function limpia(x) { gsub(/"/, "", x); sub(/^public\./, "", x); return x }
  /^CREATE TABLE public\./ { t = limpia($3); next }
  t && /^\);/ { t = ""; next }
  t && /^    CONSTRAINT / { print t "." limpia($2); next }
  /^ALTER TABLE (ONLY )?public\./ { a = ($3 == "ONLY") ? $4 : $3; a = limpia(a); next }
  a && /^    ADD CONSTRAINT / { print a "." limpia($3); a = ""; next }
  /^CREATE (UNIQUE )?INDEX / {
    i = ($2 == "UNIQUE") ? $4 : $3
    for (k = 1; k <= NF; k++) if ($k == "ON") { tb = ($(k+1) == "ONLY") ? $(k+2) : $(k+1); break }
    print limpia(tb) "." limpia(i)
  }
' "$W/esquema.sql" | sort -u > "$W/objs_backup.txt"
echo "   constraints/índices del backup: $(wc -l < "$W/objs_backup.txt" | tr -d ' ')"
grep '^public\.' "$W/cols_backup.txt" | sed 's/^public\.//' > "$W/cols_backup_public.txt"

# 5) Lista de datos a cargar.
grep -E '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public |^[0-9]+; [0-9]+ [0-9]+ TABLE DATA auth (users|identities) |^[0-9]+; [0-9]+ [0-9]+ SEQUENCE SET public ' \
  "$W/toc.txt" | awk 'NR==FNR {r[$0]=1; next} !($6=="public" && ($7 in r))' "$W/retiradas.txt" - > "$W/datos.list"
echo "   entradas de datos: $(wc -l < "$W/datos.list" | tr -d ' ')"

# 6) El rol debe poder apagar triggers con SET (en Supabase, set_config() no basta).
psql -d "$DB" -v ON_ERROR_STOP=1 -qc "set session_replication_role = replica" >/dev/null

if [ "$MODO" = "ejecutar" ]; then
  echo "!! Esto BORRA todos los datos de public y auth.users (con sus identidades y sesiones) del"
  echo "!! destino y los reemplaza con los del backup; corre post-carga.sql; y los constraints nuevos"
  echo "!! que los datos viejos violen quedan NOT VALID o sin crear (ver el reporte del ensayo)."
  echo "!! Funciones, políticas, storage y crons no se tocan."
  printf "Escribe exactamente: CONFIRMO recargar datos\n> "
  read -r R
  [ "$R" = "CONFIRMO recargar datos" ] || { echo "Cancelado."; exit 1; }
  FIN="COMMIT;"
else
  echo "== ENSAYO: se carga todo dentro de una transacción y al final se hace ROLLBACK (no cambia nada)."
  echo "   Mientras corre, las tablas del destino quedan bloqueadas."
  FIN="ROLLBACK;"
fi

TABLAS=$(sed 's/.*/public."&"/' "$W/tablas_destino.txt" | paste -sd, -)
{
  echo "BEGIN;"
  echo "SET LOCAL corte.recalcular_pedidos = '$RECALC_PEDIDOS';"
  echo "SET LOCAL corte.corregir_canceladas_devol = '$CORREGIR_CANC';"
  cat <<'SQL'
CREATE TEMP TABLE _corte_reporte (orden serial, seccion text, item text, valor text) ON COMMIT DROP;
CREATE TEMP TABLE _corte_bk_tablas (tabla text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE _corte_bk_obj (clave text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE _corte_bk_cols (clave text PRIMARY KEY, no_nulo boolean NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE _corte_relajados (tabla text, nombre text, tipo text, def text, resultado text, detalle text,
                                    PRIMARY KEY (tabla, nombre)) ON COMMIT DROP;
SQL
  echo "COPY _corte_bk_tablas FROM stdin;"; cat "$W/tablas_backup.txt"; echo '\.'
  echo "COPY _corte_bk_obj FROM stdin;"; cat "$W/objs_backup.txt"; echo '\.'
  echo "COPY _corte_bk_cols FROM stdin;"; cat "$W/cols_backup_public.txt"; echo '\.'
  cat <<'SQL'
-- Relajar lo nuevo: constraints (FK primero), índices únicos sueltos y NOT NULL que el backup no tenía.
DO $relajar$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT cl.relname AS tabla, c.conname AS nombre, c.contype::text AS tipo, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid
     WHERE cl.relnamespace = 'public'::regnamespace AND c.contype IN ('c', 'f', 'u', 'p', 'x')
       AND cl.relname IN (SELECT tabla FROM _corte_bk_tablas)
       AND cl.relname || '.' || c.conname NOT IN (SELECT clave FROM _corte_bk_obj)
     ORDER BY (c.contype = 'f') DESC, cl.relname, c.conname
  LOOP
    INSERT INTO _corte_relajados (tabla, nombre, tipo, def) VALUES (r.tabla, r.nombre, r.tipo, r.def);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tabla, r.nombre);
  END LOOP;

  FOR r IN
    SELECT cl.relname AS tabla, ic.relname AS nombre, pg_get_indexdef(i.indexrelid) AS def
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_class cl ON cl.oid = i.indrelid
     WHERE cl.relnamespace = 'public'::regnamespace AND i.indisunique
       AND NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conindid = i.indexrelid AND x.contype IN ('u', 'p', 'x'))
       AND cl.relname IN (SELECT tabla FROM _corte_bk_tablas)
       AND cl.relname || '.' || ic.relname NOT IN (SELECT clave FROM _corte_bk_obj)
  LOOP
    INSERT INTO _corte_relajados (tabla, nombre, tipo, def) VALUES (r.tabla, r.nombre, 'i', r.def);
    EXECUTE format('DROP INDEX public.%I', r.nombre);
  END LOOP;

  FOR r IN
    SELECT cl.relname AS tabla, a.attname AS nombre
      FROM pg_attribute a
      JOIN pg_class cl ON cl.oid = a.attrelid
      JOIN _corte_bk_cols b ON b.clave = cl.relname || '.' || a.attname
     WHERE cl.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attnotnull AND NOT b.no_nulo
  LOOP
    INSERT INTO _corte_relajados (tabla, nombre, tipo, def) VALUES (r.tabla, r.nombre, 'n', 'NOT NULL');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.tabla, r.nombre);
  END LOOP;
END
$relajar$;
SQL
  echo "TRUNCATE TABLE $TABLAS;"
  # Con triggers encendidos: la cascada limpia identities, sesiones, factores MFA, etc.
  echo "DELETE FROM auth.users;"
  echo "SET LOCAL session_replication_role = replica;"
  # Si pg_restore falla, se manda un error para que psql aborte (nunca llega al COMMIT).
  pg_restore -a -L "$W/datos.list" -f - "$BK" || { echo "SELECT 1/0; -- pg_restore falló"; exit 1; }
  # pg_restore deja search_path vacío y client_min_messages=warning.
  echo "SET search_path TO public, extensions;"
  echo "SET client_min_messages TO notice;"
  cat "$POST"
  echo "SET LOCAL session_replication_role = origin;"
  cat <<'SQL'
-- Reponer lo relajado. Si los datos viejos lo violan: CHECK/FK → NOT VALID; UNIQUE/índice → sin crear.
DO $reponer$
DECLARE
  r record;
  v_err text;
  v_n bigint;
BEGIN
  FOR r IN
    SELECT * FROM _corte_relajados
     ORDER BY CASE tipo WHEN 'n' THEN 0 WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'x' THEN 2
                        WHEN 'i' THEN 3 WHEN 'c' THEN 4 ELSE 5 END, tabla, nombre
  LOOP
    BEGIN
      IF r.tipo = 'n' THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', r.tabla, r.nombre);
      ELSIF r.tipo = 'i' THEN
        EXECUTE r.def;
      ELSE
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', r.tabla, r.nombre, r.def);
      END IF;
      UPDATE _corte_relajados
         SET resultado = CASE WHEN r.def LIKE '% NOT VALID' THEN 'repuesto (ya era NOT VALID)' ELSE 'repuesto y validado' END
       WHERE tabla = r.tabla AND nombre = r.nombre;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_n := NULL;
      IF r.tipo IN ('c', 'f') THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s NOT VALID', r.tabla, r.nombre, r.def);
        IF r.tipo = 'c' THEN
          EXECUTE format('SELECT count(*) FROM public.%I WHERE NOT (%s)', r.tabla,
                         substring(r.def FROM '^CHECK \((.*)\)$')) INTO v_n;
        END IF;
        UPDATE _corte_relajados
           SET resultado = 'NOT VALID (PENDIENTE DUEÑO)',
               detalle = COALESCE(v_n || ' filas lo violan; ', '') || v_err
         WHERE tabla = r.tabla AND nombre = r.nombre;
      ELSE
        UPDATE _corte_relajados
           SET resultado = 'SIN CREAR (PENDIENTE DUEÑO)', detalle = v_err
         WHERE tabla = r.tabla AND nombre = r.nombre;
      END IF;
    END;
  END LOOP;

  INSERT INTO _corte_reporte (seccion, item, valor)
  SELECT 'D constraints nuevos', tabla || '.' || nombre || ' [' || tipo || ']',
         resultado || COALESCE(' — ' || detalle, '')
    FROM _corte_relajados ORDER BY resultado NOT LIKE 'repuesto%' DESC, tabla, nombre;
END
$reponer$;

INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'E totales', x.k, x.v FROM (VALUES
  ('usuarios', (SELECT count(*)::text FROM auth.users)),
  ('empresas', (SELECT count(*)::text FROM public.empresas)),
  ('ventas',   (SELECT count(*)::text FROM public.ventas)),
  ('última venta', (SELECT max(created_at)::text FROM public.ventas))) x(k, v);

SELECT 'REPORTE|' || seccion || '|' || item || '|' || COALESCE(valor, '') FROM _corte_reporte ORDER BY orden;
SQL
  echo "$FIN"
} | psql -d "$DB" -v ON_ERROR_STOP=1 -q -At > "$W/carga.log" 2>&1 \
  || { echo "!! Falló; se revirtió todo. Últimas líneas:"; grep -v '^REPORTE|' "$W/carga.log" | tail -20; exit 1; }

{
  echo "# Reporte de recarga ($MODO) $(date '+%Y-%m-%d %H:%M:%S')"
  echo "# backup: $BK"
  echo "# banderas: recalcular_pedidos=$RECALC_PEDIDOS corregir_canceladas_devol=$CORREGIR_CANC"
  grep '^REPORTE|' "$W/carga.log" | cut -d'|' -f2- | awk -F'|' '$1!=s {print ""; print "## " $1; s=$1} {print "- " $2 ": " $3}'
  echo
  echo "## Avisos de la BD"
  grep -E 'NOTICE|WARNING' "$W/carga.log" | sort | uniq -c | head -30 || true
} > "$REPORTE"
cat "$REPORTE"

if [ "$MODO" = "ejecutar" ]; then
  psql -d "$DB" -qc "analyze;"
  echo "== Recarga terminada (COMMIT). Reporte: $REPORTE"
else
  echo "== Ensayo terminado (ROLLBACK, no cambió nada). Reporte: $REPORTE"
  echo "   Para recargar de verdad: agrega --ejecutar"
fi
