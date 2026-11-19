#!/usr/bin/env bash
# Secrets que leen los crons desde Vault en el Supabase propio.
# BILLING_BRIDGE_INTERNAL_SECRET se regenera y se pone igual en Vault y en Edge Functions.
# Uso: SERVICE_ROLE_KEY='<service_role del proyecto nuevo>' ./scripts/migracion/vault.sh "$db"
set -euo pipefail
DB="${1:?falta db_url}"
: "${SERVICE_ROLE_KEY:?falta SERVICE_ROLE_KEY (Settings > API Keys > service_role)}"
REF=amybkerwkybffllaxpnz
BRIDGE="$(openssl rand -hex 32)"
supabase secrets set --project-ref "$REF" BILLING_BRIDGE_INTERNAL_SECRET="$BRIDGE" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q \
  -v url="https://$REF.supabase.co" -v srk="$SERVICE_ROLE_KEY" -v bridge="$BRIDGE" <<'SQL'
create or replace function pg_temp.upsert_secret(n text, v text) returns void language plpgsql as $f$
begin
  if exists (select 1 from vault.secrets where name = n) then
    perform vault.update_secret((select id from vault.secrets where name = n), v);
  else
    perform vault.create_secret(v, n);
  end if;
end $f$;
select pg_temp.upsert_secret('SUPABASE_URL', :'url');
select pg_temp.upsert_secret('SUPABASE_SERVICE_ROLE_KEY', :'srk');
select pg_temp.upsert_secret('BILLING_BRIDGE_INTERNAL_SECRET', :'bridge');
SQL
psql -d "$DB" -Atc "select name from vault.secrets order by 1"
