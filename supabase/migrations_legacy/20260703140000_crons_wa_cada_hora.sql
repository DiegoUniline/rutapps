-- COSTO: bajar frecuencia de los schedulers de WhatsApp de cada 30 min a cada
-- hora. Los reportes/alertas se disparan a HORAS configurables (no a la media
-- hora), y cada función ya verifica internamente "¿es la hora correcta y no se
-- ha enviado hoy?", así que correr cada hora entrega lo mismo con la MITAD de
-- invocaciones del edge function. (El guard de "ya enviado hoy" evita cualquier
-- duplicado.)
--
-- Idempotente: reagenda con el mismo nombre (pg_cron reemplaza el job).

-- Reporte diario: cada hora en el minuto 0.
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

-- Cobranza diaria: cada hora en el minuto 0.
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

-- Alertas semanal (lunes): cada hora en el minuto 0 del lunes.
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
