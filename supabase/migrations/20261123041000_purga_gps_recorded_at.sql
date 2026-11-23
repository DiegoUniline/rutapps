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
-- OJO al aplicar: la primera corrida borrará todo lo anterior a 30 días (2026-11-23:
-- 219,862 de 269,437 filas, desde 2026-04-17). Es la política vigente, pero nunca se había
-- ejecutado. Si se quiere conservar ese histórico, respaldarlo ANTES de aplicar.
--
-- Revertir: volver a la definición anterior (borraba por created_at y fallaba):
--   CREATE OR REPLACE FUNCTION public.purge_old_gps_history() RETURNS void
--   LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   BEGIN DELETE FROM public.vendedor_ubicaciones_historial
--         WHERE created_at < now() - interval '30 days'; END; $$;
-- Verificación: docs/sql/2026-11-23_verificar_fase3.sql (bloque DO que se deshace solo).

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
