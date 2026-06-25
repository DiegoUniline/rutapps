# Plan offline 100% — 6 puntos por fases

Voy a implementar uno a la vez, validando cada uno antes de pasar al siguiente. Te aviso al terminar cada fase y subo la versión (`2026.06.25.13` → `.18`).

---

## Fase 1 — Pantalla "Pendientes de sincronizar" (punto 2)

**Qué hace:** muestra al usuario qué operaciones tiene encoladas y permite actuar.

**Entregables:**
- Nueva ruta `/ruta/pendientes` (móvil) y acceso desde menú móvil.
- Tabla con: tipo (Venta / Cobro / Entrega / Cliente / Visita), folio o referencia, fecha de creación, estado (pendiente / reintentando / **fallida**), # de intentos, último error.
- Acciones por fila: **Reintentar ahora**, **Descartar**.
- Acción global: **Reintentar todo**.
- Badge con contador en el header móvil cuando hay ≥1 pendiente o falla.
- Hook `usePendingQueue()` que lee de `syncQueue` en IndexedDB y se refresca cada 3s.

**Cambios técnicos:**
- `src/lib/syncQueue.ts`: agregar campos `status: 'pending'|'retrying'|'failed'`, `attempts`, `lastError`, `lastAttemptAt`. Backoff exponencial (1s, 5s, 30s, 5m) y marcar `failed` a los 5 intentos.
- `src/pages/PendientesSincronizarPage.tsx` (nueva).
- `src/components/PendingBadge.tsx` para el header.

---

## Fase 2 — Indicador de frescura por tabla (punto 7)

**Qué hace:** el usuario ve "Stock actualizado hace 2h", "Clientes actualizados hace 5m", etc.

**Entregables:**
- Tabla `sync_meta` en IndexedDB (`{ table, lastSyncAt, rowCount }`).
- `offlineSync.ts` escribe ahí al terminar cada tabla.
- Componente `<FreshnessIndicator table="stock_almacen" />` reutilizable (texto + color: verde <1h, amarillo <6h, rojo >6h).
- Sección en `SyncCloudButton` que muestra el detalle por tabla expandible.
- En cabecera de Stock, Cargas, Clientes y Productos: chip de frescura visible.

---

## Fase 3 — Promociones offline al 100% (punto 5)

**Qué hace:** el motor de promociones funciona idéntico con o sin internet.

**Entregables:**
- Agregar `promociones` y `promocion_aplicada` a `MOBILE_QUICK_SYNC_TABLES` y `NO_DELTA_TABLES`.
- Hook `usePromocionesOffline()` con fallback IndexedDB.
- Refactor de `promotionEngine.ts` para aceptar promociones desde cache.
- Test manual documentado: aplicar 3 promos típicas online vs offline y comparar totales.

---

## Fase 4 — Ticket térmico 100% desde IndexedDB (punto 6)

**Qué hace:** el ticket impreso es idéntico online/offline.

**Entregables:**
- Auditar `ThermalTicket` y `useTicketData`: identificar campos que hoy se piden al servidor (saldo anterior, saldo nuevo, datos de empresa, datos de cliente extendidos).
- Calcular `saldo_anterior` y `saldo_nuevo` desde IndexedDB usando cobros y ventas locales del cliente.
- Cachear `empresa` completa (logo, RFC, dirección) en IndexedDB.
- Fallback explícito en cada `useQuery` del ticket con `networkMode: 'always'` + try/catch.
- Marcar visualmente en el ticket "⚠ Datos offline — saldo puede actualizarse al sincronizar" cuando se imprime sin conexión.

---

## Fase 5 — Crear clientes/productos offline robusto (punto 4)

**Qué hace:** crear cliente offline con foto + GPS + tarifa sobrevive sin conexión.

**Entregables:**
- `src/lib/offlineClientes.ts`:
  - Foto: comprimir a base64 con Canvas y guardar en IndexedDB; al subir, convertir a Blob y subir a Storage.
  - GPS: usar última posición de `vendedor_ubicaciones` cacheada si `getCurrentPosition` falla.
  - Tarifa: tomar tarifa por defecto desde IndexedDB.
- Encolar en `syncQueue` con dependencias: primero `clientes.insert`, luego `storage.upload` con el ID local mapeado al real.
- Mismo patrón para productos con foto.
- Test: crear cliente offline → reconectar → validar que aparezca con foto, GPS y tarifa correctos.

---

## Fase 6 — Purge periódico de IndexedDB (punto 8)

**Qué hace:** mantiene la app ligera borrando históricos viejos.

**Entregables:**
- `src/lib/offlinePurge.ts` con reglas:
  - `ventas` y `venta_lineas`: borrar > 6 meses (configurable).
  - `cobros` y `cobro_aplicaciones`: borrar > 6 meses.
  - `movimientos_inventario` y `kardex`: borrar > 3 meses.
  - `visitas`: borrar > 3 meses.
  - **Nunca** borrar pendientes en `syncQueue`.
- Ejecutar al arranque si pasaron >7 días desde el último purge.
- Mostrar en Settings → Offline: "Último purge", "Próximo purge", botón "Limpiar ahora".
- Logging del espacio liberado.

---

## Orden y validación

Ejecuto Fase 1 completa, te muestro, y sigo con la 2, etc. Cada fase es independiente y no rompe la anterior. Versionado:
- F1: `2026.06.25.13`
- F2: `2026.06.25.14`
- F3: `2026.06.25.15`
- F4: `2026.06.25.16`
- F5: `2026.06.25.17`
- F6: `2026.06.25.18`

¿Arranco con la Fase 1?
