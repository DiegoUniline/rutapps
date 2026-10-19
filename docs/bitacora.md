# Bitácora

2026-10-19 · desarrollador · D-001 · Uniline Agents + AutoPrompter v2 instalado (unilineagents@41adcd9), adaptado a RutApp en operación
2026-10-19 · desarrollador · PR #142 (c1a2f8e) · tests priceResolver (fallback precio_principal = final con impuestos, 15→11.97) y fetchAllPages (concurrencia) alineados al código vigente; 310/310 ✅
2026-10-19 · desarrollador · PR #141 (09d675a) · Reporte comisiones: 4 filtros en una fila (select w-auto py-1); verificado con CSS de build en Chromium; producción aún muestra versión anterior (pendiente publicar)
2026-10-19 · desarrollador · PR #140 (7faa193) · merge a main de Uniline Agents · D-001
2026-10-19 · desarrollador · PR #144 (a917cc8) · Reporte comisiones: filtros multiselección (OR dentro, AND entre filtros) y agrupación hasta 3 niveles (Vendedor, Ruta/Zona, Estado cuenta, Estado comisión, Tipo fiscal, Mes; sin Cliente ni Fecha día por decisión del dueño); Excel con subtotales por combinación, PDF plano; 315/315 ✅; no desplegado
2026-10-19 · dueño · Reporte de comisiones (#141, #144) DESPLEGADO en rutapp.mx y validado por el dueño con datos reales
2026-10-19 · auditor · Inventario Fase 1: 18 módulos / 179 tablas (types.ts) / 153 usadas en código; 7 columnas usadas que types.ts no tiene (R-001…R-006), 5 tablas sin migración (R-007); SQL de validación docs/inventario/validar-bd.sql probado en Postgres 16 local
2026-10-19 · dueño+auditor · Validación en producción: 8 columnas usadas por el código NO existen (R-001…R-006 confirmados), 2 RPC NO existen (R-009), 179 tablas = types.ts, 601 migraciones aplicadas vs 701 en repo (R-010), sin tablas sin RLS ni dinero en float
2026-10-19 · dueño+auditor · migraciones-nombradas.sql: 100 de 103 migraciones con nombre descriptivo NO registradas en producción (R-010); efecto real pendiente de efectos-migraciones.sql
2026-10-19 · dueño+auditor · efectos-migraciones.sql: 86/96 completas; huecos reales 20260909030000, 20260909040000, 20260909134500; 2 políticas por re-verificar
2026-10-19 · dueño+auditor · políticas: 'Tenant devol motivo config' existe; 'Active app users only' en 31 tablas núcleo, falta en profiles (hueco 20260915222000)
2026-10-19 · dueño+auditor · impacto-actual.sql: R-003 45 ventas vencidas ocultas, R-004 85 descuentos >15% ocultos, 465 entregas sin fecha_entrega, R-001 sin exposición, R-002 sin meses faltantes (facturas vía stripe-webhook/admin-billing)
2026-10-19 · dueño+desarrollador · credito.sql: 62 clientes bloqueados a crédito, 48 al 80 %, 3 206 con aviso de vencidas si sin vencimiento = mismo día; PR #148 detenido hasta decidir la regla
2026-10-19 · dueño · D-004 regla de vencimiento C; contado con saldo: ~98 % sin ningún abono (545 ventas en la última semana), pendiente aclarar si es deuda real
2026-10-19 · desarrollador · PR #148 merged (fac8993); PR #149 crédito en borrador; PR #150 SQL de huecos listo para el dueño; R-013 política profiles excluida
2026-10-19 · dueño · PR #150 aplicado en producción y verificado (7/7 OK, 0 entregas sin fecha); R-009 resuelto
2026-10-19 · dueño · PR #148 publicado en Lovable; Control de descuentos muestra las ventas > 15 % (R-004 resuelto)
