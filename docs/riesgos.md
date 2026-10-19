# Riesgos

Formato: `R-XXX · severidad · estado` — evidencia — impacto. Estado ⚠️ = pendiente de confirmar contra BD de producción con `docs/inventario/validar-bd.sql`.

- **R-001 · ALTA · ⚠️** — `src/hooks/useVentas.ts:662` filtra `cfdi_lineas.venta_id`, columna ausente en types.ts (`cfdi_lineas` se liga por `cfdi_id`/`venta_linea_id`); el resultado no revisa `error`. — Se podría eliminar una venta ya facturada.
- **R-002 · ALTA · ⚠️** — `supabase/functions/billing-cycle/index.ts:90` selecciona `subscriptions.stripe_price_id` y `:138` `planes.meses`, ausentes en types.ts; `error` no se revisa. — El día 1 no se generarían facturas de suscripción, sin aviso.
- **R-003 · ALTA · ⚠️** — `ventas.dias_credito` no existe en types.ts (sí en `clientes`); se lee en `src/pages/PuntoVentaPage.tsx:298` y `src/pages/VentaForm/index.tsx:96` sin revisar `error`. — Saldo pendiente y cuentas vencidas del cliente en 0: el control de crédito no bloquea ni avisa.
- **R-004 · MEDIA · ⚠️** — `src/hooks/useControlData.ts:40` usa `ventas.descuento_porcentaje` (types.ts tiene `descuento_total`, `descuento_extra*`). — Control de descuentos > 15 % vacío.
- **R-005 · MEDIA · ⚠️** — `supabase/functions/cliente-portal/index.ts:35` usa `ventas.estado` (la columna es `status`). — Portal del cliente sin ventas.
- **R-006 · BAJA · ⚠️** — `supabase/functions/wa-scheduler-alertas-semanal/index.ts:24` usa `clientes.activo`; `src/components/admin/AdminEmpresaDetail.tsx:193` usa `profiles.rol`. — Alertas semanales sin clientes; lista de usuarios vacía en super admin.
- **R-007 · MEDIA · observado** — 5 tablas sin migración (`auditoria_reparaciones_inventario`, `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails`) y 2 RPC fuera de types.ts. — La BD no es reproducible desde el repo; un entorno nuevo quedaría incompleto.
- **R-008 · BAJA · observado** — `docs/02` (153 tablas vs 179), `README.md` (campos de `productos` eliminados) y `.lovable/memory/architecture/multi-tenant.md` (`stock_camion`, `cobradores`) describen estructura vieja. — Un agente o persona puede construir sobre campos que ya no existen.
