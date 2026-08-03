# 04 · Flujos de negocio

Este documento explica **cómo conviven las tablas y los archivos** en cada proceso.
Los campos exactos de cada tabla están en [docs/02](./02-ESQUEMA-BASE-DE-DATOS.md).

---

## 1. Catálogo de productos

```
productos ──┬─ marcas / clasificaciones / listas       (clasificación)
            ├─ unidades (unidad_compra_id, unidad_venta_id) + factor_conversion
            ├─ tasas_iva / tasas_ieps                  (impuestos)
            ├─ producto_presentaciones                 (paquetes, cajas, granel)
            ├─ producto_proveedores                    (costos por proveedor)
            ├─ producto_equivalencias                  (homologación de códigos externos)
            └─ stock_almacen / stock_lotes / stock_camion / stock_apartado
```

- Vista: `/productos` → `src/pages/ProductosListPage.tsx`.
- Detalle: `/productos/:id` → `src/pages/ProductoForm/` (`index.tsx` +
  `useProductoForm.ts` + pestañas General / Fiscal / Precios / Proveedores / Almacenes).
- Nombres múltiples estilo Odoo: `nombre`, `nombre_compra`, `nombre_venta`,
  `nombre_ticket`; resolver siempre con los helpers de `src/lib/productoNombres.ts`.
- Banderas relevantes: `se_puede_vender`, `vender_sin_stock`, `se_puede_inventariar`,
  `es_granel`, `maneja_lote`, `costo_incluye_impuestos`, `tiene_iva`, `tiene_ieps`.

## 2. Motor de precios (el corazón del sistema)

Archivos: `src/lib/priceResolver.ts` (resolución), `src/lib/salePricing.ts` y
`src/lib/posPricing.ts` (cálculo de línea), `src/lib/taxUtils.ts` (impuestos),
`src/lib/explicacion_precio.ts` (por qué salió ese precio).

Tablas: `tarifas` (en UI: "Listas de precio") → `tarifa_lineas` (reglas);
`lista_precios` / `lista_precios_lineas` (agrupación de niveles); `clientes.tarifa_id`.

**Jerarquía de resolución (gana el primero):**

1. **Precio directo** en `tarifa_lineas` (`tipo_calculo = 'precio_fijo'`) para ese producto.
2. **Regla** por clasificación o global: `margen_costo` (sobre el costo) o
   `descuento_precio` (sobre `precio_principal`).
3. **Precio principal** del producto.
4. Después: **promoción** → **impuestos** → **redondeo final**.

Detalles críticos:
- `base_precio` de la regla indica si el resultado es `con_impuestos` o `sin_impuestos`.
  Si es `sin_impuestos`, los impuestos se **suman encima**.
- Si el producto tiene `costo_incluye_impuestos = true`, el costo se **desimpuesta**
  antes de aplicar el margen (si no, se cobra impuesto sobre impuesto).
- Orden de impuestos: **IEPS primero, IVA después** (el IVA se calcula sobre base + IEPS).
- El redondeo (`redondeo` de la tarifa) se aplica al **precio bruto** mostrado; el neto
  crudo se conserva en `venta_lineas.precio_unitario_sin_redondeo` para auditoría.
- Al cambiar de cliente en escritorio, si su lista es distinta se ofrece re-tarificar
  (`RepriceListaDialog.tsx`); no se permiten líneas antes de que el pricing esté listo
  (`pricingReady` en `useVentaForm.ts`).

Tests: `src/test/priceResolver.test.ts`, `posPricing.test.ts`, `taxUtils.test.ts`.

## 3. Promociones

Tablas: `promociones` (definición: n×m, %, monto, acumulable, vigencias) y
`promocion_aplicada` (registro por venta/línea, **idempotente**).

Archivos: `src/hooks/usePromociones.ts`, `src/lib/promoLinea.ts` (neteo consciente de
impuestos), `src/lib/promoPersist.ts` (persistencia idempotente),
`src/lib/promoReporting.ts` (prorrateo para reportes).

Servidor: al insertar/borrar en `promocion_aplicada`, `trg_promocion_aplicada_netear`
recalcula la línea y el trigger de encabezado recalcula el total y el saldo.
`fn_reevaluar_promos_venta()` y el botón **"Actualizar promos"** (sólo super admin,
en `/ventas`) reparan ventas creadas con app móvil desactualizada.

**Riesgo conocido:** si la promo se registra *después* de haber cobrado el total bruto,
el cliente queda con sobrepago (pagado > total). Se resuelve como saldo a favor.

## 4. Venta y pedido

```
ventas ──┬─ venta_lineas ──┬─ productos
         │                 ├─ unidades
         │                 └─ lotes (lote_id) / almacenes (almacen_id)
         ├─ clientes, vendedores, almacenes, tarifas, caja_turnos
         ├─ promocion_aplicada
         ├─ cobros → cobro_aplicaciones
         ├─ entregas → entrega_lineas
         ├─ devoluciones → devolucion_lineas
         └─ cfdis / facturas
```

- `tipo`: `pedido` (se entrega después) o `venta_directa` (entrega inmediata).
- `status`: `borrador → confirmado → entregado → facturado`, o `cancelado`.
- `condicion_pago`: `contado` | `credito` | `por_definir`; el crédito valida
  `clientes.limite_credito` **en vivo** (no desde caché).
- `saldo_pendiente` lo mantiene el trigger, **nunca** el front.
- `venta_lineas` guarda el **desglose completo** por línea: precio bruto y neto, sin
  redondeo, descuento manual, descuento por promoción, IEPS e IVA. Ver
  `src/lib/ventaLineaDesglose.ts`.

Vistas:
- Listado `/ventas` → `src/pages/VentasListPage.tsx` + `src/pages/ventas/*`
  (`VentasDesktopTable.tsx`, `VentaExpandedRow.tsx`, `ventasConstants.ts`).
- Detalle `/ventas/:id` → `src/pages/VentaForm/` (`useVentaForm.ts`, `VentaLineasTab.tsx`,
  `VentaTotals.tsx`, `VentaLineaDesktop.tsx`, `AdminEditVentaDialog.tsx`).
- Punto de venta `/pos` → `src/pages/PuntoVentaPage.tsx` + `src/components/pos/`.
- Cotizaciones `/cotizaciones` → `cotizaciones` / `cotizacion_lineas`, se convierten en
  venta validando stock con `validar_stock_cotizacion()`.

## 5. Inventario

```
stock_almacen   (existencia por almacén)
stock_lotes     (existencia por lote, empresas con maneja_lotes)
stock_camion    (existencia cargada en el vehículo del vendedor)
stock_apartado  (reservado por pedidos; opcionalmente por lote)
movimientos_inventario  (kardex: toda entrada/salida con referencia)
```

Todo movimiento nace de un documento: compra, venta/entrega, traspaso, merma,
ajuste, conteo físico o devolución. **El front nunca escribe stock directo**: llama RPC.

- Compras `/compras` → `compras` / `compra_lineas` / `pago_compras`;
  al recibir (`recibir_linea_compra`) entra stock y se recalcula el costo
  (`recalc_producto_costo`, según `productos.calculo_costo`).
- Traspasos `/traspasos` → `traspasos` / `traspaso_lineas`, confirmación con
  `confirmar_traspaso()` (bloqueo de fila).
- Conteos físicos `/conteos` → `conteos_fisicos` / `conteo_lineas`, teórico vs físico
  y ajuste por RPC; reapertura con PIN.
- Mermas `/mermas` → `mermas` / `merma_lineas` / `merma_motivos`.
- Ajustes → `ajustes_inventario`.
- Auditorías de almacén → `auditorias` / `auditoria_lineas` / `auditoria_escaneos`.
- Kardex `/kardex` → lee `movimientos_inventario` (`useKardexReferencias`, `useKardexUbicacion`).

## 6. Lotes y caducidad

Tablas: `lotes` (código, caducidad, producto, almacén) y `stock_lotes`.
Se activa con `empresas.maneja_lotes` y `productos.maneja_lote`.

- Asignación automática **FEFO** (`src/lib/lotesFefo.ts`), con anulación manual.
- El apartado de pedidos reserva lote (`stock_apartado.lote_id`); disponibilidad real
  con `fn_disponible_lotes()`.
- Vista `/lotes` → `src/pages/LotesPage.tsx`, con modo **Matriz** (producto × lote).
- Los PDF/tickets muestran código de lote y caducidad cuando aplica.

## 7. Logística: carga, pedido, entrega, descarga

```
cargas ─ carga_lineas ─ carga_pedidos      → qué sube al camión
ventas(tipo=pedido) ─ entregas ─ entrega_lineas  → qué se entrega (1 pedido : N entregas)
descarga_ruta ─ descarga_ruta_lineas       → qué regresa al almacén
ruta_sesiones                              → jornada del vendedor (inicio/cierre, GPS)
```

- Vistas: `/logistica/pedidos` (`DemandaPage.tsx`), `/entregas` (`EntregaListPage.tsx`),
  `/descargas`, `/monitor-rutas`, `/mapa-clientes`, `/supervisor`.
- Entrega parcial: se surte por línea (`surtir_linea_entrega*`); el pedido puede
  **cerrarse a lo entregado** con `cerrar_pedido_parcial()` (ajusta cantidades y totales)
  y revertirse con `reabrir_pedido_parcial()`. Acción masiva:
  `BulkCerrarPedidosDialog.tsx`.
- Al marcar la entrega como `hecho`, un trigger descuenta el stock (idempotente).
- Optimización de ruta: `distancia_cache`, `ruta_polyline_cache`,
  `optimizacion_rutas_log` y `optimizacion_recargas` (cuota mensual de la API de Google).

## 8. Cobranza y saldos

```
cobros ─ cobro_aplicaciones ─ ventas        (aplicación FIFO multi-folio)
solicitudes_pago / payment_links / cobro_reintentos   (cobro en línea)
caja_turnos ─ caja_movimientos              (turnos de caja del POS)
```

- `registrar_cobro()` / `aplicar_cobro()` distribuyen el pago FIFO
  (`src/lib/paymentDistribution.ts`); el excedente se vuelve **saldo a favor**
  (`src/lib/saldoFavor.ts`, `useSaldoFavor`).
- Vistas: `/cobranza`, `/cuentas-cobrar`, `/aplicar-pagos`, `/ruta/cobros`.
- Documentos: recibo PDF (`cobroReciboPdf.ts`), ticket térmico (`cobroTicket.ts`),
  envío por WhatsApp (`enviarReciboCobro.ts`).
- Todo estado de cuenta muestra obligatoriamente **Saldo anterior** y **Saldo nuevo**.
- Liquidación de ruta: snapshot inmutable al cerrar; efectivo esperado = cobros − gastos.

## 9. Ruta móvil (PWA)

Rutas bajo `/ruta/*` → `src/pages/ruta/`:

| Vista | Archivo |
|---|---|
| Inicio / jornada | `RutaInicio`, `RutaIniciarPage`, `useRutaSesion` |
| Nueva venta | `RutaNuevaVenta/` (pasos: tipo → cliente → devoluciones → productos → confirmar → pago) |
| Detalle de venta | `RutaVentaDetalle/` |
| Cobros | `RutaCobros`, `RutaCobrar` |
| Carga / stock del camión | `RutaMiCarga`, `RutaStock` |
| Devoluciones | `RutaDevolucion` (permite devolución **sin venta**) |
| Descarga | `RutaDescarga` |
| Mapa y navegación | `RutaMapaPage`, `RutaNavegacionPage` |
| Sincronización | `RutaSincronizarPage`, `PendientesSincronizarPage` |

Estado local en `src/stores/rutaStore.ts`; tipos del carrito en
`src/pages/ruta/RutaNuevaVenta/types.ts` (`CartItem` guarda el snapshot completo de
precio, impuestos, promoción, presentación y lote).

## 10. Facturación CFDI y suscripciones

- CFDI 4.0 vía Facturama: `cfdis`, `cfdi_lineas`, `cfdi_pagos`, `cfdi_pago_documentos`,
  `facturas`, catálogos `cat_*` (uso CFDI, forma/método de pago, régimen, moneda).
  Timbres pre-pagados: `timbres_movimientos` + RPC `reserve_timbre` / `confirm_timbre_reserve`
  / `deduct_timbre` / `release_timbre`.
- Suscripciones SaaS: `subscriptions`, `subscription_plans`, `planes`, `empresa_addons`,
  `cupones` / `cupon_usos`, `partners` y sus comisiones. Cobro por Stripe/OpenPay,
  suspensión automática a los 4 días de impago (`daily-billing`).
- Vistas: `/facturacion`, `/facturacion-cfdi`, `/mi-suscripcion`, `/super-admin`.

## 11. Reportes, dashboard y control

- `/dashboard` → `src/pages/DashboardPage.tsx` + `src/components/dashboard/`
  (KPIs con comparativo contra el periodo anterior; excluye canceladas y usa la zona
  horaria de la empresa — debe cuadrar exacto con el listado de ventas).
- `/reportes` → `useReportesData`, incluye pestaña "Detalle productos" que aplana líneas.
- `/control` → `useControlData`: detección de fraude, descuentos excesivos, venta bajo costo.
- `/reportes-personalizados` → `reportes_personalizados`.
- Exportación Excel/CSV con `src/lib/exportUtils.ts`; PDFs con el estándar Odoo
  (`src/lib/pdfBase.ts`, fondo blanco, texto negro, 100% código).

## 12. Canales públicos

| Canal | Ruta | Tabla / función |
|---|---|---|
| Catálogo compartible | `/catalogo/:token` | `public-catalog` |
| Tienda en línea | `/tienda/:slug` | `tienda_config`, `tienda_clientes`, `tienda-*` |
| Cotización pública | `/cotizacion/:token` | `cotizacion-publica` |
| Estado de cuenta cliente | `/cliente/:token` | `cliente-portal` |
| Pago en línea | `/pagar/:token` | `payment_links`, `openpay-public` |

Todos se sirven por Edge Function con validación de token: las tablas siguen protegidas
por RLS y nunca se exponen directo al anon.
