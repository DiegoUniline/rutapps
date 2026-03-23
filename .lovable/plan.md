

## Problema raiz

Hay **dos problemas** que causan que se vean usuarios de otras empresas en los selects de Vendedor/Cobrador:

1. **`useBootstrapPrefetch`** precarga vendedores, cobradores, zonas y almacenes **SIN filtro de empresa_id**. Esto llena el cache de React Query con datos de TODAS las empresas bajo el key `['vendedores']`.

2. **Varias páginas** hacen queries ad-hoc a vendedores/cobradores sin filtrar por empresa:
   - `ComisionesPage.tsx` — `queryKey: ['vendedores']` sin filtro
   - `MonitorRutasPage.tsx` — `queryKey: ['vendedores-monitor']` sin filtro  
   - `SupervisorDashboardPage.tsx` — `queryKey: ['supervisor-vendedores']` sin filtro
   - `useData.ts` → `useAlmacenes()` sin filtro de empresa

Mientras tanto, `useVendedores()` y `useCobradores()` en `useClientes.ts` **ya están bien** (filtran por `empresa_id`), pero usan un cache key diferente `['vendedores', empresa.id]` que no coincide con el prefetch.

### Datos reales en la BD

Para **Mi Empresa Demo**:
- **Profiles (usuarios reales)**: 2 (Diego, Lucas)
- **Vendedores**: 4 (Ana García, Carlos Mendoza, Diego, Roberto Díaz) — registros huérfanos
- **Cobradores**: 1 (Diego)

Los 4 vendedores existen porque el trigger `sync_profile_to_vendedor_cobrador` los creó en algún momento, pero ya no corresponden a perfiles activos.

---

## Plan de corrección

### 1. Corregir `useBootstrapPrefetch.ts`
- Agregar `.eq('empresa_id', eid)` a las queries de vendedores, cobradores, zonas y almacenes
- Cambiar los `queryKey` para que coincidan con los hooks centralizados: `['vendedores', eid]`, `['cobradores', eid]`, `['zonas', eid]`, `['almacenes', eid]`
- Quitar `.eq('activo', true)` de cobradores (como pediste antes)

### 2. Corregir `ComisionesPage.tsx`
- Reemplazar query ad-hoc por `useVendedores()` del hook centralizado

### 3. Corregir `MonitorRutasPage.tsx`
- Reemplazar query ad-hoc por `useVendedores()`

### 4. Corregir `SupervisorDashboardPage.tsx`
- Reemplazar query ad-hoc por `useVendedores()`

### 5. Corregir `useData.ts` → `useAlmacenes()`
- Agregar filtro `.eq('empresa_id', empresa.id)` y key `['almacenes', empresa.id]`

### 6. Verificar `select-plan` edge function
- Corregir el error `supabase.from(...).insert(...).catch is not a function` que aparece en logs (cambiar `.catch(() => {})` por un try/catch)
- Quitar referencia a columna `stripe_price_id` que no existe en `subscriptions`

Con estos cambios, todo el sistema solo mostrará vendedores, cobradores, zonas y almacenes de la empresa del usuario logueado.

