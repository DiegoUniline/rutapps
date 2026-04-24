# Fix: Solo Vista Móvil debe tener prioridad absoluta sobre POS

## Problema
Cuando un rol cambia de "Solo POS" a "Solo Vista Móvil":
1. El permiso `pos.ver` queda residual en `role_permisos`
2. `getFirstAccessibleRoute` itera `ROUTE_PRIORITY` y encuentra `pos` antes de evaluar el flag `solo_movil`
3. Resultado: el usuario es redirigido a `/pos` en vez de `/ruta`

## Solución

### A) Código — `src/hooks/usePermisos.ts`
Modificar `getFirstAccessibleRoute` para que reciba también el flag `roleSoloMovil` y haga short-circuit:

```typescript
export function getFirstAccessibleRoute(
  hasModulo: (m: string) => boolean,
  isSoloMovil: boolean = false
): string {
  // Solo vista móvil tiene prioridad absoluta
  if (isSoloMovil) return '/ruta';
  
  for (const { modulo, path } of ROUTE_PRIORITY) {
    if (hasModulo(modulo)) return path;
  }
  return '/configuracion-inicial';
}
```

Y en el hook:
```typescript
const firstAccessibleRoute = getFirstAccessibleRoute(hasModulo, roleSoloMovil);
```

Buscar también todos los call-sites de `getFirstAccessibleRoute` (probablemente en `App.tsx` o `LoginPage.tsx`) y pasarles el segundo argumento si lo usan directamente.

### B) Base de datos — Limpieza de permisos residuales
Ejecutar (vía migración o insert tool) para todos los roles con `solo_movil = true`:

```sql
-- Eliminar permisos de escritorio que conflictúan con solo_movil
DELETE FROM public.role_permisos rp
USING public.roles r
WHERE rp.role_id = r.id
  AND r.solo_movil = true
  AND rp.modulo IN ('pos', 'dashboard', 'ventas', 'clientes', 'supervisor');

-- Asegurar que tengan solo_movil.ver = true
INSERT INTO public.role_permisos (role_id, modulo, accion, permitido)
SELECT id, 'solo_movil', 'ver', true 
FROM public.roles 
WHERE solo_movil = true
ON CONFLICT (role_id, modulo, accion) DO UPDATE SET permitido = true;
```

## Resultado esperado
- Cualquier rol marcado como `solo_movil = true` redirige a `/ruta` sin importar qué permisos residuales tenga.
- Andrey (y cualquier futuro caso similar) funcionará correctamente al alternar entre tipos de rol.
- Los datos quedan consistentes para todas las empresas.

## Archivos afectados
- `src/hooks/usePermisos.ts` (lógica de routing)
- Migración SQL (limpieza de datos)
