# Plan: Facturación CFDI - 7 Features Pendientes (Solo Super Admin)

Todas las features quedan ocultas a usuarios normales. Solo `diego.leon@uniline.mx` ve los módulos, botones, tabs y rutas nuevas. Se reutiliza `isSuperAdmin` ya existente (`src/lib/superAdminEmail.ts`).

## Gate de visibilidad (transversal)

- Helper `useIsSuperAdmin()` (hook) que devuelve `true` solo si `user.email === 'diego.leon@uniline.mx'`.
- Cada UI nueva: `if (!isSuperAdmin) return null` o ruta redirige a `/facturacion`.
- Edge functions: validan claims del JWT y rechazan si el email no coincide → 403.

---

## 1. Complemento de Pagos (REP / Pago 2.0)

**Cuándo aplica:** factura emitida con `metodo_pago = 'PPD'` y se recibe un cobro.

**UI:**
- En `CobroDrawer` / pantalla de cobros: si la venta cobrada tiene CFDI PPD, mostrar botón **"Timbrar Complemento de Pago"** (solo super admin).
- Nuevo tab "Complementos de Pago" en `FacturacionCfdiPage` que lista los REP emitidos con su UUID, monto, fecha y CFDIs relacionados.

**Backend:**
- Nueva acción en `supabase/functions/facturama/index.ts`: `action: "timbrar_pago"`.
- Construye payload Facturama `CfdiType: "P"`, complemento `Pagos` con `DoctoRelacionado` (UUID del CFDI PPD, num parcialidad, imp saldo anterior, imp pagado, imp saldo insoluto).
- Guarda en tabla nueva `cfdi_pagos` (UUID REP, fecha pago, monto, forma pago, moneda, tipo cambio) + `cfdi_pago_documentos` (line items: UUID original, parcialidad, saldos).

**DB migration:**
```sql
cfdi_pagos (id, empresa_id, cfdi_id, cobro_id, fecha_pago, forma_pago, moneda, monto, tipo_cambio, num_operacion, uuid, xml_url, pdf_url, status, ...)
cfdi_pago_documentos (id, cfdi_pago_id, cfdi_relacionado_uuid, venta_id, num_parcialidad, imp_saldo_ant, imp_pagado, imp_saldo_insoluto, moneda_dr)
```
Con GRANT + RLS por empresa.

---

## 2. Factura Global de Público en General

**Cuándo aplica:** ventas POS sin cliente fiscal, agrupadas por periodo.

**UI:**
- Nueva pantalla `/facturacion/global` (super admin only).
- Filtros: periodicidad (Diario/Semanal/Quincenal/Mensual), mes, año, rango de fechas.
- Lista ventas POS no facturadas del periodo + total agregado.
- Botón "Generar Factura Global" → confirma y timbra.

**Backend:**
- Acción `timbrar_global` en facturama edge function.
- Cliente fijo: RFC `XAXX010101000`, nombre "PUBLICO EN GENERAL", uso `S01`, régimen `616`, CP del emisor.
- Concepto único: clave `01010101`, descripción "Venta del público en general del DD/MM al DD/MM", con `InformacionGlobal` (Periodicidad, Meses, Año).
- Detalle por ticket en `Conceptos` con `NoIdentificacion = folio_venta`.
- Marcar ventas como `facturado_global = true` en `venta_lineas`.

**DB:**
- Add columna `facturado_global boolean` en `venta_lineas` (o nueva relación `cfdi_global_ventas`).

---

## 3. Descarga Masiva XML/PDF

**UI:**
- En `FacturacionCfdiPage`, nuevo botón "Descargar masivo" (super admin).
- Modal: rango de fechas + tipo (Ingresos / Egresos / Pagos / Todos) + formato (XML / PDF / Ambos).
- Genera ZIP en cliente con `jszip` (ya disponible vía `xlsx`; si no, agregar).

**Backend:**
- Reutiliza acción `descargar` existente por CFDI. Loopea client-side con concurrencia limitada (5 a la vez), arma ZIP, dispara descarga.
- Nombre: `CFDIs_YYYYMM.zip` con subcarpetas `XML/` y `PDF/`.

---

## 4. Reenvío por correo del CFDI

**UI:**
- En `FacturaDrawer` / fila de CFDI: botón "Enviar por correo" (super admin).
- Modal: email destino (prefill con `cliente.email`), CC opcional, mensaje editable.

**Backend:**
- Reutilizar pipeline de Lovable Emails (`send-transactional-email`).
- Nuevo template `cfdi-envio` en `_shared/transactional-email-templates/` con links públicos a XML y PDF (URLs ya guardadas en `cfdis.xml_url`, `cfdis.pdf_url`).
- Registrar envío en `cfdis.enviado_at` + `cfdis.enviado_a`.

**DB:**
- Add `enviado_at timestamptz`, `enviado_a text` en `cfdis`.

---

## 5. Validación previa de RFC + Razón Social + CP fiscal

**UI:**
- En `TimbrarDialog` y en formulario de cliente: botón "Validar con SAT" junto al RFC.
- Muestra status: ✅ Válido / ⚠️ Inconsistencia (detalla qué campo) / ❌ No localizado.
- Bloquea timbrado si status ≠ válido (override solo super admin con confirmación).

**Backend:**
- Nueva acción `validar_rfc` en facturama edge function.
- Llama endpoint Facturama `Lco` (Lista de Contribuyentes Obligados) que valida RFC + nombre + CP.
- Cachea resultado 24h en `clientes.rfc_validado_at` + `clientes.rfc_validado_status`.

**DB:**
- Add `rfc_validado_at timestamptz`, `rfc_validado_status text` (`valido` | `inconsistencia` | `no_encontrado`), `rfc_validado_detalle jsonb` en `clientes`.

---

## 6. Constancia de Situación Fiscal (CSF) - Auto-llenado

**UI:**
- En ficha de cliente, sección fiscal: dropzone "Subir CSF (PDF)".
- Al parsear, auto-rellena RFC, razón social, régimen, CP fiscal, dirección, y dispara validación SAT (feature 5).
- Muestra preview de campos detectados antes de guardar.

**Backend:**
- Ya existe `parse-csf/index.ts`. Verificar que devuelve todos los campos requeridos. Si faltan, completar parser.
- Conectar al flujo de creación/edición de cliente (no solo a empresa emisora).

---

## 7. Sustitución Guiada (Cancelar y Re-timbrar en 1 click)

**UI:**
- En CFDI cancelable, botón "Sustituir CFDI" (super admin).
- Wizard 3 pasos:
  1. Motivo cancelación (01-04, default 01).
  2. Editar líneas / cliente / forma pago (form pre-llenado del CFDI original).
  3. Confirmar → timbra nuevo (CfdiRelacionados: tipo 04, UUID original) + cancela el viejo (motivo 01, FolioSustitucion = UUID nuevo).
- Rollback si el timbrado nuevo falla (no cancela el viejo).

**Backend:**
- Nueva acción `sustituir` en facturama edge function: orquesta `timbrar` con relación 04 → si OK, `cancelar` motivo 01 con folio sustituto → si la cancelación falla, deja CFDI nuevo emitido y marca el viejo como `cancelacion_pendiente_post_sustitucion` para reintento.

---

## Detalles técnicos

**Archivos nuevos:**
- `src/hooks/useIsSuperAdmin.ts`
- `src/pages/facturacion/ComplementoPagoDialog.tsx`
- `src/pages/facturacion/FacturaGlobalPage.tsx`
- `src/pages/facturacion/DescargaMasivaDialog.tsx`
- `src/pages/facturacion/EnviarCfdiDialog.tsx`
- `src/pages/facturacion/SustituirCfdiWizard.tsx`
- `src/components/facturacion/ValidarRfcButton.tsx`
- `src/components/facturacion/SubirCsfCliente.tsx`
- `supabase/functions/_shared/transactional-email-templates/cfdi-envio.tsx`

**Archivos modificados:**
- `supabase/functions/facturama/index.ts` — acciones: `timbrar_pago`, `timbrar_global`, `validar_rfc`, `sustituir`.
- `src/pages/FacturacionCfdiPage.tsx` — tabs nuevos + botones masivos (super admin).
- `src/components/facturacion/FacturaDrawer.tsx` — botones nuevos por fila.
- `src/pages/ClienteFormPage.tsx` — dropzone CSF + validar RFC.
- `src/hooks/usePermisos.ts` — módulo `facturacion.avanzada` (solo super admin).

**Migraciones DB:**
1. `cfdi_pagos` + `cfdi_pago_documentos` con GRANT/RLS.
2. Columnas en `cfdis` (`enviado_at`, `enviado_a`).
3. Columnas en `clientes` (`rfc_validado_at`, `rfc_validado_status`, `rfc_validado_detalle`).
4. Columna en `venta_lineas` (`facturado_global`).

**Orden de implementación sugerido (4 entregas):**
1. Gate super admin + migraciones DB + Complemento de Pagos (la más crítica).
2. Factura Global de público en general.
3. Validación RFC + CSF auto-llenado + Sustitución guiada.
4. Descarga masiva + Reenvío por correo.

¿Procedo con la **Entrega 1** (gate + DB + Complemento de Pagos)?
