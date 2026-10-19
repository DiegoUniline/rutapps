# Decisiones

## D-001
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Instalar Uniline Agents · AutoPrompter v2 en RutApp, kit completo adaptado (`dist/proyecto` de `DiegoUniline/unilineagents@41adcd9`).
- **Adaptaciones:** fase operación (rebanadas solo para módulos nuevos), stack aprobado, memoria = `docs/` + `.lovable/memory/`, trabajo en rama de sesión (no push directo a `main`).
- **Afecta:** `CLAUDE.md`, `AGENTS.md` (bloque agregado; reglas previas intactas), `.claude/`, `docs/00-estado.md`, `docs/00-mapa.md`, `docs/decisiones.md`, `docs/bitacora.md`, `docs/preguntas.md`.
- **No afecta:** `src/`, `supabase/`, CI, `.lovable/memory/`, `docs/01..05`.

## D-002
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Las migraciones correctivas de producción (huecos de R-010) se entregan como SQL revisado e idempotente y **las ejecuta el dueño** en Supabase SQL Editor; el agente verifica después con SELECT. El agente no aplica cambios de BD por su cuenta.
- **Pendiente:** confirmar con datos si las fallas silenciosas afectan la operación antes de preparar los PR A/B.

## D-003
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Plan de corrección: PR A (código, R-001/R-003…R-006; R-002 excluido para no duplicar facturas) y PR B (SQL de huecos de BD, ejecutado por el dueño según D-002). Las 465 entregas `hecho` sin `fecha_entrega` se rellenan con `validado_at` y, si no hay, `updated_at`.

## D-004
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Para avisos de vencidas y control de crédito, una venta sin `fecha_vencimiento` vence a los **días de crédito actuales del cliente** contados desde su fecha; con `fecha_vencimiento` se usa esa fecha.
- **Evidencia:** producción — 0 clientes con vencidas usando solo `fecha_vencimiento`, 2 914 con esta regla, 3 206 si vencieran el mismo día. 5 671 ventas pendientes sin vencimiento (3 265 contado, 1 506 crédito, 900 por definir).
