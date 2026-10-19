# Estado del proyecto — DOCUMENTO VIVO
> Se lee al iniciar cada sesión. Se actualiza tras decisiones confirmadas o cambios verificados (no por consultas).

**Última actualización:** 2026-10-19 · **Agente:** desarrollador

## Dónde vamos
- **Paso:** Operación / evolución — sistema en producción (no aplica Vuelta 0)
- **Módulo en curso:** —
- **Última pregunta:** —
- **Siguiente paso exacto:** confirmar portal del cliente y alertas semanales de WhatsApp (edge functions); decidir fecha para activar PR #149. Pendiente: P-002 (contrato de respuesta)

## Decisiones recientes (últimas 10)
- [D-004](./decisiones.md#d-004) 2026-10-19 · Ventas sin `fecha_vencimiento` vencen a los días de crédito del cliente.
- [D-003](./decisiones.md#d-003) 2026-10-19 · Plan de corrección PR A/B; relleno de `fecha_entrega` con `validado_at` → `updated_at`.
- [D-002](./decisiones.md#d-002) 2026-10-19 · El dueño ejecuta los SQL correctivos de producción.
- [D-001](./decisiones.md#d-001) 2026-10-19 · Instalar Uniline Agents (kit completo adaptado) con AutoPrompter v2.

## Propuestas pendientes de aprobación 💡
- (ninguna)

## Pendientes / bloqueos
- Inventario Fase 1 hecho. Producción 2026-10-19: R-001, R-004…R-006 corregidos (PR #148) y **publicado**; Control de descuentos validado por el dueño con datos reales; portal del cliente y alertas WA (edge functions) sin confirmar; R-009 y huecos de R-010 resueltos (PR #150 aplicado por el dueño). Pendientes: PR #149 crédito (en espera de avisar vendedores), R-002, R-013, registrar migraciones en `supabase_migrations`.
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
| `docs/01..05` | Arquitectura, esquema BD, rutas, flujos, seguridad | OBSERVADO · `docs/02` OBSOLETO (153 vs 179 tablas) |
| `docs/00-mapa.md` · `docs/riesgos.md` | Inventario Fase 1 y riesgos | OBSERVADO + validado en producción 2026-10-19 (ver estado de cada R-XXX) |
| `.lovable/plan/*.md` | Planes de cambios | PROPUESTO salvo evidencia en código |

## Módulos
Ver [00-mapa.md](./00-mapa.md).
