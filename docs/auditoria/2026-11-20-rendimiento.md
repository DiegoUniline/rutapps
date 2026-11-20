# Auditoría de rendimiento — 2026-11-20

Revisión de 1 378 consultas `.from()` y 124 `.rpc()` del front contra los índices de `supabase/migrations`.

## Aplicado
- `20261120020000_rendimiento_indices.sql`: devoluciones/devolucion_lineas (no tenían índices), FKs de cliente/vendedor/repartidor en ventas, entregas y cobros, trigramas para búsqueda «contiene» (folio de ventas/entregas, nombre/código de clientes/productos).
- `20261120040000_rendimiento_indices_2.sql`: compras, compra_lineas, pago_compras, traspasos, traspaso_lineas, cfdis, cfdi_lineas, venta_comisiones, ventas por vendedor, venta_lineas por empresa, venta_historial, entregas validadas, cargas, visitas, descargas, auditorías, gastos y caja.
- Front: buscador de Ventas con retardo de 300 ms; números de pestañas con conteo sin traer renglones; vista Productos filtra `venta_lineas.empresa_id`; sincronización de ruta con orden estable (`order id`) al paginar.

## Aplicado (3ª pasada)
- Buscador ⌘K: una sola RPC `buscar_global` con trigramas (antes ~20 consultas por tecla).
- Filtro de promoción: `ventas.tiene_promocion` con trigger e índice (antes listas de 10 000 ids).
- Saldos por cliente/proveedor agregados en la BD (`resumen_saldos_clientes`, `clientes_con_saldo`, `resumen_saldos_proveedores`).
- Listas completas paginadas: gastos, CFDI, conteos, auditorías, pagos a proveedor, órdenes de compra.
- Cambio de stock ya no recarga el catálogo completo.
- Operaciones atómicas: cobro de venta + cuentas, `eliminar_ventas` (D-035), `surtir_entrega`, `aprobar_auditoria`, `aplicar_pago_proveedor`.
- Reportes personalizados con ids en trozos de 200; Devoluciones consulta destinos/lotes solo de sus ids.
- Demanda (surtir lo disponible por renglón) y Saldos iniciales (RPC por cliente con reporte de errores) se dejan así a propósito: cada renglón ya es atómico y el resultado parcial es el comportamiento deseado.

## Pendiente (patrones que no escalan, de mayor a menor impacto)
| # | Dónde | Problema | Arreglo propuesto |
|---|---|---|---|
| 1 | Traspasos, Órdenes de compra, Gastos, CFDI, Pagos proveedores, Conteos, Auditorías, Ajustes, Cotizaciones | Ya completas, pero cargan todo el historial al abrir | Ventana de fechas por omisión + paginación en servidor |
| 2 | VentasListPage + realtime (`useData.ts`) | Conteos exactos que se repiten con cada cambio para cada administrador | Conteo estimado o RPC con conteos agrupados |
| 3 | Comisiones generadas, Kardex por ubicación, RutaCxC/RutaEntregas | Historial completo sin ventana | Rango obligatorio / RPC |
| 4 | Código muerto: `useVentas` (`useVentas.ts`), `useEntregasList`, `EntregasPage`, `useCargas`, `useDevoluciones`; scripts `lib/safe_sweep*.ts`, `lib/temp_sweep_tampico.ts` | Consultas sin límite y cliente anónimo propio | Quitar (requiere `CONFIRMO`) |
