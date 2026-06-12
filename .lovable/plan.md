
## Objetivo

Eliminar el límite implícito de 1000 filas de Supabase en todo el sistema, aplicando paginación con `fetchAllPages` donde se necesite el dataset completo, y server-side pagination donde solo se muestra una lista. Validar móvil y escritorio.

## Diagnóstico

Tras escanear el repo, los hooks/páginas que consultan tablas de gran volumen sin paginación (las que ya truncan o pueden truncar al pasar 1000 filas) son:

**Críticos — cálculos/reportes incompletos hoy:**
- `src/hooks/useVentas.ts` (lista global de ventas usada en varios resúmenes)
- `src/hooks/useEntregas.ts` (entregas + entrega_lineas para reportes)
- `src/hooks/useBootstrapPrefetch.ts` y `src/hooks/useOfflineData.ts` (prefetch PWA — móvil falla con catálogos grandes)
- `src/lib/reportesPersonalizados.ts` (reportes a la medida)
- `src/lib/catalogMatcher.ts` (homologación con catálogos > 1000)
- `src/pages/configuracion/HomologacionCatalogoPage.tsx`
- `src/pages/DemandaPage.tsx` (demanda / consumos históricos)
- `src/pages/SupervisorDashboardPage.tsx`
- `src/pages/MapaVentasPage.tsx` y `src/pages/MonitorRutasPage.tsx` (marcadores incompletos)
- `src/pages/inventario/InventarioInteligenciaTab.tsx`
- `src/pages/logistica/ConcentradoSurtidoPage.tsx` y `LogisticaReportesPage.tsx`
- `src/pages/dashboard/hooks/useDashboardAlertas.ts`, `useDashboardInventarioCamion.ts`, `useDashboardExtra.ts`, `useDashboardEquipo.ts`

**Medio — listas paginadas en UI pero con export/acciones masivas que sí necesitan todo:**
- Exportar Excel/PDF desde `ProductosListPage`, `ClientesListPage`, `VentasListPage`, `CobranzaPage`, `EntregaListPage`, `CompraExpandedRow`, `ConteoFisicoPage`.

**Bajo — listas naturalmente acotadas (catálogos < 1000):** zonas, marcas, vehículos, almacenes, tarifas. No se tocan.

## Plan de acción

### 1. Endurecer `fetchAllPages`
Archivo: `src/lib/supabasePaginate.ts`
- Agregar `safetyCap` (default 200 000) y un `console.warn` si se alcanza, para evitar memory blow-ups.
- Exponer variante `fetchAllPagesById(table, select, filter)` que pagine por keyset (`order('id').gt('id', lastId)`) — más eficiente para tablas grandes; usada en los hooks pesados (ventas, entregas, movimientos_inventario).

### 2. Refactor de hooks críticos
Para cada query a `ventas / venta_lineas / entregas / entrega_lineas / cobros / cobro_aplicaciones / movimientos_inventario / stock_almacen / productos / clientes / visitas / cliente_orden_ruta / compra_lineas`, sustituir el `.select(...).eq(...)` directo por `fetchAllPages((from,to) => qb.range(from,to))` o por keyset.

Archivos a actualizar (mismo patrón en todos):
- `useVentas.ts`, `useEntregas.ts`, `useBootstrapPrefetch.ts`, `useOfflineData.ts`
- `useDashboardAlertas.ts`, `useDashboardInventarioCamion.ts`, `useDashboardExtra.ts`, `useDashboardEquipo.ts`
- `SupervisorDashboardPage.tsx`, `MapaVentasPage.tsx`, `MonitorRutasPage.tsx`
- `inventario/InventarioInteligenciaTab.tsx`
- `logistica/ConcentradoSurtidoPage.tsx`, `logistica/LogisticaReportesPage.tsx`
- `DemandaPage.tsx`, `configuracion/HomologacionCatalogoPage.tsx`
- `lib/reportesPersonalizados.ts`, `lib/catalogMatcher.ts`

### 3. Exports y acciones masivas
En cada `ExportButton` de listas paginadas (productos, clientes, ventas, cobranza, entregas, conteos, compras), ejecutar `fetchAllPages` con los mismos filtros activos al momento del click — no exportar solo la página visible. Mostrar toast de progreso para datasets > 5 000.

### 4. Mejoras de rendimiento asociadas
- **Selects acotados:** revisar selects con `*` o joins pesados (p. ej. `venta_lineas(*, productos(*))`) y reducir a las columnas que la vista realmente usa, para que paginar todo el dataset no explote la memoria.
- **`staleTime` razonable** en queries de catálogos grandes (60 s+) para no repaginar en cada render.
- **`useMemo`** en agregaciones que ya recibirán arrays grandes.
- **Índices DB:** verificar índices en columnas usadas para keyset (`empresa_id, id`, `empresa_id, fecha`). Si falta alguno, migración aparte (no incluida aquí, se evalúa después con `supabase--slow_queries`).

### 5. Guardarraíl para el futuro
- Añadir comentario `// FORBIDDEN: bare .select() sobre tablas transaccionales — usa fetchAllPages` en `src/lib/supabase.ts`.
- Memory note en `mem://architecture/data-fetching-pagination` (ya existe) — actualizar con la lista de tablas que SIEMPRE requieren paginación.

### 6. Verificación
- Build + smoke test móvil/escritorio en: `/almacen/inventario`, `/ventas`, `/cobranza`, `/logistica/concentrado`, `/dashboard`, `/supervisor`, `/configuracion/homologacion`, `/almacen/demanda`, `/reportes`.
- Probar export de productos y ventas con dataset grande (verificar que descarga > 1000 filas).
- Validar prefetch PWA: cerrar sesión, ingresar como usuario móvil, ver que se cargan todos los clientes/productos.

## Notas técnicas

- `fetchAllPages` mantiene firma actual; nuevos helpers son aditivos.
- Cambios son client-side; no se modifican migraciones ni RLS.
- No se tocan listas con paginación server-side ya correcta (`useProductosPaginated`, etc.) salvo su export.

## Alcance

~25 archivos editados, sin cambios de UI ni de esquema. Riesgo bajo: el patrón `fetchAllPages` ya está probado en producción (devoluciones, cargas, logística).
