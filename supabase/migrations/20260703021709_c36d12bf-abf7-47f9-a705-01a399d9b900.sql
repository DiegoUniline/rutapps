SELECT cron.schedule(
  'wa-scheduler-reporte-diario',
  '0 * * * *',
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
  '0 * * * *',
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
  '0 * * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://pkdwemunxxpafpmiqxiq.supabase.co/functions/v1/wa-scheduler-alertas-semanal',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrZHdlbXVueHhwYWZwbWlxeGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjAzMzIsImV4cCI6MjA4ODk5NjMzMn0.c_0ZEU5tbfL3eOv4FIOa0Gj3ASfNIYPjnTMWKWNdvtM"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $cron$
);