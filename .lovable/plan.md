# Dejar en blanco la empresa demo (Licencia 12324489)

Borrado total de datos de "Mi Empresa Demo" (`empresa_id 6d849e12-6437-4b24-917d-a89cc9b2fa88`): movimientos, inventario y catálogos. Solo sobreviven la empresa, sus usuarios/roles y los almacenes.

## Qué se borra

**Ventas y cobranza**
promocion_aplicada, venta_comisiones, venta_historial, venta_lineas, ventas, cobro_aplicaciones, cobros, cobro_reintentos, payment_links, cotizacion_lineas, cotizaciones, cfdi_lineas, cfdi_pago_documentos, cfdi_pagos, cfdis, solicitudes_pago, pago_comisiones, ventas_descuadre_auditoria, cancellation_requests.

**Logística e inventario**
entrega_lineas, entregas, carga_lineas, carga_pedidos, cargas, descarga_ruta_lineas, descarga_ruta, devolucion_lineas, devoluciones, traspaso_lineas, traspasos, merma_lineas, mermas, conteo_lineas, conteo_entradas, conteos_fisicos, ajustes_inventario, auditoria_lineas, auditoria_escaneos, auditoria_entradas, auditorias, movimientos_inventario, stock_almacen, stock_apartado, stock_camion, stock_lotes, lotes.

**Compras**
pago_compras, compra_lineas, compras, producto_proveedores, proveedores.

**Ruta y actividad**
visitas, ruta_sesiones, cliente_orden_ruta, cliente_pedido_sugerido, vendedor_ubicaciones, vendedor_ubicaciones_historial, optimizacion_rutas_log, optimizacion_recargas, caja_movimientos, caja_turnos, gastos, metas_venta, import_job_lineas, import_jobs, internal_notifications (+ lecturas), notification_views, dashboard_ai_recomendaciones, reportes_personalizados.

**Catálogos (por decisión del usuario)**
productos, producto_presentaciones, producto_equivalencias, clientes, tienda_clientes, promociones, tarifa_lineas, tarifas, lista_precios_lineas, lista_precios, listas, clasificaciones, marcas, unidades, tasas_iva, tasas_ieps, tasas_iva_ret, tasas_isr_ret, zonas, vehiculos, devolucion_motivo_config, comision_esquemas, cupon_usos, cupones.

## Qué NO se toca

- La empresa (`empresas`) y su configuración/licencia.
- Usuarios: `profiles`, `user_roles`, `roles`, `role_permisos`.
- `almacenes` (incluido el almacén de mermas).
- Suscripción/facturación de la plataforma: `subscriptions`, `facturas`, `timbres_saldo`, `empresa_addons`.
- Datos de otras empresas: cada borrado filtra por `empresa_id`, y las tablas hijas se filtran por su padre.

## Detalles técnicos

- Se ejecuta como una sola operación de datos (un solo statement multi-DELETE), en orden hijo → padre para respetar las llaves foráneas.
- Las tablas hijas sin `empresa_id` (por ejemplo `venta_lineas`, `entrega_lineas`, `cfdi_lineas`) se borran con `IN (SELECT id FROM padre WHERE empresa_id = ...)`.
- Después del borrado se verifica con conteos que cada tabla quede en 0 para esa empresa.
- Es irreversible: no hay respaldo automático de estos datos.
