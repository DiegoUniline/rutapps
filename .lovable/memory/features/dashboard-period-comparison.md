---
name: Dashboard period comparison
description: Frontend-only KPI comparison vs previous period of equal length
type: feature
---
- `prevRange` se calcula desde `dateRange`: span = (to - from + 1 día), `prevRange = { from: from - span, to: from - 1día }`.
- Hooks `useDashboardVentas/Cobros/Compras/Gastos` se invocan en paralelo con `prevRange`.
- `KpiCard` ya soporta `trend?: number` (flecha ↑/↓ verde/rojo). Se calcula con `((curr - prev) / prev) * 100`.
- Aplicado a: Ventas, Ticket promedio, Cobrado, Compras, Gastos. Sin DB changes.
