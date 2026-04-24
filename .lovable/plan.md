# Problema

Los agentes de ventas de RubiPets (y cualquier rol sin permiso de `dashboard.ver`) parecen quedar bloqueados en el POS. La causa raíz es que **toda la app redirige a `/dashboard` de forma hardcodeada**:

- `src/App.tsx` líneas 500-501: `/` y `/login` → `Navigate to="/dashboard"`
- `src/components/PermissionGuard.tsx` línea 33: cualquier ruta sin permiso → `Navigate to="/dashboard"`

Como `PermissionGuard` también protege `/dashboard`, el usuario sin ese permiso entra en un loop / pantalla en blanco. El POS funciona solo porque lo abren manualmente desde el sidebar.

# Solución

Calcular dinámicamente la **primera ruta accesible** para el usuario según sus permisos y usarla en todos los redirects.

## 1) `src/hooks/usePermisos.ts`

Agregar helper `getFirstAccessibleRoute(hasModulo)` que recorre una lista priorizada de módulos y devuelve la primera ruta cuyo permiso `ver` el usuario tenga:

Orden de prioridad (de más operativo a más administrativo):
1. `dashboard` → `/dashboard`
2. `pos` → `/pos`
3. `ventas` → `/ventas`
4. `clientes` → `/clientes`
5. `logistica.dashboard` → `/logistica/dashboard`
6. `logistica.pedidos` → `/logistica/pedidos`
7. `logistica.entregas` → `/logistica/entregas`
8. `almacen.inventario` → `/almacen/inventario`
9. `catalogo.productos` → `/productos`
10. `reportes.generales` → `/reportes`
11. `configuracion.suscripcion` → `/mi-suscripcion`

Fallback final: `/configuracion-inicial` (siempre accesible).

Exponerlo desde el hook como `firstAccessibleRoute: string` (memoizado).

## 2) `src/components/PermissionGuard.tsx`

- Reemplazar `<Navigate to="/dashboard" replace />` por `<Navigate to={firstAccessibleRoute} replace />`.
- Si la ruta actual ya coincide con `firstAccessibleRoute`, mostrar un mensaje "No tienes acceso a esta sección" en lugar de redirigir (previene loops).

## 3) `src/App.tsx`

- Crear componente interno `HomeRedirect` que use `usePermisos` + `useSubscription` y haga `<Navigate to={firstAccessibleRoute} replace />`.
- Reemplazar las dos rutas hardcodeadas:
  - `<Route path="/" element={<HomeRedirect />} />`
  - `<Route path="/login" element={<HomeRedirect />} />`
- Mantener el comportamiento existente de "solo móvil" (redirect a `/ruta`) y de bloqueo por suscripción (redirect a `/subscription-blocked`) — `HomeRedirect` debe respetarlos primero.

## 4) Verificación

- Owner / super-admin → siguen entrando a `/dashboard` (tienen todos los permisos, dashboard es el primero de la lista).
- Agente de ventas RubiPets (sin dashboard, con POS + ventas + clientes) → entra directo a `/pos`, y el sidebar le permite navegar a Ventas/Clientes sin redirects extraños.
- Usuario "Solo vista móvil" → sigue yendo a `/ruta` (lógica existente intacta).
- Usuario sin ningún permiso → cae en `/configuracion-inicial` con mensaje claro en vez de pantalla en blanco.

# Archivos a modificar

- `src/hooks/usePermisos.ts` — agregar helper + exponer `firstAccessibleRoute`
- `src/components/PermissionGuard.tsx` — usar redirect dinámico
- `src/App.tsx` — `HomeRedirect` para `/` y `/login`

No se requieren cambios de base de datos ni migraciones.
