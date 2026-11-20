# Estado del proyecto — DOCUMENTO VIVO
> Se lee al iniciar cada sesión. Se actualiza tras decisiones confirmadas o cambios verificados (no por consultas).

**Última actualización:** 2026-11-20 · **Agente:** desarrollador (F0 devoluciones y liquidación)

## Dónde vamos
- **Paso:** Operación / evolución — sistema en producción (no aplica Vuelta 0)
- **Módulo en curso:** Migración fuera de Lovable (D-018) + corrección pedido↔entrega↔inventario↔cobros (auditoría 2026-11-19)
- **Última pregunta:** —
- **F0 devoluciones y liquidación:** hecho ([D-050](./decisiones.md#d-050), migración 20261121000000). Siguen F1 devoluciones (D-049: destino por renglón Vendible/Merma en camión, sin «Al almacén» ni «Descuento en venta», cualquier producto sin tope a precio de lista del cliente), F2 cancelación formal de devoluciones, F3 liquidación aprobada congelada y reabrir con permiso y motivo.
- **Siguiente paso exacto:** orden de trabajo F1 devoluciones (D-049); antes, confirmar el 💡 de D-049 (cancelar la venta no cancela la devolución). Pendiente previo: decidir datos históricos (cobros sin aplicar, pagado > total, saldos negativos); luego orden de trabajo por fases: F0 seguridad RPC → F1 saldo único + saldo a favor (D-008, D-020, D-021) → F2 pedido↔entrega → F3 inventario (D-022). Corte a Supabase propio: `docs/migracion-corte.md`.

## Decisiones recientes (últimas 10)
- [D-050](./decisiones.md#d-050) 2026-11-20 · F0 devoluciones y liquidación: devolución de ruta guarda en una transacción; una sola fórmula de efectivo esperado (resta dinero devuelto y reembolsos sin caja); solo supervisores aprueban/cambian liquidaciones; cantidad > 0; ticket crédito sin doble resta.
- [D-049](./decisiones.md#d-049) 2026-11-20 · Devoluciones F1 y liquidación F3: destino por renglón, sin tope a precio de lista, sin «Al almacén» ni «Descuento en venta»; reabrir liquidación aprobada solo con permiso.
- [D-048](./decisiones.md#d-048) 2026-11-20 · Ticket único con diseñador: pantalla, HTML, ESC/POS y nota carta obedecen `ticket_campos` (vista previa real); «Total pagado» solo pagos registrados.
- [D-047](./decisiones.md#d-047) 2026-11-20 · Con búsqueda, relevancia antes que fecha: folio/código exacto (o mismo número) → empieza con → contiene; la página 1 trae la coincidencia exacta.
- [D-044](./decisiones.md#d-044) 2026-11-20 · Lo inactivo no se ofrece para elegir (se conserva marcado «(inactivo)» donde ya estaba); un maestro en uso no se elimina, se desactiva.
- [D-043](./decisiones.md#d-043) 2026-11-20 · «−/+» por caja en renglones por presentación (POS y ruta); teclado con decimales en devoluciones a granel.
- [D-022](./decisiones.md#d-022) 2026-11-19 · Reasignar entrega o cambiar camión siempre mueve stock.
- [D-021](./decisiones.md#d-021) 2026-11-19 · Borrador solo al inicio; confirmada no regresa a borrador, se edita con Editar venta.
- [D-020](./decisiones.md#d-020) 2026-11-19 · Cancelar venta con pagos pregunta: cancelar pago o saldo a favor.
- [D-019](./decisiones.md#d-019) 2026-11-19 · Lo entregado sigue el precio vivo del pedido.

## Propuestas pendientes de aprobación 💡
- (ninguna)

## Pendientes / bloqueos
- Suscripciones, verificación puntual 2026-11-04 23:47 UTC: 48 reemplazos vinculados, activos y desbloqueados en RutApp; Stripe en `trialing` hasta cada corte original; 48 facturas iniciales de total/importe pagado $0, sin cargos desde la creación y sin duplicados activos. Planes, usuarios, descuentos y configuración manual/legacy sin diferencias. No se modificó código, esquema, funciones ni se publicó. Los cobros futuros dependen de la tarjeta y no están probados antes de su fecha.
- Inventario Fase 1 hecho. Producción 2026-10-19: R-001, R-004…R-006 corregidos (PR #148) y **publicado**; Control de descuentos validado por el dueño con datos reales; portal del cliente y alertas WA (edge functions) sin confirmar; R-009 y huecos de R-010 resueltos (PR #150 aplicado por el dueño). Pendientes: PR #149 crédito (en espera de avisar vendedores), R-002, R-013, registrar migraciones en `supabase_migrations`.
- F0 (D-050) — quedó fuera / por revisar: (a) «Al almacén» en ruta sigue sumando al camión (H2; se quita en F1); (b) un reembolso hecho por un admin desde oficina sin caja cuenta en la liquidación de **ese admin**, no del vendedor (la fórmula usa quién registró el reembolso); (c) al cancelar una venta cuya devolución se reembolsó con gasto (origen «devolucion» en cobro_excedentes) el gasto se cancela y ese dinero ya no resta en la liquidación — revisar en F1/F2; (d) antes del corte, contar en producción `devolucion_lineas` con cantidad ≤ 0 (el CHECK nuevo rechazaría esas filas al copiar datos); (e) la pantalla de liquidaciones no oculta Aprobar/Rechazar a quien no tiene permiso: la BD lo rechaza con mensaje.
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
