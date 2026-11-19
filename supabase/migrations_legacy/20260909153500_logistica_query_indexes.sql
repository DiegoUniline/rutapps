-- Índices de lectura para Logística > Pedidos / Entregas / Concentrado a surtir.
-- No cambian cálculos, triggers, estados ni reglas de negocio; únicamente reducen
-- el trabajo de PostgreSQL para los filtros y joins ya usados por la aplicación.

CREATE INDEX IF NOT EXISTS idx_ventas_logistica_fecha
  ON public.ventas (empresa_id, fecha, status, tipo, vendedor_id);

CREATE INDEX IF NOT EXISTS idx_ventas_logistica_fecha_entrega
  ON public.ventas (empresa_id, fecha_entrega, status, tipo, vendedor_id);

CREATE INDEX IF NOT EXISTS idx_venta_lineas_logistica_venta_producto
  ON public.venta_lineas (venta_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_empresa_created
  ON public.entregas (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_empresa_status_created
  ON public.entregas (empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_empresa_vendedor_created
  ON public.entregas (empresa_id, vendedor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_pedido_status
  ON public.entregas (pedido_id, status);

CREATE INDEX IF NOT EXISTS idx_entrega_lineas_logistica_entrega_producto
  ON public.entrega_lineas (entrega_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_stock_almacen_logistica_empresa_almacen_producto
  ON public.stock_almacen (empresa_id, almacen_id, producto_id);
