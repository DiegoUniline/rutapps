---
name: Dashboard extensiones (alertas, meta, equipo, cartera, inventario)
description: Banner de alertas, Meta del mes, KPIs extra (efectividad/cumplimiento/drop/cobertura) y tabs Equipo/Cartera/Inventario añadidos al /dashboard.
type: feature
---
- `empresas.monthly_sales_goal` (NUMERIC) almacena la meta mensual. Editable solo desde la tarjeta de Meta del Mes del dashboard.
- Cálculos:
  - Proyección = ventas_acum / dia_mes * dias_mes
  - DSO = (cartera_total / venta_periodo) * dias_periodo
  - Drop size = ventas_total / visitas_efectivas
  - Cobertura = clientes_con_compra_periodo / clientes_activos
  - Semáforo Equipo: verde si %meta ≥ avance_esperado y cartera_vencida <10% venta; rojo si %meta < 70% esperado o cartera_vencida >25%; ámbar el resto. La meta proporcional se distribuye equitativamente entre vendedores activos.
- Alertas detectadas en cliente: crédito excedido, vendedores sin GPS hoy, facturas a 7 días, pedidos pendientes >24h.
- Aging buckets: 0, 1-30, 31-60, 61-90, 90+ días.
- Componentes en `src/pages/dashboard/sections/` y hooks en `src/pages/dashboard/hooks/`. Todas las queries respetan `empresa_id`.
