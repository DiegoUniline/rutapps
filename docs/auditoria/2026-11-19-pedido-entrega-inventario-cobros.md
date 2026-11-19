# Auditoría 2026-11-19 · Pedido ↔ Entrega ↔ Inventario ↔ Cobros

Solo lectura sobre la copia de producción `amybkerwkybffllaxpnz` (backup 2026-11-16) + código `src/`. Evidencia: funciones/triggers de la BD real y archivo:línea. Estado: OBSERVADO (no hay cambios aplicados).

## Hechos centrales
- La entrega **no guarda precio**: `entrega_lineas` no tiene columnas de dinero; el importe se calcula al leer desde `venta_lineas` emparejando por `producto_id` (`RutaEntregaDetalle.tsx:193-213`; `fn_venta_cobrable`). Cambiar precio del pedido cambia en retroactivo lo ya entregado.
- Crear entrega = 2 INSERT desde el front sin RPC ni validación contra el pedido (`useEntregas.ts:403-458`). `cantidad_entregada` se llena al **surtir**, no al entregar (`surtir_linea_entrega`).
- El pedido pasa a `entregado` por **número de entregas `hecho`**, no por cantidades (`auto_venta_entregado`); solo avanza, nunca regresa.
- Saldo: conviven 4 fórmulas. Los triggers legacy `trg_recalc_venta_saldo` (cobro_aplicaciones) y `trg_recalc_saldos_on_cobro_status` (cobros) corren al final por orden alfabético y **sobrescriben** el saldo sin piso en 0 (contradice D-007).
- Inventario por diferencia de ventas (`fn_sync_venta_inventario`) funciona: 0 descuadres nuevos desde 2026-08-06. Pedidos con entregas: mueven stock solo las entregas.

## Hallazgos (casos en BD)
### Seguridad
- S1 ALTA: RPC SECURITY DEFINER ejecutables por `anon`: `cerrar_pedido_parcial`, `reabrir_pedido_parcial` (sin validar empresa ni permiso; `cerrar` acepta `p_user_id` del cliente), `aplicar_cobro`, `saldo_clientes_a_la_fecha` (devuelve saldos de cualquier empresa), `wa_clientes_saldos`, `reconciliar_saldos_*`, `registrar_saldo_inicial`, `fn_recalc_venta_saldo`, `editar_venta`, `ajustar_entrega` (verificado `has_function_privilege`).

### Pedido ↔ entrega
| # | Hallazgo | Casos |
|---|---|---|
| H1 | Precio de entrega no congelado | cambios de precio tras 1ª entrega: 156 ago, 56 sep, 55 oct, 9 nov |
| H2 | Sin candado en BD para editar `venta_lineas` de pedido con entregas ("Corrección administrativa" `AdminEditVentaDialog.tsx:78-105`, API directa); tampoco valida vs pagado | mismos de H1 |
| H3 | `editar_venta` bloquea aunque todas las entregas estén canceladas | 200 pedidos no editables |
| H4 | `entregado` por conteo de entregas, no cantidades; front usa otra regla (`entregaStatus.ts`) | 260 entregado con faltante sin cerrar |
| H5 | Reabrir/cancelar entrega no regresa pedido a `confirmado` | 5 |
| H6 | `reabrir_pedido_parcial` no restaura líneas desde `cerrado_snapshot` | ❓ (426 cerrados) |
| H8 | Saldo cuenta como entregado lo surtido/cargado | 346 pedidos |
| H9 | Producto repetido en pedido rompe emparejamiento por producto | 11 |
| H10 | Producto entregado que no está en el pedido no se cobra | 77 pedidos / 90 renglones |
| H11 | Sobreentrega fuera de `ajustar_entrega` no se cobra (LEAST) | 20 |
| H12 | Pendiente calculado en front (cuenta `no_entregado`, ignora borradores) → doble asignación | 65 con asignado > pedido |
| H14 | `ajustar_entrega`/`cerrar_pedido_parcial` no reescalan descuentos/base_iva/promoción de encabezado | 0 usos aún |
| H16 | Flujos de varios pasos sin transacción: crear/reabrir entrega, corrección administrativa, borrar venta | — |
| H17 | Pedidos cancelados con entregas activas | 27 (17 con entrega hecha) |

### Cobros / saldo
| # | Hallazgo | Casos |
|---|---|---|
| C1 | Saldo negativo por triggers legacy | 21 ventas (−8,043.79) |
| C2 | Pagado de más se pierde sin aviso: regresar a borrador y guardar (`useVentaForm.ts:1197-1208`), `ajustar_entrega`, `cerrar_pedido_parcial`, pedido entregado de menos, corrección administrativa | 377 vivas con pagado > total (≈140 k); 23 cerradas con pagado > total_efectivo |
| C3 | Cobros activos sin aplicar, invisibles como saldo a favor (`useSaldoFavor` solo cuenta notas de crédito) | 911 cobros (1,781,783.98); 72 con remanente parcial (35,385) |
| C4 | Cancelar venta pagada: 3 comportamientos (cancela cobro / borra aplicación / la deja pegada) | 463 cobros cancelados con su venta (995 k); 154 desaplicados; 28 canceladas con cobro activo aplicado |
| C5 | Borrar varias ventas no revisa pagos (`VentasListPage.tsx:224-256`) | parte de los 761 huérfanos |
| C6 | Validación de aplicación contra `total`, no contra lo cobrable | — |
| C7 | `wa_clientes_saldos` filtra `'cancelada'` (enum es `cancelado`): el bot suma canceladas | 1,091 canceladas con saldo (≈2.97 M) |

### Inventario
| # | Hallazgo | Casos |
|---|---|---|
| R1 | Reasignar entregas / cambiar almacén del vendedor no mueve stock (asignado, `reasignar_pendientes_usuario`) | 85 entregas |
| R2 | Devolución + cancelación de la misma venta reingresa doble | 23 (1 desde Fase 1) |
| R3 | Movimientos de reasignación con `referencia_tipo='entrega'` se revierten como surtido | camino abierto |
| R4 | Cancelado/no entregado deja mercancía en camión y casi no hay descargas con `descargo_camion` (13/2004) | +10 k u en camiones |
| R5 | `no_entregado`→`surtido`→`cancelado` duplica (bodega + camión) | 22 |
| R6 | Ajustes de inventario del front: upsert absoluto sin transacción (`AjustesInventarioPage.tsx:457-490`) | mermas 95 % descuadradas |
| R7 | Reporte stock a la fecha resta dos veces (`fn_inventory_stock_at_date`) | sobrestima bodegas |
| R8 | Deuda previa a `fn_sync` (`venta_ruta`, dobles, sin descuento) | 516 ventas |
| R9 | `surtir_linea_entrega_lotes` no idempotente; surtir no valida estado | 71 hechas sin carga |

## Decisiones materiales pendientes
1. ¿Precio de lo entregado se congela en la entrega o sigue el precio vivo del pedido? (H1, H2, H13)
2. Al cancelar una venta pagada: ¿saldo a favor, reembolso o cancelar el cobro? (C4) — D-008 ya fija que el pago de más va a saldo a favor.
3. ¿Una venta con pagos puede regresar a borrador? (C2)
4. Stock en camión: ¿reasignación/cambio de almacén siempre mueve stock?, ¿`asignado` cuenta como cargado? (R1, R4)
5. Datos históricos: 911 cobros huérfanos, 377 con pagado > total, 21 negativos, canceladas con cobro.
