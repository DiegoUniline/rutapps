
-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to purge old GPS history (>30 days)
CREATE OR REPLACE FUNCTION public.purge_old_gps_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.vendedor_ubicaciones_historial
  WHERE created_at < now() - interval '30 days';
END;
$$;

-- Unschedule previous job if exists
DO $$
BEGIN
  PERFORM cron.unschedule('purge-gps-history-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule daily at 3am UTC (9pm CDMX)
SELECT cron.schedule(
  'purge-gps-history-daily',
  '0 3 * * *',
  $$SELECT public.purge_old_gps_history();$$
);
