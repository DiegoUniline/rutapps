
CREATE INDEX IF NOT EXISTS idx_cobros_empresa_status_fecha
  ON public.cobros (empresa_id, status, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_cobros_empresa_user_fecha
  ON public.cobros (empresa_id, user_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_condicion_saldo
  ON public.ventas (empresa_id, condicion_pago, saldo_pendiente)
  WHERE saldo_pendiente > 0;

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_tipo_status_fecha
  ON public.ventas (empresa_id, tipo, status, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_created
  ON public.ventas (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_cliente_fecha
  ON public.ventas (empresa_id, cliente_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_venta_lineas_venta_producto
  ON public.venta_lineas (venta_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_cobro_aplicaciones_venta
  ON public.cobro_aplicaciones (venta_id);
CREATE INDEX IF NOT EXISTS idx_cobro_aplicaciones_cobro
  ON public.cobro_aplicaciones (cobro_id);

CREATE INDEX IF NOT EXISTS idx_entrega_lineas_producto
  ON public.entrega_lineas (producto_id);

CREATE INDEX IF NOT EXISTS idx_entregas_empresa_fecha
  ON public.entregas (empresa_id, fecha DESC);

ANALYZE public.cobros;
ANALYZE public.ventas;
ANALYZE public.venta_lineas;
ANALYZE public.cobro_aplicaciones;
ANALYZE public.entregas;
ANALYZE public.entrega_lineas;
