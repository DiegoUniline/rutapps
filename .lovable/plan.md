

## Problema confirmado

La tabla `vendedores` de "Mi Empresa Demo" tiene **4 registros** pero solo **2 son perfiles reales** (Diego y Lucas):

| Tabla | Registros | Detalle |
|---|---|---|
| profiles | 2 | Diego, Lucas |
| vendedores | 4 | Diego + **Ana García, Carlos Mendoza, Roberto Díaz** (huérfanos) |
| cobradores | 1 | Solo Diego (**falta Lucas**) |

Los 3 vendedores huérfanos no tienen perfil asociado — son registros basura que se crearon en algún momento y nunca se limpiaron. Además, **Lucas no existe** en vendedores ni cobradores porque el trigger no lo sincronizó.

Los 15 clientes asignados a esos vendedores huérfanos se dejarán sin vendedor (como indicaste).

---

## Plan

### 1. Limpiar datos en la base de datos
- Quitar `vendedor_id` de los 15 clientes asignados a vendedores huérfanos (Ana, Carlos, Roberto)
- Eliminar los 3 registros huérfanos de `vendedores`
- Insertar a Lucas en `vendedores` y `cobradores`

### 2. Corregir el trigger de sincronización
- Actualizar la función `sync_profile_to_vendedor_cobrador` para que también sincronice cuando se actualice `empresa_id` (actualmente solo se dispara con cambios en `nombre`)
- Agregar validación: no sincronizar si `empresa_id` es NULL

### 3. Sin cambios de código frontend
- Las queries en `useVendedores()`, `useCobradores()` y `useBootstrapPrefetch` ya filtran correctamente por `empresa_id`. El problema es 100% datos sucios en la BD.

