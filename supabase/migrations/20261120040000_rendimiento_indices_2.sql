-- Rendimiento (2ª pasada, revisión de 1 378 consultas del front contra índices).
-- Solo agrega índices. Tablas que no tenían índice por empresa ni en sus llaves hijas.

-- Compras y pagos a proveedor
CREATE INDEX IF NOT EXISTS idx_compra_lineas_compra ON public.compra_lineas (compra_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compras_emp_fecha ON public.compras (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compras_emp_prov_fecha ON public.compras (empresa_id, proveedor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pago_compras_compra ON public.pago_compras (compra_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pago_compras_emp_fecha ON public.pago_compras (empresa_id, fecha DESC);

-- Traspasos
CREATE INDEX IF NOT EXISTS idx_traspaso_lineas_traspaso ON public.traspaso_lineas (traspaso_id, created_at);
CREATE INDEX IF NOT EXISTS idx_traspaso_lineas_producto ON public.traspaso_lineas (producto_id);
CREATE INDEX IF NOT EXISTS idx_traspasos_emp_created ON public.traspasos (empresa_id, created_at DESC);

-- Facturación (se consulta cada vez que se abre una venta)
CREATE INDEX IF NOT EXISTS idx_cfdis_venta ON public.cfdis (venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cfdis_emp_created ON public.cfdis (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfdis_emp_status_created ON public.cfdis (empresa_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfdi_lineas_cfdi ON public.cfdi_lineas (cfdi_id, created_at);

-- Comisiones
CREATE INDEX IF NOT EXISTS idx_vcom_emp_fecha ON public.venta_comisiones (empresa_id, fecha_venta DESC);
CREATE INDEX IF NOT EXISTS idx_vcom_por_pagar ON public.venta_comisiones (empresa_id, fecha_venta)
  WHERE pagada = false AND pago_comision_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_vcom_pago ON public.venta_comisiones (pago_comision_id) WHERE pago_comision_id IS NOT NULL;

-- Ventas / líneas / historial
CREATE INDEX IF NOT EXISTS idx_ventas_emp_vend_fecha ON public.ventas (empresa_id, vendedor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_emp_vend_upd ON public.ventas (empresa_id, vendedor_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_ventas_emp_origen_created ON public.ventas (empresa_id, origen, created_at DESC) WHERE origen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vl_emp_created ON public.venta_lineas (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vhist_emp_created ON public.venta_historial (empresa_id, created_at DESC);

-- Entregas, cargas, descargas, visitas, clientes (sincronización de ruta)
CREATE INDEX IF NOT EXISTS idx_entregas_emp_validado ON public.entregas (empresa_id, validado_at) WHERE status = 'hecho';
CREATE INDEX IF NOT EXISTS idx_cargas_emp_fecha ON public.cargas (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cargas_repartidor ON public.cargas (repartidor_id, fecha DESC) WHERE repartidor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_emp_cobrador ON public.clientes (empresa_id, cobrador_id) WHERE cobrador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitas_emp_user_created ON public.visitas (empresa_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drl_descarga ON public.descarga_ruta_lineas (descarga_id);
CREATE INDEX IF NOT EXISTS idx_dr_vend_fecha ON public.descarga_ruta (vendedor_id, fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_dr_emp_created ON public.descarga_ruta (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dr_carga ON public.descarga_ruta (carga_id);

-- Auditorías de inventario
CREATE INDEX IF NOT EXISTS idx_audl_auditoria ON public.auditoria_lineas (auditoria_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aud_emp_created ON public.auditorias (empresa_id, created_at DESC);

-- Gastos y caja
CREATE INDEX IF NOT EXISTS idx_gastos_emp_vend_fecha ON public.gastos (empresa_id, vendedor_id, fecha DESC) WHERE cancelado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cajamov_emp_tipo_created ON public.caja_movimientos (empresa_id, tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cajaturnos_emp_abierto ON public.caja_turnos (empresa_id, abierto_at DESC);

ANALYZE public.compras, public.compra_lineas, public.traspasos, public.traspaso_lineas, public.cfdis,
        public.venta_comisiones, public.ventas, public.venta_lineas, public.cargas, public.visitas;
