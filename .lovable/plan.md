# Plan: Módulo de Mermas y Desperdicio

## Decisiones confirmadas
- **Estructura**: 1 almacén global "Mermas" por empresa, cada movimiento rastrea origen (almacén/ruta/usuario).
- **Devoluciones**: el usuario siempre elige destino (Almacén normal o Mermas).
- **Motivos**: configurables por empresa (con set inicial sugerido).
- **Valoración**: reporte muestra costo perdido y precio de venta no realizado.

## 1. Base de datos

**Nuevas columnas:**
- `almacenes.es_merma boolean default false` — marca el almacén especial, oculto en POS/ventas.

**Nuevas tablas:**
- `merma_motivos` — `id, empresa_id, nombre, activo`. Auto-seed: Caducado, Dañado, Robo, Derrame, Quemado, Error de manejo, Otro.
- `mermas` — cabecera: `id, empresa_id, folio (MER-####), fecha, almacen_origen_id, ruta_id (nullable), motivo_id, observaciones, total_costo, total_venta, creado_por, devolucion_id (nullable, link cuando viene de devolución)`.
- `merma_lineas` — `id, merma_id, producto_id, cantidad, costo_unitario, precio_venta_unitario, subtotal_costo, subtotal_venta`.

**Lógica DB:**
- Trigger `ensure_merma_almacen()` que crea el almacén Mermas al crear empresa (y backfill para empresas existentes).
- Trigger en `mermas` (al insertar/cancelar) que mueve stock vía la lógica existente de transferencias: resta de `almacen_origen_id`, suma a almacén Mermas.
- RLS: tenant isolation con `get_my_empresa_id()`.
- Índices por `empresa_id`, `fecha`, `producto_id`.

## 2. Devoluciones (cambio mínimo)

En el modal/flujo de devolución actual añadir selector **"Destino del producto"**:
- `Almacén de venta` (default, recuperable)
- `Mermas` (no recuperable) → genera además un registro en `mermas` con `devolucion_id` enlazado y motivo.

Se respeta el flujo financiero existente; solo cambia a qué almacén regresa el stock.

## 3. UI

**Nueva ruta `/inventario/mermas`** (escritorio):
- Lista con folio, fecha, almacén origen, motivo, total costo, total venta, usuario.
- Filtros: rango de fechas, almacén/ruta, motivo, producto.
- Botón **"Registrar merma"** → modal: almacén origen, motivo, líneas (producto + cantidad), observaciones, foto opcional.
- Detalle por folio con líneas.

**Móvil/ruta `/ruta/mermas`**:
- Botón rápido "Registrar merma" desde el menú de ruta (almacén origen = ruta actual).
- Soporte offline (cola de sincronización como ventas).

**Configuración → Motivos de merma**: CRUD simple.

**Reportes**:
- Nueva pestaña en Reportes: **Mermas** con KPIs (costo perdido, venta no realizada, kg perdidos), top productos, top motivos, por ruta/almacén/usuario.

## 4. Integraciones

- **POS / Ventas**: ocultar almacén Mermas en selectores (`es_merma = false`).
- **Conteo físico**: en la pantalla de reconciliación, agregar acción "Marcar diferencia como merma" que crea registro automático.
- **Kardex**: las salidas a merma aparecen como tipo `MERMA` con folio MER-####.
- **Permisos**: nuevo módulo `mermas` con view/create/delete (delete solo admin con PIN).

## 5. Detalles técnicos

- Folio `MER-####` con secuencia por empresa (mismo patrón que ventas).
- Costo tomado de `producto.costo_promedio` al momento del registro (snapshot).
- Precio de venta del precio principal vigente (snapshot).
- Cancelación de merma: revierte stock, marca `cancelada`, queda en historial.
- Auditoría: `creado_por` desde `profiles`.

## Entregables
1. Migración SQL (tablas, triggers, RLS, seeds, backfill almacén Mermas).
2. Hooks: `useMermas`, `useMermaMotivos`.
3. Páginas: `MermasListPage`, `MermaForm`, `MermaMotivosConfig`, ruta móvil.
4. Modificación de modal de devolución (selector de destino).
5. Tab "Mermas" en Reportes.
6. Filtro `es_merma=false` en selectores de almacén de POS/ventas/transferencias.

¿Aprobamos así o ajustamos algo antes?
