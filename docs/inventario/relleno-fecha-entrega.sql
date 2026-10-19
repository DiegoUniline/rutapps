-- =====================================================================
-- RutApp · Relleno de fecha real en entregas hechas sin fecha_entrega (D-003)
-- Correr DESPUÉS de supabase/migrations/20261019210000_huecos_produccion.sql.
-- Fuente de la fecha: validado_at y, si no hay, updated_at (aproximada).
-- Los triggers de entregas se apagan SOLO dentro de esta transacción
-- (session_replication_role = replica) para no reaplicar inventario,
-- generar historial ni notificaciones por estas filas viejas.
-- Todo o nada. Si da error de permisos, no se aplica nada.
-- =====================================================================
BEGIN;
SET LOCAL session_replication_role = replica;

UPDATE public.entregas
SET fecha_entrega = COALESCE(validado_at, updated_at)
WHERE status = 'hecho'::public.status_entrega
  AND fecha_entrega IS NULL
  AND COALESCE(validado_at, updated_at) IS NOT NULL;

COMMIT;
