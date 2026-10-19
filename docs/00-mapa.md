# Mapa del sistema — RutApp (Inventario Fase 1)

**Fecha:** 2026-10-19 · **Agente:** auditor · **Base:** `main` @ `ca997e4`

SaaS multiempresa (`empresa_id`) de venta en ruta. React + TS + Supabase + PWA offline. Procesos en [04-FLUJOS-DE-NEGOCIO.md](./04-FLUJOS-DE-NEGOCIO.md).

## Fuentes cruzadas y su confiabilidad

| fuente | qué aporta | confiabilidad |
|---|---|---|
| `supabase/migrations` (701 archivos) | historia de creación/cambios | 🟡 no reproduce la BD: hay tablas sin migración y cambios por SQL dinámico (`EXECUTE format(...)`) |
| `src/integrations/supabase/types.ts` | 179 tablas, 2 204 columnas, 185 funciones, 27 enums | 🟡 refleja la BD a la fecha en que se regeneró; puede estar atrasado |
| código (`src/`, `supabase/functions/`) | 153 tablas y 91 RPC realmente usadas; 6 443 referencias a columnas | ✅ comportamiento actual |
| BD de producción | verdad | ❓ **pendiente**: correr [`inventario/validar-bd.sql`](./inventario/validar-bd.sql) |
| `docs/02-ESQUEMA-BASE-DE-DATOS.md` | dice 153 tablas | ⚠️ desactualizado (types.ts tiene 179) |
| `README.md` (spec original de productos) | campos de `productos` | ⚠️ obsoleto: `manejar_lotes`, `contador`, `contador_tarifas`, `proveedor_id`, `tasa_iva_id`, `tasa_ieps_id` fueron eliminados (migraciones 20260610041050 y 20260610042254) |

**Certeza por tabla:** ✅ = existe en types.ts **y** el código la usa · 🟡 = solo una de las dos · ⚠️ = contradicción (sin migración, o el código usa columnas que types.ts no tiene).
**Cobertura** = ✅/total. Mide estructura conocida, **no** conocimiento de reglas de negocio, y todo queda sujeto a la validación SQL contra producción.

## Módulos

| # | módulo | tablas | ✅ | 🟡 | ⚠️ | cobertura | edge functions que lo tocan |
|---|---|---|---|---|---|---|---|
| 1 | Empresas, usuarios y permisos | 12 | 10 | 1 | 1 | 83% | 37 |
| 2 | Catálogo de productos | 10 | 9 | 1 | 0 | 90% | 11 |
| 3 | Precios, tarifas y listas | 4 | 4 | 0 | 0 | 100% | 7 |
| 4 | Clientes y zonas | 3 | 2 | 0 | 1 | 67% | 13 |
| 5 | Inventario y almacenes | 27 | 18 | 8 | 1 | 67% | 6 |
| 6 | Ventas, pedidos y cotizaciones | 12 | 10 | 1 | 1 | 83% | 14 |
| 7 | Promociones y cupones | 4 | 4 | 0 | 0 | 100% | 4 |
| 8 | Logística y ruta móvil | 17 | 16 | 1 | 0 | 94% | 4 |
| 9 | Cobranza, caja y gastos | 9 | 8 | 1 | 0 | 89% | 9 |
| 10 | Comisiones y metas | 6 | 6 | 0 | 0 | 100% | 1 |
| 11 | Compras y proveedores | 8 | 7 | 1 | 0 | 88% | 3 |
| 12 | Facturación CFDI | 17 | 10 | 6 | 1 | 59% | 2 |
| 13 | Reportes, dashboard e importación | 5 | 5 | 0 | 0 | 100% | 3 |
| 14 | Suscripción SaaS y billing | 12 | 6 | 4 | 2 | 50% | 22 |
| 15 | WhatsApp y correo | 12 | 7 | 1 | 4 | 58% | 16 |
| 16 | Tienda en línea | 3 | 3 | 0 | 0 | 100% | 9 |
| 17 | Partners y comisiones internas | 9 | 6 | 3 | 0 | 67% | 2 |
| 18 | Avisos, publicidad y soporte | 9 | 9 | 0 | 0 | 100% | 2 |

Orden sugerido de auditoría (Fase 2): Empresas/permisos → Catálogo → Precios → Clientes → Inventario → Ventas → Cobranza → Facturación CFDI → Suscripción/billing; el resto después.

## Nombres engañosos (verificados en llaves foráneas de types.ts)

| se llama | en realidad | evidencia |
|---|---|---|
| `vendedor_id` (ventas, clientes, cargas, entregas, gastos, metas_venta, venta_comisiones, …) | apunta a **`profiles`**, no a la tabla `vendedores` | FKs en types.ts; alias en código `vendedores:profiles!…` |
| tabla `vendedores` | legado: solo la usa `demo-login` | uso en código |
| `clientes.cobrador_id` | apunta a **`profiles`**; la tabla `cobradores` no la usa nadie | FKs + uso |
| `tarifas` | en la UI se llama **"Listas de precio"** | `docs/04` §2 |
| `lista_precios` | otra tabla: niveles/agrupación de precios (`clientes.lista_precio_id`, `promociones.lista_precio_id`) | FKs |
| `listas` | tercera tabla: grupo de producto (`productos.lista_id`, `clientes.lista_id`) | FKs |
| `zonas` | en reportes se muestra como **"Ruta/Zona"** | `clientes.zona_id → zonas` |
| `facturas` | facturas del **SaaS a las empresas** (billing), no CFDI de clientes | uso en `admin/*`, `PendingInvoiceModal` |
| `cfdis` / `cfdi_lineas` | CFDI que la empresa emite a sus clientes | uso en `facturacion/*` |
| `stock_camion` | sin uso en código; el stock del camión vive en `stock_almacen` (almacén tipo camión) | uso; `.lovable/memory/architecture/multi-tenant.md` aún la lista ⚠️ |

## Discrepancias detectadas (⚠️ hasta confirmar con SQL)

### Columnas que el código usa y types.ts NO tiene
Si la BD tampoco las tiene, la consulta falla y el código ignora el error (no revisa `error`), así que **falla en silencio**.

| sev | tabla.columna | dónde | efecto si no existe |
|---|---|---|---|
| ALTA | `cfdi_lineas.venta_id` | `src/hooks/useVentas.ts:662` | el bloqueo "no puedes eliminar una venta facturada" nunca se activa |
| ALTA | `subscriptions.stripe_price_id`, `planes.meses` | `supabase/functions/billing-cycle/index.ts:90,138` | el día 1 no se generan facturas de suscripción |
| ALTA | `ventas.dias_credito` | `src/pages/PuntoVentaPage.tsx:298`, `src/pages/VentaForm/index.tsx:96`, `src/lib/reportesPersonalizados.ts:438` | saldo pendiente y cuentas vencidas del cliente salen en 0 (control de crédito sin efecto); reporte por folio falla |
| MEDIA | `ventas.descuento_porcentaje` | `src/hooks/useControlData.ts:40` | el control de descuentos > 15 % no muestra nada |
| MEDIA | `ventas.estado` | `supabase/functions/cliente-portal/index.ts:35` | el portal del cliente no muestra ventas (la columna real es `status`) |
| BAJA | `clientes.activo` | `supabase/functions/wa-scheduler-alertas-semanal/index.ts:24` | alertas semanales sin clientes (la columna real es `status`) |
| BAJA | `profiles.rol` | `src/components/admin/AdminEmpresaDetail.tsx:193` | lista de usuarios vacía en el detalle de empresa (super admin) |

### Objetos fuera del historial de migraciones
- 5 tablas en types.ts que **ninguna migración crea**: `auditoria_reparaciones_inventario`, `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails`. La BD no se puede reconstruir solo con las migraciones.
- 2 RPC que el código llama y types.ts no declara: `admin_set_team_permissions`, `fn_customer_intelligence_product_dimensions`.
- `updated_at` de `clientes`, `cobros`, `entregas`, `productos`, `ventas` se agrega con SQL dinámico (`20260727120000_updated_at_ventas_cobros_entregas.sql`): correcto, pero invisible para búsquedas por nombre.

### Tablas en types.ts sin uso en el código (31) — ¿legado o vivas?
`admin_trial_crm_activities`, `admin_trial_crm_deletions`, `admin_trial_crm_leads`, `auditoria_reparaciones_inventario`, `cat_metodo_pago`, `cat_moneda`, `cat_tipo_comprobante`, `cobradores`, `compra_linea_lotes`, `email_send_state`, `email_unsubscribe_tokens`, `internal_commission_entries`, `internal_commission_payouts`, `internal_crm_call_pitch_config`, `logistica_pedido_resumen`, `merma_linea_lotes`, `merma_lineas`, `platform_team_member_audit_log`, `producto_almacen_config`, `solicitud_traspaso_historial`, `solicitud_traspaso_lineas`, `solicitud_traspaso_surtidos`, `solicitudes_traspaso`, `stock_camion`, `tasas_isr_ret`, `tasas_iva_ret`, `timbres_movimientos`, `traspaso_linea_lotes`, `trial_blacklist`, `ventas_descuadre_auditoria`, `whatsapp_templates`.
Varias pueden usarse solo desde triggers/funciones SQL (p. ej. `*_linea_lotes`, `solicitudes_traspaso`): el bloque 5 del SQL muestra filas y actividad para decidir.

## Cómo validar contra producción
Correr [`docs/inventario/validar-bd.sql`](./inventario/validar-bd.sql) en Supabase → SQL Editor (solo `SELECT`). Bloques:
1. **Hallazgos**: tablas/columnas/RPC que el código usa y no existen; diferencias types.ts ↔ BD; migraciones aplicadas que no están en el repo y viceversa; tablas sin RLS, con RLS sin políticas o con `empresa_id` cuyas políticas no filtran por empresa; dinero en float; buckets faltantes.
2. **Resumen** de conteos.
3. **Nombres engañosos**: a qué tabla apuntan realmente las FK.
4. Estructura de las 5 tablas sin migración.
5. Filas y actividad de las tablas sin uso en código.

Probado en un Postgres 16 desechable con datos sembrados: ejecuta sin error y detecta cada tipo de hallazgo.

## Detalle por módulo

### 1. Empresas, usuarios y permisos

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `empresas` | 44 | — | 34 | _shared, admin-billing, admin-cancel-empresa-pending, admin-users, billing-cycle, billing-notify, cliente-portal, cotizacion-publica, demo-login, facturama, partner-sandbox-login, public-catalog, select-plan, send-cobro-recibo, solicitud-compra-proveedor, stripe-webhook, tienda-resolve, wa-bot-webhook, wa-scheduler-reporte-diario, wa-test-envios-preview, whatsapp-evolution | 2 | sí | ✅ |
| `feature_flags` | 9 | — | 3 | — | 2 | sí | ✅ |
| `otp_codes` | 6 | — | 1 | send-otp | 0 | sí | ✅ |
| `platform_team_member_audit_log` | 7 | — | 0 | — | 0 | sí | 🟡 |
| `platform_team_members` | 18 | — | 1 | admin-team-account | 0 | sí | ✅ |
| `profiles` | 17 | sí | 56 | _shared, admin-billing, admin-users, billing-cycle, billing-notify, create-invoice-reminder, create-trial-checkout, dashboard-ai-advisor, demo-login, facturama, manage-subscription, optimize-route, partner-sandbox-login, purchase-route-credits, purchase-timbres, select-plan, solicitud-compra-proveedor, stripe-webhook, tienda-admin-clientes, user-lifecycle, wa-bot-webhook, wa-campaign, whatsapp-evolution, whatsapp-sender | 0 | sí | ⚠️ rol (src/components/admin/AdminEmpresaDetail.tsx:193) |
| `role_permisos` | 5 | — | 2 | — | 0 | sí | ✅ |
| `roles` | 9 | sí | 2 | admin-users | 0 | sí | ✅ |
| `super_admins` | 4 | — | 3 | admin-billing, billing-realign-to-month-start, billing-reanchor-to-cdmx-8am, openpay, solicitud-compra-proveedor, tienda-admin-clientes, wa-campaign | 0 | sí | ✅ |
| `user_favorites` | 7 | — | 1 | — | 0 | sí | ✅ |
| `user_roles` | 4 | — | 4 | admin-users, optimize-route, purchase-route-credits | 0 | sí | ✅ |
| `vendedores` | 5 | sí | 0 | demo-login | 0 | sí | ✅ |

### 2. Catálogo de productos

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `clasificaciones` | 6 | sí | 14 | demo-login, public-catalog, tienda-catalog, tienda-producto | 0 | sí | ✅ |
| `listas` | 5 | sí | 3 | demo-login | 0 | sí | ✅ |
| `marcas` | 5 | sí | 10 | demo-login, public-catalog, tienda-catalog, tienda-producto | 0 | sí | ✅ |
| `producto_almacen_config` | 9 | sí | 0 | — | 0 | sí | 🟡 |
| `producto_equivalencias` | 9 | sí | 2 | — | 0 | sí | ✅ |
| `producto_presentaciones` | 12 | sí | 3 | tienda-asistente-pedido, tienda-catalog, tienda-checkout, tienda-producto | 1 | sí | ✅ |
| `producto_proveedores` | 8 | — | 1 | — | 0 | sí | ✅ |
| `productos` | 58 | sí | 40 | _shared, demo-login, notify-alerts-scan, public-catalog, solicitud-compra-proveedor, tienda-asistente-pedido, tienda-catalog, tienda-checkout, tienda-producto, wa-bot-webhook, wa-scheduler-alertas-semanal | 0 | sí | ✅ |
| `unidades` | 6 | sí | 6 | public-catalog, solicitud-compra-proveedor, tienda-asistente-pedido, tienda-catalog, tienda-producto | 0 | sí | ✅ |
| `vehiculos` | 16 | sí | 2 | — | 1 | sí | ✅ |

### 3. Precios, tarifas y listas

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `lista_precios` | 9 | sí | 11 | demo-login, public-catalog, tienda-admin-clientes, tienda-asistente-pedido, tienda-catalog, tienda-checkout, tienda-producto | 0 | sí | ✅ |
| `lista_precios_lineas` | 5 | — | 1 | demo-login | 0 | sí | ✅ |
| `tarifa_lineas` | 18 | — | 12 | public-catalog, tienda-asistente-pedido, tienda-catalog, tienda-checkout, tienda-producto | 0 | sí | ✅ |
| `tarifas` | 10 | sí | 13 | demo-login | 0 | sí | ✅ |

### 4. Clientes y zonas

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `cliente_orden_ruta` | 11 | sí | 3 | — | 0 | sí | ✅ |
| `clientes` | 52 | sí | 35 | cliente-portal, cotizacion-publica, demo-login, facturama, send-cobro-recibo, tienda-admin-clientes, tienda-asistente-pedido, tienda-catalog, tienda-checkout, tienda-login, tienda-producto, tienda-register, wa-scheduler-alertas-semanal | 1 | sí | ⚠️ activo (supabase/functions/wa-scheduler-alertas-semanal/index.ts:21) |
| `zonas` | 5 | sí | 7 | demo-login, tienda-admin-clientes | 0 | sí | ✅ |

### 5. Inventario y almacenes

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `ajustes_inventario` | 12 | sí | 4 | — | 0 | sí | ✅ |
| `almacenes` | 10 | sí | 32 | demo-login | 0 | sí | ✅ |
| `auditoria_entradas` | 5 | — | 2 | — | 0 | sí | ✅ |
| `auditoria_escaneos` | 7 | — | 1 | — | 0 | sí | ✅ |
| `auditoria_lineas` | 11 | — | 4 | — | 0 | sí | ✅ |
| `auditoria_reparaciones_inventario` | 7 | sí | 0 | — | 0 | ❓ | ⚠️ |
| `auditorias` | 16 | sí | 4 | — | 0 | sí | ✅ |
| `conteo_entradas` | 6 | — | 1 | — | 0 | sí | ✅ |
| `conteo_lineas` | 15 | — | 4 | — | 0 | sí | ✅ |
| `conteos_fisicos` | 17 | sí | 4 | — | 0 | sí | ✅ |
| `lotes` | 11 | sí | 5 | — | 0 | sí | ✅ |
| `merma_linea_lotes` | 8 | sí | 0 | — | 0 | sí | 🟡 |
| `merma_lineas` | 10 | sí | 0 | — | 0 | sí | 🟡 |
| `merma_motivos` | 5 | sí | 1 | — | 0 | sí | ✅ |
| `mermas` | 16 | sí | 2 | — | 0 | sí | ✅ |
| `movimientos_inventario` | 16 | sí | 10 | — | 0 | sí | ✅ |
| `solicitud_traspaso_historial` | 8 | sí | 0 | — | 0 | sí | 🟡 |
| `solicitud_traspaso_lineas` | 20 | — | 0 | — | 0 | sí | 🟡 |
| `solicitud_traspaso_surtidos` | 6 | sí | 0 | — | 0 | sí | 🟡 |
| `solicitudes_traspaso` | 21 | sí | 0 | — | 0 | sí | 🟡 |
| `stock_almacen` | 6 | sí | 20 | demo-login, notify-alerts-scan, public-catalog, tienda-asistente-pedido, tienda-catalog, tienda-producto | 1 | sí | ✅ |
| `stock_apartado` | 10 | sí | 4 | — | 0 | sí | ✅ |
| `stock_camion` | 8 | sí | 0 | — | 1 | sí | 🟡 |
| `stock_lotes` | 7 | sí | 2 | — | 0 | sí | ✅ |
| `traspaso_linea_lotes` | 9 | sí | 0 | — | 1 | sí | 🟡 |
| `traspaso_lineas` | 5 | — | 3 | — | 0 | sí | ✅ |
| `traspasos` | 13 | sí | 4 | — | 1 | sí | ✅ |

### 6. Ventas, pedidos y cotizaciones

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `cliente_pedido_sugerido` | 5 | — | 1 | — | 0 | sí | ✅ |
| `cotizacion_lineas` | 23 | sí | 2 | cotizacion-publica | 0 | sí | ✅ |
| `cotizaciones` | 30 | sí | 2 | cotizacion-publica | 2 | sí | ✅ |
| `devolucion_lineas` | 10 | — | 5 | — | 0 | sí | ✅ |
| `devolucion_motivo_config` | 5 | sí | 1 | — | 0 | sí | ✅ |
| `devoluciones` | 14 | sí | 15 | wa-scheduler-reporte-diario | 0 | sí | ✅ |
| `venta_comisiones` | 13 | sí | 7 | — | 0 | sí | ✅ |
| `venta_historial` | 8 | sí | 8 | — | 0 | sí | ✅ |
| `venta_linea_lotes` | 11 | sí | 2 | — | 0 | sí | ✅ |
| `venta_lineas` | 49 | sí | 31 | _shared, facturama, tienda-asistente-pedido, tienda-checkout | 3 | sí | ✅ |
| `ventas` | 39 | sí | 56 | _shared, admin-billing, cliente-portal, notify-alerts-scan, send-cobro-recibo, tienda-asistente-pedido, tienda-checkout, tienda-pedidos, wa-bot-webhook, wa-scheduler-alertas-semanal, wa-scheduler-cobranza-diaria, wa-scheduler-reporte-diario | 1 | sí | ⚠️ descuento_porcentaje (src/hooks/useControlData.ts:39); dias_credito (src/lib/reportesPersonalizados.ts:437); dias_credito (src/pages/PuntoVentaPage.tsx:297); dias_credito (src/pages/VentaForm/index.tsx:95); estado (supabase/functions/cliente-portal/index.ts:34) |
| `ventas_descuadre_auditoria` | 11 | sí | 0 | — | 0 | sí | 🟡 |

### 7. Promociones y cupones

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `cupon_usos` | 6 | sí | 5 | billing-cycle, create-checkout | 0 | sí | ✅ |
| `cupones` | 15 | — | 6 | create-checkout | 0 | sí | ✅ |
| `promocion_aplicada` | 10 | — | 8 | _shared, wa-scheduler-reporte-diario | 0 | sí | ✅ |
| `promociones` | 25 | sí | 1 | — | 0 | sí | ✅ |

### 8. Logística y ruta móvil

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `carga_lineas` | 7 | — | 4 | — | 0 | sí | ✅ |
| `carga_pedidos` | 4 | — | 1 | — | 0 | sí | ✅ |
| `cargas` | 10 | sí | 7 | — | 0 | sí | ✅ |
| `consumo_datos` | 11 | sí | 2 | — | 1 | sí | ✅ |
| `descarga_ruta` | 19 | sí | 4 | — | 0 | sí | ✅ |
| `descarga_ruta_lineas` | 9 | — | 3 | — | 0 | sí | ✅ |
| `distancia_cache` | 6 | sí | 0 | optimize-route | 0 | sí | ✅ |
| `entrega_lineas` | 15 | — | 13 | — | 3 | sí | ✅ |
| `entregas` | 20 | sí | 26 | wa-scheduler-reporte-diario | 4 | sí | ✅ |
| `logistica_pedido_resumen` | 19 | sí | 0 | — | 0 | sí | 🟡 |
| `optimizacion_recargas` | 12 | sí | 0 | optimize-route, purchase-route-credits, verify-route-credits | 0 | sí | ✅ |
| `optimizacion_rutas_log` | 6 | sí | 0 | optimize-route | 0 | sí | ✅ |
| `ruta_polyline_cache` | 8 | sí | 0 | optimize-route | 0 | sí | ✅ |
| `ruta_sesiones` | 22 | sí | 2 | — | 2 | sí | ✅ |
| `vendedor_ubicaciones` | 9 | sí | 3 | — | 0 | sí | ✅ |
| `vendedor_ubicaciones_historial` | 8 | sí | 3 | — | 0 | sí | ✅ |
| `visitas` | 12 | sí | 7 | wa-scheduler-reporte-diario | 0 | sí | ✅ |

### 9. Cobranza, caja y gastos

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `caja_movimientos` | 8 | sí | 5 | — | 0 | sí | ✅ |
| `caja_turnos` | 23 | sí | 3 | — | 1 | sí | ✅ |
| `cobradores` | 6 | sí | 0 | — | 0 | sí | 🟡 |
| `cobro_aplicaciones` | 5 | — | 16 | send-cobro-recibo | 0 | sí | ✅ |
| `cobro_reintentos` | 11 | sí | 0 | admin-billing, billing-cycle | 1 | sí | ✅ |
| `cobros` | 17 | sí | 23 | _shared, cliente-portal, send-cobro-recibo, wa-bot-webhook, wa-scheduler-reporte-diario | 0 | sí | ✅ |
| `gastos` | 13 | sí | 13 | _shared, wa-bot-webhook, wa-scheduler-reporte-diario | 0 | sí | ✅ |
| `payment_links` | 19 | sí | 1 | openpay-public | 0 | sí | ✅ |
| `solicitudes_pago` | 17 | sí | 3 | stripe-webhook | 0 | sí | ✅ |

### 10. Comisiones y metas

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `comision_esquemas` | 11 | sí | 1 | — | 0 | sí | ✅ |
| `commission_audit_log` | 9 | — | 1 | — | 0 | sí | ✅ |
| `commission_client_attributions` | 12 | sí | 1 | — | 2 | sí | ✅ |
| `commission_people` | 12 | — | 1 | admin-team-account | 3 | sí | ✅ |
| `metas_venta` | 15 | sí | 1 | — | 0 | sí | ✅ |
| `pago_comisiones` | 15 | sí | 2 | — | 0 | sí | ✅ |

### 11. Compras y proveedores

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `compra_linea_lotes` | 11 | sí | 0 | — | 0 | sí | 🟡 |
| `compra_lineas` | 13 | — | 7 | — | 0 | sí | ✅ |
| `compras` | 24 | sí | 13 | notify-alerts-scan | 0 | sí | ✅ |
| `pago_compras` | 11 | sí | 6 | — | 0 | sí | ✅ |
| `proveedores` | 24 | sí | 10 | demo-login | 0 | sí | ✅ |
| `solicitud_compra_eventos` | 8 | sí | 1 | solicitud-compra-proveedor | 0 | sí | ✅ |
| `solicitud_compra_lineas` | 16 | — | 1 | solicitud-compra-proveedor | 0 | sí | ✅ |
| `solicitudes_compra` | 22 | sí | 1 | solicitud-compra-proveedor | 0 | sí | ✅ |

### 12. Facturación CFDI

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `cat_forma_pago` | 4 | — | 4 | — | 0 | sí | ✅ |
| `cat_metodo_pago` | 4 | — | 0 | — | 0 | sí | 🟡 |
| `cat_moneda` | 4 | — | 0 | — | 0 | sí | 🟡 |
| `cat_regimen_fiscal` | 6 | — | 4 | — | 0 | sí | ✅ |
| `cat_tipo_comprobante` | 4 | — | 0 | — | 0 | sí | 🟡 |
| `cat_uso_cfdi` | 6 | — | 4 | — | 0 | sí | ✅ |
| `cfdi_lineas` | 17 | — | 4 | — | 0 | sí | ⚠️ venta_id (src/hooks/useVentas.ts:662) |
| `cfdi_pago_documentos` | 18 | sí | 0 | facturama | 0 | sí | ✅ |
| `cfdi_pagos` | 36 | sí | 1 | facturama | 1 | sí | ✅ |
| `cfdis` | 39 | sí | 7 | facturama, facturama-reconcile | 0 | sí | ✅ |
| `tasas_ieps` | 5 | sí | 1 | — | 0 | sí | ✅ |
| `tasas_isr_ret` | 5 | sí | 0 | — | 0 | sí | 🟡 |
| `tasas_iva` | 5 | sí | 1 | — | 0 | sí | ✅ |
| `tasas_iva_ret` | 5 | sí | 0 | — | 0 | sí | 🟡 |
| `timbres_movimientos` | 10 | sí | 0 | — | 0 | sí | 🟡 |
| `timbres_saldo` | 4 | sí | 5 | — | 0 | sí | ✅ |
| `unidades_sat` | 4 | — | 2 | — | 0 | sí | ✅ |

### 13. Reportes, dashboard e importación

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `dashboard_ai_recomendaciones` | 7 | sí | 1 | dashboard-ai-advisor | 0 | sí | ✅ |
| `import_job_lineas` | 13 | sí | 1 | — | 0 | sí | ✅ |
| `import_jobs` | 15 | sí | 1 | — | 0 | sí | ✅ |
| `maintenance_log` | 6 | — | 1 | billing-realign-to-month-start, billing-reanchor-to-cdmx-8am | 0 | sí | ✅ |
| `reportes_personalizados` | 10 | sí | 1 | — | 0 | sí | ✅ |

### 14. Suscripción SaaS y billing

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `admin_trial_crm_activities` | 9 | sí | 0 | — | 0 | sí | 🟡 |
| `admin_trial_crm_deletions` | 11 | sí | 0 | — | 0 | sí | 🟡 |
| `admin_trial_crm_leads` | 17 | sí | 0 | — | 0 | sí | 🟡 |
| `billing_message_templates` | 9 | — | 1 | billing-notify | 0 | sí | ✅ |
| `billing_notifications` | 12 | — | 2 | _shared, admin-billing, billing-align-bridge-aug2026, billing-notify, billing-notify-email, select-plan | 0 | sí | ✅ |
| `cancellation_requests` | 9 | sí | 1 | — | 0 | sí | ✅ |
| `empresa_addons` | 10 | sí | 2 | wa-bot-webhook | 1 | sí | ✅ |
| `facturas` | 23 | sí | 7 | admin-backfill-facturas, admin-billing, admin-cancel-empresa-pending, billing-cycle, billing-realign-to-month-start, create-invoice-reminder, daily-billing, demo-login, select-plan, stripe-webhook | 2 | sí | ✅ |
| `planes` | 10 | — | 0 | billing-cycle, select-plan | 0 | sí | ⚠️ meses (supabase/functions/billing-cycle/index.ts:137) |
| `subscription_plans` | 21 | — | 10 | billing-cycle, billing-notify, billing-realign-to-month-start, create-invoice-reminder, create-trial-checkout, manage-subscription, select-plan, stripe-webhook | 0 | sí | ✅ |
| `subscriptions` | 23 | sí | 15 | _shared, admin-backfill-facturas, admin-billing, admin-cancel-empresa-pending, billing-align-bridge-aug2026, billing-cycle, billing-notify, billing-realign-to-month-start, create-checkout, create-invoice-reminder, create-trial-checkout, daily-billing, demo-login, manage-subscription, partner-sandbox-login, select-plan, stripe-webhook, subscription-cleanup, user-lifecycle, wa-campaign | 0 | sí | ⚠️ stripe_price_id (supabase/functions/billing-cycle/index.ts:89) |
| `trial_blacklist` | 7 | — | 0 | — | 0 | sí | 🟡 |

### 15. WhatsApp y correo

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `email_send_log` | 8 | — | 0 | _shared, handle-email-events | 0 | ❓ | ⚠️ |
| `email_send_state` | 7 | — | 0 | — | 0 | ❓ | ⚠️ |
| `email_unsubscribe_tokens` | 5 | — | 0 | — | 0 | ❓ | ⚠️ |
| `suppressed_emails` | 5 | — | 0 | handle-email-events | 0 | ❓ | ⚠️ |
| `wa_bot_authorized_numbers` | 21 | sí | 1 | wa-bot-webhook, wa-bot-welcome, wa-scheduler-alertas-semanal, wa-scheduler-cobranza-diaria, wa-scheduler-reporte-diario, wa-test-envios-preview | 1 | sí | ✅ |
| `wa_bot_logs` | 10 | sí | 1 | wa-bot-webhook, wa-scheduler-alertas-semanal, wa-scheduler-cobranza-diaria, wa-scheduler-reporte-diario | 0 | sí | ✅ |
| `wa_campaign_sends` | 8 | — | 0 | wa-campaign | 0 | sí | ✅ |
| `wa_campaigns` | 9 | — | 0 | wa-campaign | 0 | sí | ✅ |
| `wa_optouts` | 6 | — | 1 | — | 0 | sí | ✅ |
| `whatsapp_config` | 16 | sí | 5 | admin-billing, billing-notify, partner-welcome, select-plan, stripe-webhook, whatsapp-evolution, whatsapp-sender | 0 | sí | ✅ |
| `whatsapp_log` | 10 | sí | 0 | partner-welcome, whatsapp-evolution, whatsapp-sender | 0 | sí | ✅ |
| `whatsapp_templates` | 7 | sí | 0 | — | 0 | sí | 🟡 |

### 16. Tienda en línea

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `tienda_clientes` | 10 | sí | 0 | tienda-admin-clientes, tienda-change-password, tienda-login, tienda-register | 1 | sí | ✅ |
| `tienda_config` | 19 | sí | 1 | tienda-asistente-pedido, tienda-catalog, tienda-checkout, tienda-login, tienda-producto, tienda-register, tienda-resolve | 1 | sí | ✅ |
| `tienda_solicitudes_cliente` | 27 | sí | 0 | tienda-admin-clientes, tienda-register | 0 | sí | ✅ |

### 17. Partners y comisiones internas

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `internal_commission_entries` | 22 | sí | 0 | — | 0 | sí | 🟡 |
| `internal_commission_payouts` | 9 | — | 0 | — | 0 | sí | 🟡 |
| `internal_crm_call_pitch_config` | 4 | — | 0 | — | 0 | sí | 🟡 |
| `partner_atribuciones` | 7 | sí | 4 | — | 1 | sí | ✅ |
| `partner_comisiones` | 18 | sí | 5 | — | 0 | sí | ✅ |
| `partner_niveles` | 11 | — | 1 | — | 0 | sí | ✅ |
| `partner_pagos` | 9 | — | 2 | — | 0 | sí | ✅ |
| `partner_solicitudes` | 16 | — | 3 | — | 1 | sí | ✅ |
| `partners` | 27 | — | 4 | admin-users, partner-sandbox-login | 2 | sí | ✅ |

### 18. Avisos, publicidad y soporte

| tabla | cols | empresa_id | archivos src | edge functions | triggers | RLS (mig.) | estado |
|---|---|---|---|---|---|---|---|
| `broadcast_messages` | 5 | — | 2 | — | 0 | sí | ✅ |
| `broadcast_reads` | 3 | — | 1 | — | 0 | sí | ✅ |
| `internal_notification_reads` | 3 | — | 1 | — | 0 | sí | ✅ |
| `internal_notifications` | 12 | sí | 1 | notify-alerts-scan, tienda-checkout | 0 | sí | ✅ |
| `notification_views` | 6 | — | 1 | — | 0 | sí | ✅ |
| `notifications` | 15 | sí | 2 | — | 0 | sí | ✅ |
| `publicidad_anuncios` | 12 | — | 2 | — | 1 | sí | ✅ |
| `publicidad_vistas` | 4 | — | 3 | — | 0 | sí | ✅ |
| `tutorial_videos` | 8 | sí | 2 | — | 0 | sí | ✅ |

## Regenerar (re-auditoría)
```bash
O=$(mktemp -d); D=docs/inventario/scripts
python3 -I $D/parse_types.py src/integrations/supabase/types.ts $O/types.json
python3 -I $D/parse_migs.py supabase/migrations $O/migs.json
python3 -I $D/code_use.py . $O/types.json $O/code.json
python3 -I $D/modules.py $O
python3 -I $D/gen_sql.py $O . docs/inventario/validar-bd.sql
```
