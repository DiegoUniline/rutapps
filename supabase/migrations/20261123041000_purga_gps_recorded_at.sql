-- Fase 3 «Inventario y cobros» · purga del historial GPS
--
-- Problema: el cron `purge-gps-history-daily` (03:00 UTC) llama a
-- public.purge_old_gps_history(), que borra por `created_at`, columna que NO existe en
-- vendedor_ubicaciones_historial (columnas reales: id, user_id, empresa_id, lat, lng,
-- accuracy, battery_level, recorded_at). El cron falla cada día y la tabla no se purga.
--
-- Cambio: misma política de retención (30 días), usando la columna real `recorded_at`
-- (timestamptz NOT NULL default now()). Firma, SECURITY DEFINER, search_path y permisos
-- sin cambio (CREATE OR REPLACE conserva los GRANT de 20261123020000_seguridad_fase1.sql:
-- solo service_role).
--
-- Respaldo (decisión del dueño 2026-11-23: «respaldar y purgar»): antes de habilitar la
-- purga se copia a public.vendedor_ubicaciones_historial_archivo todo lo anterior a 29 días
-- (2026-11-23: ~219,862 filas desde 2026-04-17). Margen de 1 día para que nada que la
-- primera corrida de las 03:00 UTC vaya a borrar quede sin copia. Solo service_role.
--
-- Revertir: volver a la definición anterior (borraba por created_at y fallaba):
--   CREATE OR REPLACE FUNCTION public.purge_old_gps_history() RETURNS void
--   LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   BEGIN DELETE FROM public.vendedor_ubicaciones_historial
--         WHERE created_at < now() - interval '30 days'; END; $$;
-- Verificación: docs/sql/2026-11-23_verificar_fase3.sql (bloque DO que se deshace solo).

CREATE TABLE IF NOT EXISTS public.vendedor_ubicaciones_historial_archivo (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  battery_level integer,
  recorded_at timestamptz NOT NULL,
  archivado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vuh_archivo_empresa_recorded
  ON public.vendedor_ubicaciones_historial_archivo (empresa_id, recorded_at DESC);
ALTER TABLE public.vendedor_ubicaciones_historial_archivo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vendedor_ubicaciones_historial_archivo FROM anon, authenticated;
GRANT ALL ON TABLE public.vendedor_ubicaciones_historial_archivo TO service_role;

INSERT INTO public.vendedor_ubicaciones_historial_archivo
  (id, user_id, empresa_id, lat, lng, accuracy, battery_level, recorded_at)
SELECT id, user_id, empresa_id, lat, lng, accuracy, battery_level, recorded_at
FROM public.vendedor_ubicaciones_historial
WHERE recorded_at < now() - interval '29 days'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.purge_old_gps_history()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.vendedor_ubicaciones_historial
  WHERE recorded_at < now() - interval '30 days';
END;
$function$;
