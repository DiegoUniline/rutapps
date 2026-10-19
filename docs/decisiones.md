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
