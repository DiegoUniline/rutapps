# Decisiones
(Extracto: 6 de 30)

### D-001 · visión · 2026-11-10
**Decisión:** Un solo negocio, sin multiempresa.
**Origen:** P-001
**Consecuencias:** tablas sin `empresa_id`; seguridad por rol (dueño/cajero).

### D-008 · caja-chica · 2026-11-11
**Decisión:** GASTOS sin "notas"; se agrega `recibio` (texto, opcional).
**Origen:** P-008
**Consecuencias:** columna `recibio text`; campo en formulario y detalle.

### D-011 · caja-chica · 2026-11-11
**Decisión:** Los gastos nunca se borran; el dueño los cancela con motivo y el monto regresa al saldo.
**Origen:** P-010, P-011
**Consecuencias:** estados registrado/cancelado; función `cancelar_gasto`; sin política de DELETE.

### D-015 · caja-chica · 2026-11-11
**Decisión:** Comprobante obligatorio desde $200.
**Origen:** P-015
**Consecuencias:** CHECK en BD + validación en formulario.

### D-024 · aprobación · 2026-11-12
**Decisión:** APROBADO caja-chica con 95% confirmado. Pendiente aceptado: texto exacto del WhatsApp.
**Origen:** cierre de módulo
**Consecuencias:** se genera migración y plan de construcción.

### D-030 · avisos · 2026-11-20
**Decisión:** El WhatsApp de saldo bajo se manda solo la primera vez que el saldo cruza $500; se reinicia al subir de nuevo.
**Origen:** P-022 (plática de programador en OT-006)
**Consecuencias:** campo `configuracion.alerta_enviada`.
