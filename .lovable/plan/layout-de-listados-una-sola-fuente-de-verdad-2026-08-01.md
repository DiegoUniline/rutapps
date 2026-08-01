# Layout de listados: una sola fuente de verdad

## Diagnóstico de arquitectura

No existe hoy un `PageLayout` / `CrudLayout` compartido. Lo que hay es:

- `AppLayout` — shell global (sidebar, barra superior, breadcrumb, footer). Ya resuelve altura y evita el scroll del documento.
- `OdooTabs`, `GroupedTableWrapper`, `StickyListToolbar`, `OdooPagination` — piezas sueltas que cada página compone a mano.

Por eso cada vista repite `p-4 space-y-4`, `overflow-auto`, alturas propias, etc. Hay **37 vistas de listado con tabla** en escritorio (Clientes, Productos, Ventas, Cotizaciones, Compras, Inventario, Lotes, Kardex, Traspasos, Entregas, Devoluciones, Proveedores, Tarifas, Listas de precio, Promociones, Cuentas por cobrar/pagar, Almacenes, Vehículos, Jornadas, Demanda, Auditorías, Reportes, etc.).

## Componente base propuesto

Un único módulo `src/components/layout/ListPage.tsx` con tres piezas compuestas:

```text
<ListPage>                 -> columna 100% alto, sin scroll propio
  <ListPage.Header>        -> título + acciones (fijo)
  <ListPage.Toolbar>       -> búsqueda, filtros, paginación (fijo)
  <ListPage.Body>          -> ÚNICO contenedor con scroll (vertical + horizontal)
  <ListPage.Footer>        -> totales / statusbar opcional (fijo)
```

Todas las clases de layout (`h-full`, `min-h-0`, `flex-1`, `overflow-auto`, `overflow-hidden`, sticky del `thead`, padding) viven **solo** dentro de ese archivo. Las páginas no vuelven a escribirlas.

Complementos, en el mismo archivo:

- `ListPage.Body` aplica por CSS el `position: sticky` al `thead` de cualquier `<table>` que contenga, sin tocar las tablas.
- `fill` en `OdooTabs` y `GroupedTableWrapper` pasa a ser el comportamiento por defecto cuando están dentro de `ListPage`, vía contexto — sin props nuevas en cada vista.

## Alcance del cambio

1. Crear `src/components/layout/ListPage.tsx` (nuevo, ~120 líneas).
2. Migrar `ClientesListPage` (piloto ya hecho a mano) para que consuma el componente y **borre** su layout duplicado.
3. Migrar el resto de vistas de listado: cambio mecánico de envoltorio (`<div className="p-4 space-y-4">` → `<ListPage>` + subcomponentes). No se toca lógica, queries, columnas ni handlers.
4. Vistas fuera de alcance (no son listados de escritorio): formularios, páginas públicas, landing, rutas móviles, dashboards con mapas.

Resultado: **37 vistas dejan de tener layout duplicado**; cualquier ajuste futuro de altura, scroll o distribución se hace en 1 archivo.

## Detalles técnicos

- `AppLayout` ya deja `main` como `flex-1 min-h-0 overflow-y-auto`; se cambia a `overflow-hidden` cuando el hijo es un `ListPage` (detectado por contexto), de modo que el scroll quede exclusivamente en `ListPage.Body`. Páginas que no usan `ListPage` conservan el scroll de `main` — compatibilidad total.
- Sin alturas fijas ni `calc()`: todo por cadena flex `#root → AppLayout → main → ListPage → Body`.
- En móvil, `ListPage.Body` sigue siendo el contenedor de scroll, así que las tarjetas responsive no cambian.
- Migración incremental: se puede hacer por lotes; las vistas no migradas siguen funcionando igual.
