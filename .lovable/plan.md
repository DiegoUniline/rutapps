
## Objetivo

Mejorar la vista actual de **Comisiones generadas** en `/finanzas/comisiones` para que sea fácil filtrar por fecha, ver el detalle de cada comisión y cuánto le toca a cada vendedor según el estado (pendiente / pagada / todas).

El filtro de estado (Pendientes / Pagadas / Todas) y el filtro por vendedor ya existen. Lo que falta es el filtro por fecha y un resumen claro por vendedor.

## Cambios

### 1. Filtro de fechas (rango)
En la barra de filtros del tab "Comisiones generadas":
- Dos inputs `type="date"`: **Desde** y **Hasta**.
- Por defecto: del día 1 del mes actual al día de hoy.
- Botones rápidos: **Hoy**, **Esta semana**, **Este mes**, **Mes pasado**.
- Se aplica al query `venta_comisiones` usando `fecha_venta` (`gte` / `lte`).
- Resetea la paginación al cambiar.

### 2. Resumen por vendedor (arriba de la tabla)
Tarjeta compacta que agrupa los registros filtrados por vendedor:

| Vendedor | # Ventas | Total vendido | Comisión total | Pendiente | Pagada |

- Se calcula client-side a partir del mismo dataset ya filtrado (fecha + vendedor + estado).
- Ordenado por comisión total desc.
- Click en una fila del resumen aplica el filtro de ese vendedor.

### 3. Filtro de estado: aclarar labels
Mantener los tres botones existentes pero con labels más claros:
- **Pendientes** (saldo > 0 / no pagadas)
- **Pagadas** (saldo cero)
- **Todas**

### 4. Total general
Mantener el "Total" actual a la derecha, y añadir junto a él:
- **Total pendiente** y **Total pagado** del rango filtrado.

### 5. Detalle de cada comisión
La tabla ya muestra fecha, folio, vendedor, producto, venta, %, comisión y estado. Añadir:
- Click en el folio → abre la venta correspondiente en nueva pestaña (`/ventas/:id`).
- Tooltip en el estado "Pagada" mostrando fecha de pago (de `pago_comisiones.fecha_corte`).

## Detalles técnicos

- Archivo único a modificar: `src/pages/ComisionesPage.tsx`.
- Query key actualizada: `['venta_comisiones', empresa_id, vendedorFilter, statusFilter, fechaDesde, fechaHasta]`.
- Select agrega `pago_comisiones(fecha_corte)` para el tooltip.
- Resumen por vendedor con `useMemo` sobre `comisiones`.
- Sin cambios de schema, sin migraciones, sin tocar reglas ni el módulo de pagos.

## Fuera de alcance (siguientes pasos)

- Esquemas escalonados por metas semanales.
- Recibos inmutables y cierre de período.
- Cambios en cómo se generan las comisiones.
