# Auditoría integral de arquitectura offline

Fecha: 2026-08-05 · Alcance: todas las empresas, usuarios, roles, sucursales, almacenes, rutas y vendedores.

---

## 1. Inventario actual (qué se descarga hoy)

Motor: `src/lib/offlineSync.ts` (Dexie/IndexedDB, base `UnilineOffline`, esquema v13 en `src/lib/offlineDb.ts`).

33 tablas cacheadas: `clientes, productos, vendedores, cargas, carga_lineas, ventas, venta_lineas, cobros, cobro_aplicaciones, gastos, devoluciones, devolucion_lineas, profiles, empresas, cliente_pedido_sugerido, unidades, tasas_iva, descarga_ruta, descarga_ruta_lineas, promociones, entregas, entrega_lineas, visitas, tarifas, tarifa_lineas, stock_almacen, stock_apartado, producto_presentaciones, lista_precios, zonas, almacenes, lotes, stock_lotes`.

Estrategias:
- **Delta por `updated_at`** (cursor): `productos, clientes, stock_almacen, stock_apartado`.
- **Ventana 30 días por `updated_at`**: `ventas, cobros` (+ rescate de todas las ventas con saldo > 0).
- **Ventana 30 días por `created_at`**: líneas y documentos transaccionales.
- **Full replace** (`NO_DELTA_TABLES`): empresas, cargas, entregas, tarifas, listas, promociones, lotes, profiles, almacenes, etc., con refresco máximo cada 5 min.
- Aislamiento multi-empresa: `purgeForeignTenantData()` borra todo lo que no sea de la empresa activa y limpia cursores al cambiar de empresa.
- Reemplazo por tabla: **primero descarga, luego borra e inserta** (`paginate()` → `clearLocalScope()` → `bulkPut()`), así una descarga fallida no vacía la tabla.

## 2. Información que faltaba en la copia offline

| Entidad | Estado antes | Riesgo |
|---|---|---|
| `user_roles`, `roles`, `role_permisos` | **No se descargaban** | Sin señal no se podían comprobar permisos |
| Configuración de visibilidad (`empresas.clientes_visibilidad`) | Cacheada, pero con default inseguro | Fuga de cartera completa |
| Manifiesto / estado de preparación | Inexistente | Se operaba sin saber si la copia estaba completa |
| Estado explícito de error en lecturas offline | Inexistente (`catch → []`) | Lista vacía confundida con “no hay datos” |
| Catálogos menores: `clasificaciones, marcas, merma_motivos, devolucion_motivo_config, cat_forma_pago, feature_flags` | No se descargan | Formularios incompletos offline (impacto medio) |
| `cotizacion_lineas` fuera de `TABLES_TO_CACHE` (la tabla local existe) | Parcial | Cotizaciones offline sin líneas |

## 3. Riesgos encontrados (con causa técnica)

| # | Riesgo | Causa exacta | Severidad |
|---|---|---|---|
| R1 | **Escalada de privilegios**: al fallar la consulta de roles el usuario quedaba con acceso total | `usePermisos.ts` ignoraba `error` de `user_roles`; `roleIds.length === 0` → `hasRole:false` → `hasPermiso()` devolvía `true` (“sin rol = acceso total”) | Crítica |
| R2 | **Fuga de clientes**: sin conexión se mostraba la cartera completa | `useDataVisibility.ts` hacía `?? 'todos'` cuando la configuración era desconocida (el comentario decía “propios”, el código decía “todos”) | Crítica |
| R3 | Permisos no operables offline | `usePermisos` era 100% red, sin copia local | Crítica |
| R4 | Promociones omitidas en la venta | `usePromociones` devolvía `[]` ante fallo con caché vacía | Crítica (**ya corregido** en iteración previa: ahora lanza y `useRutaVenta` bloquea el cobro) |
| R5 | Lectura local sin filtro de inquilino | `useOfflineQuery` leía la tabla completa de IndexedDB si la pantalla no filtraba por `empresa_id` | Alta |
| R6 | Snapshot de sesión anterior reutilizable | No se limpiaba nada específico del usuario al cerrar sesión | Alta |
| R7 | Errores silenciosos | `catch { return [] }` / `catch { }` en varios hooks | Alta |
| R8 | Sin señal de “listo para offline” | No existía manifiesto ni validación de completitud | Alta |

## 4. Correcciones aplicadas en esta entrega

Archivos nuevos:
- `src/lib/offlineState.ts` — `OfflineDataState<T>` (`ready | loading | missing | stale | invalid | error`), helpers `isUsable`, `dataOrNull`, `allowIfKnown` (fail-closed) y política de vigencia `MAX_AGE_MS` por entidad.
- `src/lib/offlineSecurity.ts` — snapshot de roles/permisos por `(empresa, usuario)` en IndexedDB, lectura estricta de contexto y purga de snapshots ajenos.
- `src/lib/offlineReadiness.ts` — manifiesto local (`buildOfflineManifest`), bloques críticos/advertencia, `canOperateOffline()` y `blockingReasons()`.
- `src/components/ruta/OfflineReadinessCard.tsx` — estado visible de preparación offline.

Archivos modificados:
- `src/lib/offlineDb.ts` — esquema v13 con store `securitySnapshots`.
- `src/hooks/usePermisos.ts` — **lanza** ante error de servidor (fin de R1), guarda snapshot al obtener respuesta válida, resuelve desde snapshot sin conexión, purga snapshots de otros contextos, `networkMode: 'always'`.
- `src/hooks/useDataVisibility.ts` — default **`propios`** cuando la configuración es desconocida; expone `visibilityKnown` y `blocked`.
- `src/hooks/useClientes.ts` — la lista no se consulta cuando `blocked` (no se puede garantizar el filtrado).
- `src/hooks/useOfflineData.ts` — estados `error`/`isError`/`source`, y filtro por empresa activa en la lectura local.
- `src/contexts/AuthContext.tsx` — purga del snapshot de permisos al cerrar sesión.
- `src/pages/ruta/RutaSincronizarPage.tsx` — tarjeta de preparación offline.

## 5. Matriz de auditoría offline

Leyenda de prioridad: C=crítica, A=alta, M=media, B=baja.

| Módulo | Entidad | Origen servidor | Local | ¿Se descarga? | Completa | Dependencias | Sync | Invalidación | Consumidores | Sin conexión (antes) | Esperado | Cambio | Pri |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Seguridad | Roles/permisos | `user_roles`,`roles`,`role_permisos` | `securitySnapshots` | **Ahora sí** | Sí | — | Snapshot al login/refetch | Realtime + 5 min | Todo | Acceso total por error | Fail-closed + snapshot | Hecho | C |
| Seguridad | Visibilidad clientes | `empresas.clientes_visibilidad` | `empresas` | Sí | Sí | — | Full 5 min | Sync | Clientes, ventas, cobranza | Default `todos` | Default `propios` | Hecho | C |
| Clientes | Clientes y asignaciones | `clientes` | `clientes` | Sí | Sí | zonas, listas, tarifas | Delta `updated_at` | Conteo + 12 h | Ruta, POS, cartera | OK, filtro débil | Bloqueo si no verificable | Hecho | C |
| Promociones | Encabezados y condiciones | `promociones` | `promociones` | Sí | Sí (JSON embebido) | productos, clientes | Full 5 min | Sync | Ventas, POS, ruta | `[]` silencioso | Error explícito + bloqueo | Hecho | C |
| Precios | Tarifas y reglas | `tarifas`,`tarifa_lineas`,`lista_precios` | idem | Sí | Sí | productos, clasificaciones | Full | Sync | Motor de precios | OK | OK | — | C |
| Productos | Catálogo/impuestos | `productos`,`producto_presentaciones`,`unidades`,`tasas_iva` | idem | Sí | Sí | marcas, clasificaciones | Delta/Full | Conteo | Todos | OK | OK | — | C |
| Inventario | Existencias/apartados/lotes | `stock_almacen`,`stock_apartado`,`lotes`,`stock_lotes` | idem | Sí | Sí | almacenes | Delta/Full | Conteo | Ruta, POS | OK | OK | — | A |
| Cartera | Ventas/cobros | `ventas`,`cobros`,`cobro_aplicaciones` | idem | Sí | Ventana 30 d + saldos | clientes | Ventana `updated_at` | Ventana | Cobranza | OK | OK | — | A |
| Logística | Cargas/entregas/descargas | `cargas`,`entregas`,`descarga_ruta` (+líneas) | idem | Sí | Sí | productos | Full | Sync | Ruta | OK | OK | — | A |
| Catálogos | Clasificaciones, marcas, motivos, formas de pago | varias | — | **No** | — | — | — | — | Formularios | Selects vacíos | Cachear | Pendiente F2 | M |
| Cotizaciones | Líneas | `cotizacion_lineas` | Tabla local existe | **No sincroniza** | Parcial | cotizaciones | — | — | Cotizaciones | Sin líneas | Añadir a sync | Pendiente F2 | M |
| Preparación | Manifiesto | derivado | `cacheTimestamps` | **Ahora sí** | Sí | todas | Calculado | En cada revisión | Pantalla sync | Inexistente | Visible | Hecho | A |

## 6. Cobertura offline por módulo

- **Totalmente offline**: ruta móvil (clientes, ventas, cobros, devoluciones, gastos, visitas, entregas, stock del camión).
- **Parcialmente offline**: POS escritorio (lee caché de React Query, no IndexedDB), cotizaciones (sin líneas), inventario (lectura sí, traspasos/ajustes no).
- **Requiere conexión**: compras, facturación CFDI, reportes, configuración, panel super admin, WhatsApp, pagos/suscripción.

## 7. Migración de dispositivos existentes

1. Dexie sube automáticamente a **v13** al abrir la app (agrega `securitySnapshots`, no borra datos existentes).
2. En el primer arranque con conexión, `usePermisos` guarda el snapshot de seguridad del usuario activo.
3. Un usuario que abra la app por primera vez **sin conexión y sin snapshot** verá los módulos bloqueados: debe conectarse una vez. Es el comportamiento deseado (fail-closed).
4. No se requiere borrar caché ni reinstalar la PWA.

## 8. Trabajo pendiente (fases siguientes)

- F2: cachear catálogos menores y `cotizacion_lineas`; manifiesto firmado emitido por el servidor (edge function) con conteos por entidad y hash.
- F3: sincronización incremental con *tombstones* (borrados físicos) en lugar de reconciliación por conteo.
- F4: bloqueo duro de operaciones críticas en ruta usando `canOperateOffline()`; pruebas automatizadas de los escenarios listados (falla a la mitad, IndexedDB corrupta, cambio de usuario, permiso revocado, promoción desactivada offline).
