

## Plan: Pedir GPS una sola vez y cachear la ubicación

### Problema
Cada vez que se registra una venta en ruta, el sistema llama a `navigator.geolocation.getCurrentPosition()`, lo que dispara el diálogo del navegador pidiendo permiso de ubicación repetidamente.

### Solución
Crear un servicio singleton de ubicación que pida permiso GPS **una sola vez** al entrar al módulo de ruta, y luego mantenga la posición actualizada en segundo plano con `watchPosition`. Todas las funciones que necesiten GPS simplemente leen la última ubicación conocida sin volver a pedir permiso.

### Cambios

**1. Nuevo archivo `src/lib/locationService.ts`**
- Singleton que usa `navigator.geolocation.watchPosition` para mantener la ubicación actualizada continuamente.
- Expone `getLastKnownLocation()` que retorna `{lat, lng}` o `null` sin prompts.
- Expone `startWatching()` y `stopWatching()` para controlar el ciclo de vida.
- Pide permiso solo al llamar `startWatching()` por primera vez.

**2. Integrar en el layout de ruta (`src/components/MobileLayout.tsx` o similar)**
- Llamar `startWatching()` al montar el layout de ruta (una sola vez al entrar al módulo).
- Llamar `stopWatching()` al desmontar.

**3. Actualizar `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts`**
- Reemplazar `captureGps()` (que llama a `getCurrentPosition`) por `getLastKnownLocation()` del servicio — retorna la ubicación cacheada inmediatamente, sin prompt.

**4. Actualizar `src/pages/ruta/RutaClientes.tsx`**
- Misma lógica: usar `getLastKnownLocation()` en lugar de `getCurrentPosition` para capturar GPS de clientes.

**5. Actualizar `src/pages/ruta/RutaNuevoCliente.tsx`**
- Usar `getLastKnownLocation()` como opción rápida, manteniendo el botón manual como fallback.

### Resultado
El navegador pide permiso GPS **una sola vez** al entrar al módulo de ruta. Todas las ventas, visitas y capturas de ubicación usan la posición más reciente sin interrumpir al usuario.

