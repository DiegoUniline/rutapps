# Auditoría Offline "a prueba de balas"

Objetivo: garantizar que la app móvil sigue funcionando 100% sin internet (aunque el usuario recargue, cierre o reabra), que el usuario **siempre** vea cuántos cambios tiene pendientes por sincronizar, y que **nada se pueda perder**.

## Estado actual (lo que ya funciona)

- IndexedDB (`offlineDb`) con tablas espejo + `syncQueue` persistente.
- `queueOperation` escribe primero local y encola para servidor (dedupe por tabla+id+op).
- `processSyncQueue` con reintentos exponenciales (5 intentos), dead-letter y upsert ante conflictos.
- Respaldo redundante de la cola en `localStorage` cada 30s (`offlineBackup.ts`) — si IndexedDB se borra, se restaura.
- Service Worker (`vite-plugin-pwa`) registrado solo en producción, fuera de iframes/preview.
- `hasRealConnection()` real (no solo `navigator.onLine`).
- Página `/ruta/sincronizar` muestra contador, último sync, dead-letters y export/import JSON.

## Brechas detectadas (lo que falta)

1. **El contador de pendientes solo se ve en /ruta/sincronizar.** En el resto de pantallas el usuario no sabe cuántos cambios tiene sin sincronizar.
2. **No hay aviso al recargar/cerrar la pestaña** si hay items en la cola — riesgo percibido de pérdida (aunque IDB persista).
3. **No se verifica al arranque** si el respaldo de localStorage tiene más items que IndexedDB (recuperación automática silenciosa).
4. **No hay "health check" visible** que confirme al usuario: "tus N cambios están guardados localmente y se enviarán cuando vuelva la conexión".
5. **Service Worker**: revisar que `NetworkFirst` para HTML y `CacheFirst` para assets hasheados estén activos para que un reload sin internet siga abriendo la app.
6. **Auto-backup**: confirmar que `startAutoBackup()` se llama al montar la app móvil (no solo en `RutaSincronizarPage`).

## Cambios a implementar

### 1. Badge global de pendientes en `MobileLayout`
- Mostrar en el header móvil un chip permanente:
  - Verde `✓ Todo sincronizado` cuando `pendingCount === 0 && isOnline`.
  - Ámbar `↑ N por enviar` cuando `pendingCount > 0`.
  - Rojo `⚠ Sin conexión · N pendientes` cuando `!isOnline`.
- Clickable → navega a `/ruta/sincronizar`.
- Usar `useNetworkStatus()` (ya existe).

### 2. Aviso `beforeunload` con cola pendiente
- En `MobileLayout`, si `pendingCount > 0` interceptar `beforeunload` con mensaje nativo del navegador "Tienes N cambios sin sincronizar".
- No bloquea, solo confirma.

### 3. Recuperación automática al arranque
- En `main.tsx` (o `AuthContext` después de login), llamar:
  - `restoreFromStorageBackup()` siempre (ya es idempotente: solo restaura si IDB está vacío).
  - `startAutoBackup()` para asegurar el respaldo periódico desde el arranque, no solo al abrir la página de sync.
- Log a consola del resultado para diagnóstico.

### 4. Banner persistente "Modo sin conexión"
- En `MobileLayout`, cuando `!isOnline`, mostrar barra superior delgada amarilla:
  - `Sin internet · Tus cambios se guardan en este dispositivo (N pendientes)`.
- Auto-oculta cuando vuelve la conexión y muestra brevemente `✓ Reconectado, sincronizando...`.

### 5. Verificación de Service Worker para reload offline
- Revisar `vite.config.ts` workbox config:
  - `navigateFallback: '/index.html'` con `NetworkFirst` para HTML.
  - Precaching de assets críticos.
- Confirmar que un reload sin red sigue abriendo la app móvil (no la landing).

### 6. Sello "A salvo" en cada acción crítica
- En toasts de crear venta/cobro/entrega offline, añadir sufijo:
  - `Venta guardada · pendiente de enviar (N en cola)`.
- Refuerza confianza del usuario.

### 7. Reporte de auditoría en `/ruta/sincronizar`
- Agregar sección "Diagnóstico":
  - Items en IndexedDB syncQueue.
  - Items en respaldo localStorage.
  - Última fecha de respaldo.
  - Service worker activo: sí/no.
  - Espacio usado (estimate API).
  - Botón "Verificar integridad" que cruza ambas fuentes.

## Detalles técnicos

**Archivos a editar:**
- `src/components/MobileLayout.tsx` — badge global, banner offline, beforeunload.
- `src/main.tsx` — `restoreFromStorageBackup()` + `startAutoBackup()` al arranque.
- `src/pages/ruta/RutaSincronizarPage.tsx` — sección "Diagnóstico".
- `vite.config.ts` — verificar y reforzar config de `VitePWA` (NetworkFirst HTML, navigateFallback).

**Archivos nuevos:**
- `src/components/SyncBadge.tsx` — chip reutilizable con los 3 estados.
- `src/components/OfflineBanner.tsx` — barra superior offline.
- `src/lib/syncDiagnostics.ts` — helpers para integridad y storage estimate.

**Sin cambios en backend/DB.** Todo es frontend + service worker.

## Resultado esperado

- El usuario abre la app sin internet → ve la app cargada (SW), banner amarillo `Sin conexión · 0 pendientes`.
- Hace 3 ventas + 2 cobros → badge muestra `↑ 5 por enviar`, toasts confirman guardado local.
- Recarga la pestaña → app vuelve a cargar offline, badge sigue en `↑ 5`.
- Cierra el navegador y reabre horas después → cola intacta (IDB + respaldo localStorage).
- Vuelve la conexión → banner `✓ Reconectado, sincronizando...`, badge cae a 0, toast `5 cambios enviados`.
