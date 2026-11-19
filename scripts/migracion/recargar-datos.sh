#!/usr/bin/env bash
# Recarga TODOS los datos (public + auth.users/identities) desde un backup custom
# de Lovable (pg_dump -Fc) hacia el Supabase propio, sin tocar esquema, funciones,
# políticas ni crons. Todo en UNA transacción: si algo falla, no cambia nada.
#
# Uso:
#   export PGPASSWORD='...'
#   ./scripts/migracion/recargar-datos.sh <backup> <db_url>            # solo revisa
#   ./scripts/migracion/recargar-datos.sh <backup> <db_url> --ejecutar # recarga
set -euo pipefail

BK="${1:?falta ruta del backup}"
DB="${2:?falta db_url (Session pooler, sin password)}"
MODO="${3:-}"
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT

echo "== Leyendo backup"
pg_restore -l "$BK" > "$W/toc.txt"

# 1) El esquema del backup debe ser el mismo que el del destino (mismas tablas).
awk '$4=="TABLE" && $5=="public" {print $6}' "$W/toc.txt" | sort -u > "$W/tablas_backup.txt"
psql -d "$DB" -Atc "select tablename from pg_tables where schemaname='public' order by 1" | sort -u > "$W/tablas_destino.txt"
if ! diff -q "$W/tablas_backup.txt" "$W/tablas_destino.txt" >/dev/null; then
  echo "!! Las tablas no coinciden (< solo en backup, > solo en destino):"
  diff "$W/tablas_backup.txt" "$W/tablas_destino.txt" || true
  echo "!! Primero hay que llevar esos cambios de esquema al destino. No se cargó nada."
  exit 1
fi
echo "   tablas public: $(wc -l < "$W/tablas_backup.txt" | tr -d ' ') iguales en backup y destino"

# 2) Columnas: compara columna por columna (nombre) contra el destino.
pg_restore -s -n public -f - "$BK" 2>/dev/null \
  | awk '/^CREATE TABLE public\./{t=$3; sub("public\\.","",t); next} t && /^\);/{t=""} t && /^    [a-z_"]/{c=$1; gsub(/"/,"",c); if (c!="CONSTRAINT") print t"."c}' \
  | sort -u > "$W/cols_backup.txt"
psql -d "$DB" -Atc "select table_name||'.'||column_name from information_schema.columns where table_schema='public' and table_name in (select tablename from pg_tables where schemaname='public')" \
  | sort -u > "$W/cols_destino.txt"
if ! diff -q "$W/cols_backup.txt" "$W/cols_destino.txt" >/dev/null; then
  echo "!! Las columnas no coinciden (< solo en backup, > solo en destino):"
  diff "$W/cols_backup.txt" "$W/cols_destino.txt" | head -50 || true
  echo "!! No se cargó nada."
  exit 1
fi
echo "   columnas public: $(wc -l < "$W/cols_backup.txt" | tr -d ' ') iguales"

# 3) Lista de datos a cargar.
grep -E '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public |^[0-9]+; [0-9]+ [0-9]+ TABLE DATA auth (users|identities) |^[0-9]+; [0-9]+ [0-9]+ SEQUENCE SET public ' \
  "$W/toc.txt" > "$W/datos.list"
echo "   entradas de datos: $(wc -l < "$W/datos.list" | tr -d ' ')"

# 4) El rol debe poder desactivar triggers/FK durante la carga.
psql -d "$DB" -v ON_ERROR_STOP=1 -qc "set session_replication_role = replica" >/dev/null

if [ "$MODO" != "--ejecutar" ]; then
  echo "== Revisión OK. Para recargar: agrega --ejecutar"
  exit 0
fi

echo "!! Esto BORRA todos los datos de public, auth.users y auth.identities del destino y los"
echo "!! reemplaza con los del backup. Esquema, funciones, políticas, storage y crons no se tocan."
printf "Escribe exactamente: CONFIRMO recargar datos\n> "
read -r R
[ "$R" = "CONFIRMO recargar datos" ] || { echo "Cancelado."; exit 1; }

TABLAS=$(sed 's/.*/public."&"/' "$W/tablas_destino.txt" | paste -sd, -)
{
  echo "set session_replication_role = replica;"
  echo "truncate table $TABLAS;"
  echo "delete from auth.identities;"
  echo "delete from auth.users;"
  pg_restore -a -L "$W/datos.list" -f - "$BK"
  echo "set session_replication_role = origin;"
} | psql -d "$DB" --single-transaction -v ON_ERROR_STOP=1 -q > "$W/carga.log" 2>&1 \
  || { echo "!! Falló; se revirtió todo. Últimas líneas:"; tail -20 "$W/carga.log"; exit 1; }

psql -d "$DB" -qc "analyze;"
echo "== Recarga terminada"
psql -d "$DB" -c "select (select count(*) from auth.users) usuarios, (select count(*) from public.empresas) empresas, (select count(*) from public.ventas) ventas, (select max(created_at) from public.ventas) ultima_venta;"
