-- Crons del Supabase propio (amybkerwkybffllaxpnz), copiados de cron.job del origen
-- (backup 2026-11-16, 13 jobs) cambiando solo la URL y la anon key al proyecto nuevo.
-- Se crean APAGADOS. Se encienden el día del corte con la última sentencia.
-- Requiere en Vault: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BILLING_BRIDGE_INTERNAL_SECRET.
-- Idempotente: si el job ya existe, cron.schedule lo actualiza por nombre.
-- D-057 + escalonado (2026-11-23): cobros a las 9 CDMX en orden: daily-billing 15:00, billing-cycle 15:05, create-invoice-reminder 15:10 UTC.
begin;

select cron.schedule('subscription-cleanup-daily', '0 6 * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/subscription-cleanup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := '{}'::jsonb) as request_id;
$$);

select cron.schedule('create-invoice-reminder-daily', '10 15 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1) || '/functions/v1/create-invoice-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)),
    body := '{}'::jsonb);
$$);

select cron.schedule('billing-notify-daily', '0 14 * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/billing-notify',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := '{}'::jsonb) as request_id;
$$);

select cron.schedule('billing-cycle-daily', '5 15 * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/billing-cycle',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb) as request_id;
$$);

select cron.schedule('daily-billing-cron', '0 15 * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/daily-billing',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc'),
    body := jsonb_build_object('triggered_at', now()::text));
$$);

select cron.schedule('purge-gps-history-daily', '0 3 * * *', $$select public.purge_old_gps_history();$$);

select cron.schedule('wa-scheduler-reporte-diario', '0 * * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/wa-scheduler-reporte-diario',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := '{"source":"cron"}'::jsonb);
$$);

select cron.schedule('wa-scheduler-cobranza-diaria', '0 * * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/wa-scheduler-cobranza-diaria',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := '{"source":"cron"}'::jsonb);
$$);

select cron.schedule('wa-scheduler-alertas-semanal', '0 * * * 1', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/wa-scheduler-alertas-semanal',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := '{"source":"cron"}'::jsonb);
$$);

select cron.schedule('facturama-reconcile-30m', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/facturama-reconcile',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := jsonb_build_object('source', 'pg_cron', 'at', now())) as request_id;
$$);

select cron.schedule('notify-alerts-scan-daily', '0 14 * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/notify-alerts-scan',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWJrZXJ3a3liZmZsbGF4cG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk4MDEsImV4cCI6MjExMDQxNTgwMX0.7V3Y2fGbbRUUq9Qgix90dDsTgsXBz8o6v-iLBPqcOZc"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb);
$$);

select cron.schedule('billing-align-bridge-aug2026-daily', '5 6 * * *', $$
  select net.http_post(
    url := 'https://amybkerwkybffllaxpnz.supabase.co/functions/v1/billing-align-bridge-aug2026',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'BILLING_BRIDGE_INTERNAL_SECRET' limit 1)),
    body := '{"mode":"execute"}'::jsonb);
$$);

select cron.schedule('limpiar-historial-cron', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- Apagados hasta el corte (misma transacción: nunca quedan activos).
select cron.alter_job(jobid, active := false) from cron.job;

commit;

select jobname, schedule, active from cron.job order by jobname;

-- DÍA DEL CORTE (correr aparte):
-- select cron.alter_job(jobid, active := true) from cron.job;
