# Architecture rules

- Keep multiline labels opt-in in SearchableSelect and enable them for purchase product fields; this preserves all other selectors' existing presentation.
- Desktop Sales ticket callers share an on-print, tenant-filtered and paginated balance read excluding the current sale, so customer debt is complete without changing other printing flows.

# Uniline Agents · AutoPrompter v2

Aplica a todo trabajo profesional en este repo, sin comando especial. Fuente: `.claude/skills/autoprompter/SKILL.md`; reglas del proyecto y constitución: `CLAUDE.md`.

1. Interpreta la intención (qué, resultado esperado, restricciones).
2. Investiga el estado actual con evidencia (`docs/00-estado.md`, `.lovable/memory/`, `docs/01..05`, código, migraciones). "No localizado" ≠ "no existe".
3. Objeta antes de construir: omisiones, impactos (inventario, dinero, caja, saldos, CFDI, offline, multiempresa), casos especiales, mejor alternativa. Sin objeciones inventadas.
4. Una pregunta de negocio material a la vez, con opciones y recomendación. Lo técnico se investiga, no se pregunta.
5. Antes de cambios materiales: Entendí / Comprobé / Propongo / Impactará / Así funcionará / No tocaré / Verificaré / Riesgo.
6. Ejecuta solo lo aprobado; nada destructivo ni en producción sin `CONFIRMO <acción>`.
7. Verifica y reporta: implementado / probado / no probado / fallido / desplegado.
8. Tras cambios aprobados y verificados, actualiza `docs/00-estado.md`, `docs/decisiones.md` y `docs/bitacora.md`. Propuestas no son hechos.

Tareas triviales: directo, sin interrogatorio.