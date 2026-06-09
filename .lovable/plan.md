## Objetivo

Hacer que `/dashboard` se sienta como un **panel ejecutivo** donde se ve toda la empresa en un solo vistazo: visitas de hoy, entregas de hoy, ventas/cobros del día, stock y cartera — sin tener que bajar a tarjetas largas. Quitar el bloque "Clientes sin visitar — Ingreso en riesgo" que no convence.

## Cambios

### 1. Nueva fila "HOY" (arriba de todo, debajo del header)
Una banda ejecutiva con 6 mini-KPIs siempre de **hoy** (independiente del filtro de fechas), formato compacto tipo "cockpit":

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ HOY · martes 9 jun                                                      │
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐    │
│ │ Visitas  │ Entregas │  Ventas  │  Cobros  │ Pedidos  │  Gastos  │    │
│ │   42     │   28/35  │  $12,400 │  $8,900  │    15    │   $450   │    │
│ │ 8 vend.  │ 80% OK   │ 18 oper. │ 12 mov.  │ pend.    │ 3 mov.   │    │
│ └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Visitas hoy**: count desde `visitas` para `empresa_id` con `fecha = today`.
- **Entregas hoy**: `x/y` donde `x` = entregas con `status='hecho'` y `y` = total programadas hoy. Subtítulo: % completado.
- **Ventas hoy**: total `$` y conteo desde `ventas` con `fecha = today`.
- **Cobros hoy**: total y conteo desde `cobros`.
- **Pedidos pendientes**: ventas tipo `pedido` con saldo pendiente (sin entregar).
- **Gastos hoy**: total y conteo.

Estética ejecutiva: cards más densas, números grandes, etiqueta arriba en `uppercase tracking-wide`, indicador de color (verde/ámbar/rojo) según semáforo del KPI.

### 2. Reemplazar "Clientes sin visitar — Ingreso en riesgo"
Eliminar el bloque actual `ClientesEnRiesgoWidget` del dashboard. En su lugar, agregar un panel ejecutivo de tres columnas con **"Pulso operativo"**:

- **Cumplimiento de ruta hoy**: barra de progreso de entregas hechas vs. programadas + lista compacta de top 3 vendedores con más visitas hoy.
- **Salud financiera**: cartera vencida en `$`, días promedio, top 3 clientes morosos (1 línea cada uno).
- **Inventario crítico**: número de productos bajo mínimo + valor del inventario + 3 alertas principales.

Cada columna en card con número grande arriba, micro-lista debajo. Permite ver "todo el negocio" sin scroll.

### 3. Ajustes visuales para look ejecutivo
- KPI cards principales: cambiar el tile de icono colorido por una franja de color a la izquierda (estilo dashboard financiero), número más grande, jerarquía tipográfica más marcada.
- Quitar el emoji "👍" en alertas de stock; usar microcopy profesional.
- Sticky header de filtros al hacer scroll para que el rango y vendedor siempre estén a la vista.

### 4. Datos / hooks nuevos
Agregar en `src/hooks/useDashboardData.ts`:
- `useDashboardHoy(empresaId)` — un solo hook que devuelve `{ visitas, entregasHechas, entregasTotales, ventasTotal, ventasCount, cobrosTotal, cobrosCount, pedidosPendientes, gastosTotal, gastosCount, topVendedoresHoy }` consultando en paralelo `visitas`, `entregas`, `ventas`, `cobros`, `gastos` con filtro `fecha = today` y `empresa_id`.
- Todas las queries usan `fetchAllPages` y respetan el patrón multi-tenant (queryKey con `empresa_id`).

## Detalles técnicos

- Tablas usadas (ya existentes): `visitas`, `entregas`, `ventas`, `cobros`, `gastos`, `stock_almacen`, `productos`, `cartera` derivada de `ventas`.
- Fecha "hoy" calculada con `todayInTimezone(empresa.zona_horaria)` (ya hay helper en el proyecto).
- El bloque eliminado (`ClientesEnRiesgoWidget`) **no se borra del repo**: sigue disponible y puede seguir usándose en `SupervisorDashboardPage`. Solo se quita del `DashboardPage`.
- Sin cambios de schema/RLS.

## Fuera de alcance
- No tocamos `SupervisorDashboardPage`.
- No cambiamos los gráficos existentes (tendencia de ventas, pie de vendedores, devoluciones) — solo se agregan los bloques nuevos arriba y se reemplaza el bloque de "Clientes en riesgo".

## Validación
- Abrir `/dashboard`: ver la banda "HOY" con datos reales del día.
- Cambiar el rango de fechas: la banda "HOY" no se mueve, los KPIs inferiores sí.
- Confirmar que el bloque "Clientes sin visitar" ya no aparece.
- Probar con vendedor filtrado y sin filtrar.
