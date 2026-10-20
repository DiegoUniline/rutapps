-- Índice por documento: las reglas de entregas, devoluciones y el bloqueo de borrado
-- buscan movimientos por referencia_id. El índice existente empieza por referencia_tipo.
-- En producción el dueño lo corre como CREATE INDEX CONCURRENTLY (sin bloquear ventas).
CREATE INDEX IF NOT EXISTS idx_movimientos_referencia_id
  ON public.movimientos_inventario (referencia_id);
