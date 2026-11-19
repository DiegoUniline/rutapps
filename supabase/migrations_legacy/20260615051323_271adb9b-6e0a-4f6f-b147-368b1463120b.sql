
-- Composite indexes to match common WHERE+ORDER BY patterns from slow queries
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_status_orden
  ON public.clientes (empresa_id, status, orden);

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_status_codigo
  ON public.clientes (empresa_id, status, codigo);

CREATE INDEX IF NOT EXISTS idx_productos_empresa_status_nombre
  ON public.productos (empresa_id, status, nombre);

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_fecha_status
  ON public.ventas (empresa_id, fecha, status);

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_saldoinicial_created
  ON public.ventas (empresa_id, es_saldo_inicial, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entrega_lineas_entrega_id
  ON public.entrega_lineas (entrega_id);

CREATE INDEX IF NOT EXISTS idx_venta_lineas_producto_id
  ON public.venta_lineas (producto_id);

-- Update planner stats so new indexes are picked up promptly
ANALYZE public.clientes;
ANALYZE public.productos;
ANALYZE public.ventas;
ANALYZE public.venta_lineas;
ANALYZE public.entrega_lineas;
