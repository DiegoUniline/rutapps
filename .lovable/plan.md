
## Alcance estricto
Todo el trabajo se hace dentro de `src/pages/DashboardPage.tsx` y nuevos archivos auxiliares (hooks y componentes en `src/pages/dashboard/...`). No se elimina, renombra ni reordena nada existente: la fila HOY, Asesor IA, tarjetas KPI, gráficas y tabs actuales quedan intactos. Filtros globales de fecha/vendedor existentes alimentan también las secciones nuevas.

## 1. Cambios de base de datos
- Migración: agregar `monthly_sales_goal NUMERIC DEFAULT 0` en `empresas` (editable por admin desde Configuración existente, fuera de scope visual; el dashboard solo lee y muestra CTA si =0).
- Nuevas RPCs en `public` (security definer, filtran por `empresa_id` del caller vía `current_setting` o param y respetan RLS):
  - `dashboard_alertas(empresa uuid)` → conteos: clientes sobre límite de crédito, vendedores sin GPS hoy, facturas que vencen 7 días, pedidos pendientes >24h, más arrays de IDs/nombres para los modales detalle.
  - `dashboard_equipo(empresa uuid, desde date, hasta date)` → por vendedor: venta, cobrado, cartera_vencida, visitas_realizadas, visitas_planeadas, ventas_con_pedido, margen.
  - `dashboard_aging(empresa uuid)` → buckets 0, 1-30, 31-60, 61-90, 90+ con monto y # clientes; lista vencidos con días vencido.
  - `dashboard_inventario_camion(empresa uuid)` → por almacén tipo ruta: valor cargado, vendido, faltante; totales de mermas/ajustes del periodo.
- Índices auxiliares si faltan: `ventas(empresa_id, fecha)`, `visitas(empresa_id, fecha)`, `cobros(empresa_id, fecha)`, `mermas(empresa_id, fecha)`.

## 2. Hooks nuevos (`src/pages/dashboard/hooks/`)
- `useDashboardAlertas(empresaId)` → React Query, key incluye `empresa_id`.
- `useMonthlyGoal(empresaId)` → lee `empresas.monthly_sales_goal`.
- `useDashboardEquipo(empresaId, range, vendedorId)`.
- `useDashboardCartera(empresaId)` y `useDashboardAgingDetalle(empresaId)`.
- `useDashboardInventarioCamion(empresaId, range)`.
- Reutilizan datos existentes (`useDashboardHoy`, hooks de ventas) cuando aplica para no duplicar.

## 3. Componentes nuevos (`src/pages/dashboard/sections/`)
- `AlertasBanner.tsx` — franja colapsable con chips rojo/ámbar y modal de detalle por tipo. Si `total = 0` muestra línea verde "Sin alertas activas".
- `MetaDelMesCard.tsx` — barra de progreso, proyección de cierre, mini indicadores (margen $/%, % recuperación, flujo neto). CTA "Configurar meta" cuando no hay meta.
- `KpiExtras.tsx` — 4 tarjetas nuevas (Efectividad, Cumplimiento ruta, Drop size, Cobertura) con mismo `KpiCard` actual; se inyectan al final de la cuadrícula existente vía un fragmento adicional.
- `DevolucionesSubPct` — pequeño helper que añade el subtexto "% sobre venta" a la tarjeta existente (modificación mínima de una línea del subtexto, sin tocar layout).
- `TabEquipo.tsx`, `TabCartera.tsx`, `TabInventario.tsx` — contenido de los 3 tabs nuevos.
- `ClientesSinCompraModal.tsx`, `AlertaDetalleModal.tsx`, `CarteraExportButton.tsx` (CSV via util existente).

## 4. Integración en `DashboardPage.tsx`
- Insertar `<AlertasBanner />` entre `<HoyBand />` y el Asesor IA.
- Insertar `<MetaDelMesCard />` justo después del Asesor IA y antes de la cuadrícula KPI existente.
- En la cuadrícula KPI (sin reordenar las existentes), agregar 4 `<KpiCard />` nuevas al final; ajustar wrap a `xl:grid-cols-6` solo si ya está controlado por flex/grid responsivo actual (sin alterar las existentes).
- En `<TabsList />` agregar 3 `<TabsTrigger value="equipo|cartera|inventario">` con iconos consistentes.
- Agregar 3 `<TabsContent>` con los componentes nuevos.

## 5. Lógica y reglas
- Proyección cierre = `venta_acumulada / dias_transcurridos * dias_mes` con guard contra división por cero.
- Semáforo equipo:
  - verde: `%meta ≥ avance_esperado` y `cartera_vencida < 10% venta`
  - rojo: `%meta < 70% avance_esperado` o `cartera_vencida > 25% venta`
  - ámbar: resto.
- DSO = `cartera_total / venta_periodo * dias_periodo` con guard.
- Drop size = `venta_total / visitas_efectivas`.
- Cobertura = `clientes_con_compra_en_rango / clientes_activos_totales` (un cliente "activo" = `clientes.status='activo'`).
- Todos los números pasan por `fmtMoney`/`fmtNum`; nunca NaN/undefined; estado vacío "Sin datos en este periodo".

## 6. UI/UX
- Reusar `Card`, `KpiCard`, `Tabs`, `Skeleton`, `Progress`, `Dialog` existentes.
- Tarjetas blancas con borde suave, gap-4/gap-6, mismo grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` para KPIs (ya existente). Sin grises sólidos.
- Skeleton loaders en cada tarjeta/tabla nueva mientras cargan.
- Modales en `z-[60]`, `max-h-[90vh]`, centrados (regla mobile).

## 7. Memoria
- Guardar memoria `features/dashboard-extensiones` con: alertas, Meta del mes (campo `empresas.monthly_sales_goal`), KPIs extras, tabs Equipo/Cartera/Inventario.

## Archivos a crear / editar
```
supabase migration  (monthly_sales_goal + 4 RPCs + índices)
src/pages/dashboard/hooks/useDashboardAlertas.ts
src/pages/dashboard/hooks/useMonthlyGoal.ts
src/pages/dashboard/hooks/useDashboardEquipo.ts
src/pages/dashboard/hooks/useDashboardCartera.ts
src/pages/dashboard/hooks/useDashboardInventarioCamion.ts
src/pages/dashboard/sections/AlertasBanner.tsx
src/pages/dashboard/sections/MetaDelMesCard.tsx
src/pages/dashboard/sections/KpiExtras.tsx
src/pages/dashboard/sections/TabEquipo.tsx
src/pages/dashboard/sections/TabCartera.tsx
src/pages/dashboard/sections/TabInventario.tsx
src/pages/dashboard/sections/AlertaDetalleModal.tsx
src/pages/dashboard/sections/ClientesSinCompraModal.tsx
src/pages/DashboardPage.tsx  (solo inserciones aditivas)
```

¿Apruebas para construirlo así?
