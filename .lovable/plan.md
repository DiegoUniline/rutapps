## Objetivo

Agregar al `/dashboard` una nueva pestaña **"Metas"** que permita configurar y monitorear metas de venta por **vendedor**, **producto** y opcionalmente **presentación**, por **mes**. Conectada al sistema (lee ventas reales para calcular avance %), con historial mes a mes, edición inline, duplicar mes anterior, y ajustes rápidos.

No se modifica nada existente; sólo se agrega una `TabsTrigger`/`TabsContent` nueva y se crean tabla, hooks y componentes nuevos.

## Base de datos

Nueva tabla `metas_venta` (multi-tenant + RLS):

```text
metas_venta
- id uuid PK
- empresa_id uuid (FK empresas)
- vendedor_id uuid (FK profiles) NULL = meta "global empresa"
- producto_id uuid (FK productos) NULL = meta "todos los productos"
- presentacion_id uuid (FK producto_presentaciones) NULL
- periodo_year int, periodo_month int   (UNIQUE composite)
- meta_unidades numeric default 0
- meta_monto numeric default 0
- notas text
- created_by uuid, created_at, updated_at
UNIQUE (empresa_id, vendedor_id, producto_id, presentacion_id, periodo_year, periodo_month)
```

RLS: `empresa_id = (perfil del usuario).empresa_id`. GRANT a authenticated + service_role. Trigger `updated_at`.

Índices: `(empresa_id, periodo_year, periodo_month)`, `(empresa_id, vendedor_id)`.

## Hook nuevo

`src/pages/dashboard/hooks/useMetasVenta.ts`
- Query keyed por `[empresa_id, 'metas-venta', year, month]`.
- Carga metas del mes seleccionado.
- Mutations: `upsertMeta`, `deleteMeta`, `duplicarMesAnterior(year, month)` (copia todas las metas del mes previo al actual).
- `useAvanceMetas(year, month)`: agrega `venta_lineas` filtradas por mes (sumando `cantidad` y `subtotal`) agrupando por `vendedor_id`, `producto_id`, `presentacion_id` para cruzar con metas y devolver `{ meta, real, pct }`.

## Componentes nuevos en `src/pages/dashboard/sections/`

- **`TabMetas.tsx`** — contenedor de la pestaña. Subtabs internos:
  1. **Configuración del mes**: selector de Año/Mes, botón "Duplicar mes anterior", tabla editable (vendedor, producto, presentación opcional, meta unidades, meta monto, notas, acciones eliminar). Botón "+ Agregar meta" abre modal con `SearchableSelect` de vendedor/producto/presentación.
  2. **Avance del mes**: tarjetas resumen (Total meta vs real, % cumplimiento empresa). Tabla por vendedor con barra de progreso, expansible a detalle por producto. Semáforo verde ≥100%, ámbar 70–99%, rojo <70%.
  3. **Historial**: línea de tiempo / tabla por mes de los últimos 12 meses con meta total vs real total y % cumplimiento; click en un mes carga ese mes en "Configuración" para editar.
- **`MetaFormModal.tsx`** — modal para crear/editar una meta (`z-[60]`, max-h-[90vh], centered).

## Integración en `DashboardPage.tsx`

- Importar `Target` (lucide) e import `TabMetas`.
- Agregar `<TabsTrigger value="metas">Metas</TabsTrigger>` junto a las otras pestañas.
- Agregar `<TabsContent value="metas"><TabMetas /></TabsContent>` al final, antes de `</Tabs>`.

No se elimina, renombra ni se mueve nada del dashboard existente.

## Reglas

- Multi-tenant: todas las queries filtran por `empresa_id` y la key de React Query lo incluye.
- Fechas/format: `fmtMoney`, `fmtNum`, DD/MM/YYYY.
- Tabla sin grises (white/primary).
- Modales móviles: `z-[60]`, `max-h-[90vh]`, scroll, centrados.
- Vacíos: "Sin metas configuradas para este mes" con CTA "Duplicar mes anterior" o "Agregar primera meta".
- Permisos: visible para todos los usuarios autenticados de la empresa; edición sólo si tiene permiso `dashboard.edit` (fallback: cualquiera puede editar metas — confirmar con el usuario si quieren restringir).

## Archivos a crear/editar

- Migración: tabla `metas_venta` + GRANTs + RLS + trigger.
- `src/pages/dashboard/hooks/useMetasVenta.ts` (nuevo)
- `src/pages/dashboard/sections/TabMetas.tsx` (nuevo)
- `src/pages/dashboard/sections/MetaFormModal.tsx` (nuevo)
- `src/pages/DashboardPage.tsx` (sólo agrega el trigger y contenido del tab)
