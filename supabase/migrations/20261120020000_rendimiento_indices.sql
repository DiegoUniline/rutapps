-- Rendimiento Ventas / Pedidos / Entregas / Devoluciones / Cobros.
-- Solo agrega índices (no cambia datos ni comportamiento).
--  · devoluciones y devolucion_lineas no tenían ningún índice (cada consulta recorría la tabla).
--  · Llaves foráneas usadas en filtros/joins sin índice (cliente, vendedor, repartidor, venta).
--  · Búsqueda "contiene" (ILIKE '%texto%') en folio y nombres: índices de trigramas.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Devoluciones
CREATE INDEX IF NOT EXISTS idx_devoluciones_empresa_fecha ON public.devoluciones (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_devoluciones_venta ON public.devoluciones (venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devoluciones_cliente ON public.devoluciones (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devoluciones_vendedor ON public.devoluciones (vendedor_id) WHERE vendedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devoluciones_carga ON public.devoluciones (carga_id) WHERE carga_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devolucion_lineas_devolucion ON public.devolucion_lineas (devolucion_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_lineas_producto ON public.devolucion_lineas (producto_id);

-- Ventas / pedidos
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON public.ventas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor ON public.ventas (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_pedido_origen ON public.ventas (pedido_origen_id) WHERE pedido_origen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_folio_trgm ON public.ventas USING gin (folio extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venta_comisiones_venta ON public.venta_comisiones (venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_comisiones_vendedor ON public.venta_comisiones (vendedor_id);

-- Entregas
CREATE INDEX IF NOT EXISTS idx_entregas_cliente ON public.entregas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_entregas_vendedor ON public.entregas (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_entregas_vendedor_ruta ON public.entregas (vendedor_ruta_id) WHERE vendedor_ruta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entregas_folio_trgm ON public.entregas USING gin (folio extensions.gin_trgm_ops);

-- Cobros / gastos / cargas
CREATE INDEX IF NOT EXISTS idx_cobros_cliente ON public.cobros (cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_devolucion ON public.gastos (devolucion_id) WHERE devolucion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cobro_excedentes_venta ON public.cobro_excedentes (venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carga_lineas_carga ON public.carga_lineas (carga_id);
CREATE INDEX IF NOT EXISTS idx_cargas_empresa ON public.cargas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cargas_vendedor ON public.cargas (vendedor_id);

-- Búsqueda por nombre/código (clientes y productos)
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_trgm ON public.clientes USING gin (nombre extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clientes_codigo_trgm ON public.clientes USING gin (codigo extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm ON public.productos USING gin (nombre extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_trgm ON public.productos USING gin (codigo extensions.gin_trgm_ops);

ANALYZE public.devoluciones, public.devolucion_lineas, public.ventas, public.entregas, public.cobros, public.clientes, public.productos;
