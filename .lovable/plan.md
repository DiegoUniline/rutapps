## Problema

Hoy la PWA registra un Service Worker en el scope `/` (toda la web), incluyendo la landing pública (`/`, `/partners`). Eso provoca dos cosas:

1. El HTML usa NetworkFirst pero con fallback a caché → si la red tarda >3s, sirve la versión vieja.
2. Los chunks JS/CSS usan `StaleWhileRevalidate` → la primera carga después de publicar SIEMPRE muestra la versión anterior; la nueva aparece hasta la segunda visita.

Resultado: visitantes nuevos o recurrentes ven la web vieja hasta que limpian caché.

La PWA y el modo offline son necesarios SOLO dentro de la app (vendedores en ruta, dashboard, etc.), no en las páginas públicas de marketing.

## Solución

Separar claramente "web pública" (siempre fresca, sin SW) de "app PWA" (offline, con SW).

### Cambios

1. **`vite.config.ts` — VitePWA**
   - `injectRegister: false` → Vite ya no auto-registra el SW en cada carga de `index.html`.
   - Mantener `registerType: 'autoUpdate'`, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`.
   - Añadir las rutas públicas al `navigateFallbackDenylist`: `/`, `/partners`, `/precios`, `/blog`, `/legal/*`, etc. (las que correspondan).

2. **Registro manual del SW dentro de la app autenticada**
   - Crear `src/pwa/registerSW.ts` que importe `virtual:pwa-register` y exponga `registerAppSW()`.
   - Llamarlo SOLO desde el layout de la app (p. ej. dentro de `AppLayout` / `ProtectedRoute` / `RutaLayout`), no en `main.tsx`.
   - Así la landing pública nunca instala el SW.

3. **Auto-desregistro en rutas públicas**
   - En `LandingPage` y `PartnersLandingPage`, al montar, si hay un SW previamente instalado (usuarios antiguos), llamar `navigator.serviceWorker.getRegistrations()` → `unregister()` y `caches.keys()` → `caches.delete()`. Una sola vez por sesión.
   - Esto limpia el caché viejo de visitantes que ya tenían el SW global instalado.

4. **Endurecer cache de chunks para la app**
   - En el bloque `runtimeCaching` cambiar JS/CSS de `StaleWhileRevalidate` a `NetworkFirst` con `networkTimeoutSeconds: 3`. Como los nombres de archivo llevan hash, esto sigue siendo rápido y garantiza que al publicar una versión nueva, la próxima carga la traiga.

### Resultado esperado

- **Landing pública (`/`, `/partners`)**: cada visita pide HTML, JS y CSS directo al CDN. Publicas → siguiente refresco ya muestra los cambios. Sin necesidad de borrar caché.
- **App (`/ruta`, `/dashboard`, etc.)**: sigue funcionando como PWA con soporte offline y auto-update.
- **Usuarios antiguos con SW viejo cacheado**: al entrar a la landing se les limpia automáticamente.

### Archivos a tocar

- `vite.config.ts` (config VitePWA)
- `src/pwa/registerSW.ts` (nuevo)
- Punto de montaje de la app autenticada (probablemente `src/App.tsx` o el layout principal) para invocar `registerAppSW()`
- `src/pages/LandingPage.tsx` y `src/pages/PartnersLandingPage.tsx` (unregister defensivo)

No se toca lógica de negocio ni la UI.
