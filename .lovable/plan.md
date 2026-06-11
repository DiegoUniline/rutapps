
## Objetivo

Cuando se registre un cobro a un cliente, enviarle automáticamente:
- **Email** con el comprobante (HTML + PDF adjunto vía link) y botón "Ver mi estado de cuenta" en `https://rutapp.mx/cliente/{token}`.
- **WhatsApp** con el mismo PDF y el mismo link de estado de cuenta.

Ambos canales se envían siempre (no es fallback). Si uno falla, el otro queda registrado igualmente y se ve el resultado en un log.

---

## 1. Infraestructura de email (prerrequisito)

No hay dominio de email configurado en el proyecto. Como quieres que el correo salga con tu marca (rutapp.mx), hay que dar de alta primero un subdominio remitente.

Se mostrará el diálogo de setup de email para configurar `notify.rutapp.mx` (Lovable maneja los registros DNS automáticamente). Después se corre `setup_email_infra` y `scaffold_transactional_email`.

Mientras el DNS se verifica (puede tardar hasta 72 h), el resto de los cambios se siguen aplicando.

---

## 2. Página pública de Estado de Cuenta (`/cliente/:token`)

Nueva página tipo "catálogo público" pero para un cliente:

- Tabla `clientes` ya tiene id; añadir columna `portal_token text unique` (token aleatorio) generado on-demand la primera vez que se necesita.
- Ruta nueva en `src/App.tsx`: `/cliente/:token` → `EstadoCuentaPublicoPage.tsx`.
- Edge function pública `cliente-portal` (verify_jwt=false, sin RLS issues) que recibe el token y devuelve: datos del cliente, ventas con saldo, cobros recientes, saldo total, en JSON.
- La página muestra: nombre del cliente, saldo actual, lista de ventas pendientes con folio/fecha/total/saldo, lista de últimos cobros. Diseño limpio estilo Odoo (blanco, primary).
- Botón "Pagar saldo" sólo si el empresa tiene OpenPay configurado (opcional, no bloqueante).

URL final que viaja en email/WhatsApp: `https://rutapp.mx/cliente/{portal_token}`.

---

## 3. Generación del PDF del recibo

Reutilizar la lógica de ticket/recibo existente (similar a `liquidacionPdf` / `ventaPdfFromId`) y crear `src/lib/cobroReciboPdf.ts`:

- Encabezado con datos de la empresa (logo, nombre, RFC).
- Datos del cliente.
- Tabla con folio(s) aplicado(s), monto aplicado, saldo anterior, saldo nuevo.
- Método de pago, referencia, fecha.
- Total cobrado destacado.
- "Saldo del cliente: $X" al pie + URL del estado de cuenta.

Se genera en cliente como Blob, se sube a Storage (bucket nuevo `recibos-cobros`, privado) en ruta `{empresa_id}/{cobro_id}.pdf`, y se obtiene una **signed URL** con expiración larga (30 días) para enviarla.

---

## 4. Edge function `send-cobro-recibo`

Nueva función (verify_jwt=false, validamos token de servicio internamente con `service_role` o invocación firmada).

Entrada:
```json
{ "cobro_id": "...", "pdf_url": "...", "empresa_id": "..." }
```

Pasos:
1. Lee `cobros` + `cobro_aplicaciones` + `clientes` (email, telefono) + `empresas` (nombre).
2. Genera/asegura `portal_token` del cliente si no existe.
3. Construye URL: `https://rutapp.mx/cliente/{token}`.
4. **Email** (si hay `clientes.email`): invoca `send-transactional-email` con template `cobro-recibo` pasando `templateData: { clienteNombre, montoCobro, fecha, pdfUrl, portalUrl, empresaNombre }`. El template incluye botón "Ver estado de cuenta" y enlace "Descargar recibo PDF".
5. **WhatsApp** (si hay `clientes.telefono` y `whatsapp_config.activo`): invoca `whatsapp-sender` con `action: send-file`, `url: pdfUrl`, y un mensaje con monto + link al portal.
6. Registra resultado de cada canal en `cobros.notif_email_status` / `cobros.notif_wa_status` (nuevas columnas text con `sent | failed | skipped` y `notif_error text`).
7. Retorna `{ email: {...}, whatsapp: {...} }`.

Ambos canales corren en paralelo con `Promise.allSettled`; un fallo no detiene al otro.

---

## 5. Template de email `cobro-recibo`

Archivo `supabase/functions/_shared/transactional-email-templates/cobro-recibo.tsx`:

- Encabezado con nombre de la empresa.
- "Hola {clienteNombre}, recibimos tu pago de ${monto}".
- Detalles: fecha, método, folios aplicados.
- Botón primary "Ver mi estado de cuenta" → `portalUrl`.
- Link secundario "Descargar recibo (PDF)" → `pdfUrl`.
- Footer con datos de la empresa.

Registrar en `registry.ts`.

---

## 6. Hooks en cada punto donde se inserta un cobro

Después de cada `INSERT` exitoso en `cobros` (y sus `cobro_aplicaciones`), se llama a `cobroReciboPdf` → sube a Storage → invoca `send-cobro-recibo` (fire-and-forget con toast informativo).

Archivos a tocar:
- `src/pages/AplicarPagosPage.tsx`
- `src/pages/PuntoVentaPage.tsx`
- `src/pages/VentaForm/useVentaForm.ts`
- `src/pages/VentaForm/index.tsx`
- `src/pages/ruta/RutaCobrar.tsx`
- `src/pages/ruta/RutaVentaDetalle/useVentaDetalle.ts`
- `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts` (solo cuando hay conexión; offline no envía)

Se centraliza en un util `src/lib/enviarReciboCobro.ts` para no duplicar lógica.

---

## 7. Configuración opcional por empresa / cliente

- `empresas.enviar_recibo_auto boolean default true`: switch global por empresa, editable en Configuración → Cobranza.
- `clientes.recibir_notificaciones boolean default true`: opt-out por cliente, editable en su ficha.

Si cualquiera está en `false`, se omite el envío.

---

## Detalles técnicos

### Migración SQL
```sql
ALTER TABLE clientes ADD COLUMN portal_token text UNIQUE;
ALTER TABLE clientes ADD COLUMN recibir_notificaciones boolean DEFAULT true;
ALTER TABLE empresas ADD COLUMN enviar_recibo_auto boolean DEFAULT true;
ALTER TABLE cobros ADD COLUMN notif_email_status text;
ALTER TABLE cobros ADD COLUMN notif_wa_status text;
ALTER TABLE cobros ADD COLUMN notif_error text;
CREATE INDEX idx_clientes_portal_token ON clientes(portal_token);
```

### Storage
- Bucket `recibos-cobros` privado.
- Política RLS en `storage.objects`: usuarios autenticados con `empresa_id` correspondiente pueden leer/escribir su carpeta.
- La signed URL (30 días) es la que viaja al cliente.

### Estado de cuenta público
- Edge function `cliente-portal` solo acepta el `portal_token`, no expone `cliente_id` ni `empresa_id` directos.
- Rate limit básico por IP (in-memory en la función).

### Validación
- Después de implementar, probar registrando un cobro en POS y otro en AplicarPagos. Verificar:
  - Fila en `cobros` con `notif_email_status='sent'` y `notif_wa_status='sent'`.
  - PDF visible vía signed URL.
  - Página `/cliente/{token}` carga datos correctos.
  - Email llega con el botón apuntando al dominio rutapp.mx.
