# Estado del proyecto — DOCUMENTO VIVO
> Se lee al iniciar cada sesión. Se actualiza tras decisiones confirmadas o cambios verificados (no por consultas).

**Última actualización:** 2026-11-19 · **Agente:** auditor/desarrollador

## Dónde vamos
- **Paso:** Operación / evolución — sistema en producción (no aplica Vuelta 0)
- **Módulo en curso:** Migración fuera de Lovable (D-018) + corrección pedido↔entrega↔inventario↔cobros (auditoría 2026-11-19)
- **Última pregunta:** —
- **Siguiente paso exacto:** decidir datos históricos (cobros sin aplicar, pagado > total, saldos negativos); luego orden de trabajo por fases: F0 seguridad RPC → F1 saldo único + saldo a favor (D-008, D-020, D-021) → F2 pedido↔entrega → F3 inventario (D-022). Corte a Supabase propio: `docs/migracion-corte.md`.

## Decisiones recientes (últimas 10)
- [D-044](./decisiones.md#d-044) 2026-11-20 · Lo inactivo no se ofrece para elegir (se conserva marcado «(inactivo)» donde ya estaba); un maestro en uso no se elimina, se desactiva.
- [D-043](./decisiones.md#d-043) 2026-11-20 · «−/+» por caja en renglones por presentación (POS y ruta); teclado con decimales en devoluciones a granel.
- [D-022](./decisiones.md#d-022) 2026-11-19 · Reasignar entrega o cambiar camión siempre mueve stock.
- [D-021](./decisiones.md#d-021) 2026-11-19 · Borrador solo al inicio; confirmada no regresa a borrador, se edita con Editar venta.
- [D-020](./decisiones.md#d-020) 2026-11-19 · Cancelar venta con pagos pregunta: cancelar pago o saldo a favor.
- [D-019](./decisiones.md#d-019) 2026-11-19 · Lo entregado sigue el precio vivo del pedido.
- [D-018](./decisiones.md#d-018) 2026-11-16 · Salir de Lovable: Supabase propio `amybkerwkybffllaxpnz` + Cloudflare; repo desconectado, se trabaja en `main`; integración GitHub→Supabase activa.
- [D-017](./decisiones.md#d-017) 2026-11-04 · Restaurar las 48 suscripciones Stripe canceladas sin cobro inicial, conservando fecha/hora de corte original; ejecutado y verificado 48/48.
- [D-004](./decisiones.md#d-004) 2026-10-19 · Ventas sin `fecha_vencimiento` vencen a los días de crédito del cliente.
- [D-003](./decisiones.md#d-003) 2026-10-19 · Plan de corrección PR A/B; relleno de `fecha_entrega` con `validado_at` → `updated_at`.

## Propuestas pendientes de aprobación 💡
- 💡 Blindaje en BD de borrados (D-044): hoy un DELETE directo por API de un producto/proveedor/lista en uso deja historial en NULL o lo borra en cascada (p. ej. `venta_lineas.producto_id`, `compras.proveedor_id` SET NULL; `venta_linea_lotes`, `lotes`, `stock_almacen` CASCADE). Propuesta: trigger BEFORE DELETE que use `usos_de_registros` (respetando `delete_empresa_cascade`) o FKs RESTRICT. Requiere aprobación.

## Pendientes / bloqueos
- Suscripciones, verificación puntual 2026-11-04 23:47 UTC: 48 reemplazos vinculados, activos y desbloqueados en RutApp; Stripe en `trialing` hasta cada corte original; 48 facturas iniciales de total/importe pagado $0, sin cargos desde la creación y sin duplicados activos. Planes, usuarios, descuentos y configuración manual/legacy sin diferencias. No se modificó código, esquema, funciones ni se publicó. Los cobros futuros dependen de la tarjeta y no están probados antes de su fecha.
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
