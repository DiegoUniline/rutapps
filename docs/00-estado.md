# Estado del proyecto — DOCUMENTO VIVO
> Se lee al iniciar cada sesión. Se actualiza tras decisiones confirmadas o cambios verificados (no por consultas).

**Última actualización:** 2026-10-19 · **Agente:** desarrollador (instalación Uniline Agents)

## Dónde vamos
- **Paso:** Operación / evolución — sistema en producción (no aplica Vuelta 0)
- **Módulo en curso:** —
- **Última pregunta:** —
- **Siguiente paso exacto:** atender la siguiente solicitud del dueño con el AutoPrompter (`.claude/skills/autoprompter/SKILL.md`)

## Decisiones recientes (últimas 10)
- [D-001](./decisiones.md#d-001) 2026-10-19 · Instalar Uniline Agents (kit completo adaptado) con AutoPrompter v2.

## Propuestas pendientes de aprobación 💡
- (ninguna)

## Pendientes / bloqueos
- Inventario Uniline (`/inventario`) de RutApp no ejecutado: los módulos no tienen ficha en `docs/modulos/`. El conocimiento vive en las fuentes de abajo.
- Validar el AutoPrompter con una solicitud real (comportamiento del modelo no probado; solo integración documental y hooks).

## Fuentes de conocimiento vigentes
| fuente | contenido | estado |
|---|---|---|
| `AGENTS.md` · Architecture rules | SearchableSelect multilinea opt-in; saldo en ticket de Ventas escritorio | APROBADO |
| `.lovable/memory/architecture/multi-tenant.md` | Filtro `empresa_id` en origen, guards, queryKey | APROBADO |
| `.lovable/memory/architecture/inventory-db-triggers.md` | `fn_sync_venta_inventario` por delta, idempotente | APROBADO |
| `.lovable/memory/architecture/data-fetching-pagination.md` | `fetchAllPages`, tablas paginadas | APROBADO |
| `.lovable/memory/architecture/code-quality.md` | Sin `any`, sin `console.log`, tests de dinero | APROBADO |
| `.lovable/memory/design/pdf-bn-standard.md` | PDFs B/N corporativos (excepto CFDI) | APROBADO |
| `.lovable/memory/features/*.md` | Cotizaciones, dashboard, comparación de periodo, solicitudes de traspaso | APROBADO |
| `docs/01..05` | Arquitectura, esquema BD, rutas, flujos, seguridad | OBSERVADO (contrastar vigencia con código/migraciones) |
| `.lovable/plan/*.md` | Planes de cambios | PROPUESTO salvo evidencia en código |

## Módulos
Ver [00-mapa.md](./00-mapa.md).
