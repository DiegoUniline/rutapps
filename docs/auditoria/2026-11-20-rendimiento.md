# Auditoría de rendimiento — 2026-11-20

Revisión de 1 378 consultas `.from()` y 124 `.rpc()` del front contra los índices de `supabase/migrations`.

## Aplicado
- `20261120020000_rendimiento_indices.sql`: devoluciones/devolucion_lineas (no tenían índices), FKs de cliente/vendedor/repartidor en ventas, entregas y cobros, trigramas para búsqueda «contiene» (folio de ventas/entregas, nombre/código de clientes/productos).
- `20261120040000_rendimiento_indices_2.sql`: compras, compra_lineas, pago_compras, traspasos, traspaso_lineas, cfdis, cfdi_lineas, venta_comisiones, ventas por vendedor, venta_lineas por empresa, venta_historial, entregas validadas, cargas, visitas, descargas, auditorías, gastos y caja.
- Front: buscador de Ventas con retardo de 300 ms; números de pestañas con conteo sin traer renglones; vista Productos filtra `venta_lineas.empresa_id`; sincronización de ruta con orden estable (`order id`) al paginar.

## Pendiente (patrones que no escalan, de mayor a menor impacto)
| # | Dónde | Problema | Arreglo propuesto |
|---|---|---|---|
| 1 | `components/CommandPalette.tsx:144-228` | ~15 consultas por tecla con ILIKE en columnas sin índice | Buscar solo folio/nombre/código (con trigramas), mínimo 3 letras o una RPC |
| 2 | `lib/reportesPersonalizados.ts` | `.in(ids)` sin trocear (URL se desborda) y sin rango de fechas obligatorio | Trozos de 200 o RPC; rango obligatorio |
| 3 | `hooks/useVentas.ts` `fetchVentaIdsConPromo` | hasta 10 000 ids en `.in()` | Filtro de promoción en la BD (EXISTS/RPC) |
| 4 | Escrituras N+1 no transaccionales | DemandaPage, EntregaListPage, useEntregas, VentasListPage, VentaForm (aplicar cobro), Auditorías, compras, ajustes, saldos iniciales | Una RPC por acción con arreglo y transacción |
| 5 | EstadoCuentaClientePage, AplicarPagosPage, SaldosProveedorPage | Traen todas las ventas/compras con saldo sin `range()` (corte en 1 000) y suman dinero en el navegador | RPC de agregado por cliente/proveedor |
| 6 | DevolucionesListPage (destinos y lotes) | Movimientos sin límite | Ventana de fechas y solo ids visibles |
| 7 | Traspasos, Órdenes de compra, Gastos, CFDI, Pagos proveedores, Conteos, Auditorías, Ajustes, Cotizaciones | Listas de todo el historial (algunas sin `range()`) | Ventana de fechas + paginación en servidor |
| 8 | VentasListPage + realtime (`useData.ts`) | Conteos exactos que se repiten con cada cambio para cada administrador | Conteo estimado o RPC con conteos agrupados |
| 9 | `useData.ts:59` | Cada cambio de stock refresca el catálogo completo en todos los clientes | Invalidar solo llaves de stock |
| 10 | Comisiones generadas, Kardex por ubicación, RutaCxC/RutaEntregas | Historial completo sin ventana | Rango obligatorio / RPC |
| 11 | Código muerto: `useVentas` (`useVentas.ts:433`), `useEntregasList`, `EntregasPage`, `useCargas`, `useDevoluciones`; scripts `lib/safe_sweep*.ts`, `lib/temp_sweep_tampico.ts` | Consultas sin límite y cliente anónimo propio | Quitar (requiere `CONFIRMO`) |
