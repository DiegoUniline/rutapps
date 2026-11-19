
-- 1. Columnas de preferencias en wa_bot_authorized_numbers
ALTER TABLE public.wa_bot_authorized_numbers
  ADD COLUMN IF NOT EXISTS pref_reporte_diario boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pref_alertas_semanal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pref_cobranza_diaria boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pref_hora_reporte_diario smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS last_sent_reporte_diario date,
  ADD COLUMN IF NOT EXISTS last_sent_alertas_semanal date,
  ADD COLUMN IF NOT EXISTS last_sent_cobranza_diaria date,
  ADD COLUMN IF NOT EXISTS auto_intro_sent_at timestamptz;

-- Asegurar rango válido de hora
ALTER TABLE public.wa_bot_authorized_numbers
  DROP CONSTRAINT IF EXISTS wa_bot_pref_hora_check;
ALTER TABLE public.wa_bot_authorized_numbers
  ADD CONSTRAINT wa_bot_pref_hora_check
  CHECK (pref_hora_reporte_diario BETWEEN 9 AND 20);

-- 2. Cron jobs (cada 30 min). La lógica de "es la hora correcta + no enviado hoy"
--    vive dentro de la edge function.
DO $$
DECLARE
  base_url text := 'https://pkdwemunxxpafpmiqxiq.supabase.co/functions/v1';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrZHdlbXVueHhwYWZwbWlxeGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjAzMzIsImV4cCI6MjA4ODk5NjMzMn0.c_0ZEU5tbfL3eOv4FIOa0Gj3ASfNIYPjnTMWKWNdvtM';
BEGIN
  -- Reporte diario
  PERFORM cron.unschedule('wa-scheduler-reporte-diario');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  base_url text := 'https://pkdwemunxxpafpmiqxiq.supabase.co/functions/v1';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrZHdlbXVueHhwYWZwbWlxeGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjAzMzIsImV4cCI6MjA4ODk5NjMzMn0.c_0ZEU5tbfL3eOv4FIOa0Gj3ASfNIYPjnTMWKWNdvtM';
BEGIN
  PERFORM cron.unschedule('wa-scheduler-cobranza-diaria');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('wa-scheduler-alertas-semanal');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'wa-scheduler-reporte-diario',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pkdwemunxxpafpmiqxiq.supabase.co/functions/v1/wa-scheduler-reporte-diario',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrZHdlbXVueHhwYWZwbWlxeGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjAzMzIsImV4cCI6MjA4ODk5NjMzMn0.c_0ZEU5tbfL3eOv4FIOa0Gj3ASfNIYPjnTMWKWNdvtM"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'wa-scheduler-cobranza-diaria',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pkdwemunxxpafpmiqxiq.supabase.co/functions/v1/wa-scheduler-cobranza-diaria',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrZHdlbXVueHhwYWZwbWlxeGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjAzMzIsImV4cCI6MjA4ODk5NjMzMn0.c_0ZEU5tbfL3eOv4FIOa0Gj3ASfNIYPjnTMWKWNdvtM"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'wa-scheduler-alertas-semanal',
  '*/30 * * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://pkdwemunxxpafpmiqxiq.supabase.co/functions/v1/wa-scheduler-alertas-semanal',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrZHdlbXVueHhwYWZwbWlxeGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjAzMzIsImV4cCI6MjA4ODk5NjMzMn0.c_0ZEU5tbfL3eOv4FIOa0Gj3ASfNIYPjnTMWKWNdvtM"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $cron$
);
