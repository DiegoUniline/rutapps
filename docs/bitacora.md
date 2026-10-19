# Bitácora

2026-10-19 · desarrollador · D-001 · Uniline Agents + AutoPrompter v2 instalado (unilineagents@41adcd9), adaptado a RutApp en operación
2026-10-19 · desarrollador · PR #142 (c1a2f8e) · tests priceResolver (fallback precio_principal = final con impuestos, 15→11.97) y fetchAllPages (concurrencia) alineados al código vigente; 310/310 ✅
2026-10-19 · desarrollador · PR #141 (09d675a) · Reporte comisiones: 4 filtros en una fila (select w-auto py-1); verificado con CSS de build en Chromium; producción aún muestra versión anterior (pendiente publicar)
2026-10-19 · desarrollador · PR #140 (7faa193) · merge a main de Uniline Agents · D-001
2026-10-19 · desarrollador · PR #144 (a917cc8) · Reporte comisiones: filtros multiselección (OR dentro, AND entre filtros) y agrupación hasta 3 niveles (Vendedor, Ruta/Zona, Estado cuenta, Estado comisión, Tipo fiscal, Mes; sin Cliente ni Fecha día por decisión del dueño); Excel con subtotales por combinación, PDF plano; 315/315 ✅; no desplegado
2026-10-19 · dueño · Reporte de comisiones (#141, #144) DESPLEGADO en rutapp.mx y validado por el dueño con datos reales
2026-10-19 · auditor · Inventario Fase 1: 18 módulos / 179 tablas (types.ts) / 153 usadas en código; 7 columnas usadas que types.ts no tiene (R-001…R-006), 5 tablas sin migración (R-007); SQL de validación docs/inventario/validar-bd.sql probado en Postgres 16 local
2026-10-19 · dueño+auditor · Validación en producción: 8 columnas usadas por el código NO existen (R-001…R-006 confirmados), 2 RPC NO existen (R-009), 179 tablas = types.ts, 601 migraciones aplicadas vs 701 en repo (R-010), sin tablas sin RLS ni dinero en float
