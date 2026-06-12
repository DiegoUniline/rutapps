# Plan: Blindaje `empresa_id` en todas las consultas

## Objetivo
Garantizar que ninguna consulta de tablas transaccionales/grandes se ejecute sin `empresa_id`, evitando fugas de datos entre empresas y consultas innecesarias.

## Alcance auditado
- 220 archivos con `.from(...)` en `src/`.
- ~80 archivos sin referencia a `empresa_id` (muchos legítimos: catálogos SAT, perfiles, partners, super admin; otros sí requieren revisión).
- 40+ archivos con `.select('*')`, varios sobre tablas grandes (ventas, entregas, productos, conteos, CFDIs, etc).

## Estrategia (4 capas de defensa)

### 1. Guarda obligatoria de `empresaId`
Crear helper `src/lib/empresaGuard.ts`:
- `assertEmpresa(empresaId)` → throw si null/undefined (uso en hooks/exports).
- `requireEmpresa(empresaId)` → retorna `string` o `null` para `enabled` de React Query.

Reglas:
- Todo hook con React Query: `enabled: !!empresaId && (enabled ?? true)`.
- Toda función imperativa (export, prefetch, edge call): `assertEmpresa(empresaId)` al inicio.
- `queryKey` SIEMPRE incluye `empresaId` como segundo elemento (ya es regla, validar).

### 2. Filtro en origen (`.eq('empresa_id', ...)`)
Auditar y corregir por módulo:

**Críticos a revisar/corregir:**
- `src/hooks/useLogistica.ts`, `useFavorites.ts`, `usePermisos.ts`, `usePartner.ts`, `useEmpresaJornadaConfig.ts`, `useDataVisibility.ts`
- `src/pages/dashboard/hooks/useMonthlyGoal.ts`
- `src/pages/ConteoFisicoPage.tsx`, `AuditoriaConteoPage.tsx`, `EntregaFormPage.tsx`, `ListasPrecioListPage.tsx`, `EntregasPage.tsx`
- `src/pages/logistica/PedidosPendientesPage.tsx`
- `src/pages/CompraForm/CompraPagosTab.tsx`, `compras/CompraExpandedRow.tsx`
- `src/pages/traspasos/TraspasoExpandedRow.tsx`
- `src/components/venta/VentaHistorialTab.tsx`, `VentaDevolucionesTab.tsx`
- `src/components/conteos/ConteoDetailModal.tsx`, `ConteoKardexModal.tsx`
- `src/components/cobranza/CobroEditDialog.tsx`
- `src/components/reportes/ReportePromociones.tsx`, `EntityMultiSelect.tsx`
- `src/components/comisiones/ComisionesReglasTab.tsx`
- `src/components/facturacion/CfdiHistory.tsx`
- `src/components/auditorias/AuditoriaMovimientosModal.tsx`

**Excluidos legítimamente (no requieren `empresa_id`):**
- Catálogos SAT (`cat_*`, `unidades_sat`, `tasas_*`).
- Tablas de super admin (`super_admins`, `subscription_plans`, `trial_blacklist`).
- `profiles` filtrado por `user_id`.
- Páginas públicas (signup, partners landing, completar registro, force change password).

Para cada archivo "sin empresa_id" se decide: agregar filtro o documentar la exclusión con comentario `// empresa_id N/A: razón`.

### 3. Columnas explícitas (eliminar `.select('*')`)
Reemplazar `*` por columnas necesarias en tablas grandes/anchas:
- `productos` (54 cols), `clientes` (43), `cfdis` (37), `ventas` (32), `proveedores` (24), `venta_lineas` (24), `caja_turnos` (23), `auditorias` (16), `entregas` (19), `compras` (17).

Archivos prioritarios:
- `useVehiculos.ts`, `useUsuarios.ts`, `useRoles.ts`, `usePromociones.ts`, `usePresentaciones.ts`, `useNotifications.ts`, `useFavorites.ts`, `useCajaTurno.ts`
- `ClienteFormPage.tsx`, `CfdiFormPage.tsx`, `EntregasPage.tsx`, `PuntoVentaPage.tsx`, `ProveedorFormPage.tsx`, `TraspasoFormPage.tsx`, `TarifaFormPage.tsx`, `AlmacenesPage.tsx`, `ReportesPersonalizadosPage.tsx`, `AuditoriaResultadosPage.tsx`, `HomologacionCatalogoPage.tsx`, `MiSuscripcionPage.tsx`
- `lib/ventaPdfFromId.ts`
- Componentes admin (`AdminSubscriptionsTab`, `AdminPosTab`, `AdminCuponesTab`, etc.) sólo cuando aplique al panel de empresa, no al super-admin global.

Quedan permitidos `*` en tablas pequeñas catálogo (<10 cols, <1000 filas).

### 4. Exports y Prefetch
- **Exports Excel/PDF** (`src/components/ExportButton.tsx` y exports inline):
  - Aplicar `empresa_id` + filtros activos.
  - Usar `fetchAllPages` con `assertEmpresa`.
  - Nunca exportar sin empresa activa.
- **Prefetch PWA** (`useBootstrapPrefetch`, `useOfflineData`):
  - Verificar `empresa_id` antes de cada `prefetchQuery`.
  - Confirmar que cada `fetchAllPages` incluye `.eq('empresa_id', empresaId)`.

## Hardening adicional

### Linter local
Agregar regla custom (script Node) `scripts/audit-empresa-filter.ts` que escanea `src/` y reporta:
- `.from('<tabla_grande>')` sin `.eq('empresa_id'` en el mismo bloque.
- `.select('*')` en tablas listadas como anchas.
- Hooks con `useQuery` sin `empresaId` en `queryKey`.

Salida: reporte markdown en consola. Se ejecuta manualmente; opcional en CI.

### Documentación
Actualizar `mem://architecture/multi-tenant` con:
- Lista de tablas que SIEMPRE requieren `empresa_id`.
- Lista de excepciones documentadas.
- Patrón obligatorio: guarda → queryKey → `.eq('empresa_id')` → `fetchAllPages` → columnas específicas.

## Entregables y orden
1. `src/lib/empresaGuard.ts` (helper).
2. Refactor hooks críticos por lote (logística, dashboard, conteo, ventas, entregas, cobranza, facturación, reportes, homologación).
3. Refactor `.select('*')` en tablas anchas.
4. Refactor exports e inline downloads.
5. Refactor prefetch PWA + offlineData.
6. Script `scripts/audit-empresa-filter.ts` + corrida final con 0 hallazgos críticos.
7. Actualizar memoria `multi-tenant` y `data-fetching-pagination`.
8. Verificación: build OK + smoke tests en `/dashboard`, `/ventas`, `/cobranza`, `/almacen/inventario`, `/logistica/concentrado`, `/reportes`, `/configuracion/homologacion`, `/supervisor`, app móvil `/ruta`.

## Notas técnicas
- No tocar RLS ni migraciones: el filtro `empresa_id` complementa RLS (defensa en profundidad).
- No tocar `src/integrations/supabase/client.ts` (auto-gen).
- Mantener el patrón `fetchAllPages((from,to) => qb.range(from,to))` ya estandarizado.
- En cada `useQuery`: `queryKey: ['recurso', empresaId, ...filtros]`, `enabled: !!empresaId`.
- Conservar accesos legítimos sin `empresa_id` (catálogos SAT, super-admin, páginas públicas) con comentario explicativo.

## Riesgos
- Romper hooks que asumían carga sin empresa → mitigado con `enabled` y estados de carga.
- Falsos positivos del linter → lista blanca de tablas excluidas en el script.
- Exports masivos con muchas filas → ya cubierto por `fetchAllPages` con `safetyCap`.
