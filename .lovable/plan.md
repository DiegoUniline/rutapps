
# Bot Premium de WhatsApp (Add-on)

Activar un bot de WhatsApp por empresa que reciba comandos en lenguaje natural y responda con texto o PDFs. Se usará la API de WhatsAPI con un **token global de RutApp** (guardado como secret), y el cobro/activación lo controla el Super Admin.

## 1. Modelo de datos (migración)

- `empresa_addons` (nueva)
  - `empresa_id` (FK, unique)
  - `wa_bot_enabled` (bool, default false)
  - `wa_bot_activated_at`, `wa_bot_activated_by`
  - `wa_bot_monthly_price` (numeric, info)
  - `wa_bot_notes` (text)
  - RLS: solo super admin escribe; cualquier usuario de la empresa puede leer su propia fila.

- `wa_bot_authorized_numbers` (nueva)
  - `id`, `empresa_id`, `profile_id` (FK profiles, nullable), `phone_e164` (text), `nombre`, `permisos` (jsonb: `{reportes, stock, clientes, cobros}`), `activo`, `created_by`
  - El teléfono base viene del perfil del usuario; el admin marca quién está autorizado y qué comandos puede usar.
  - RLS: lectura para usuarios de la empresa; escritura solo para admins de la empresa.

- `wa_bot_logs` (nueva)
  - `id`, `empresa_id`, `phone`, `inbound_text`, `intent`, `params` (jsonb), `outcome` (`ok|denied|error|unauthorized`), `response_summary`, `pdf_url`, `created_at`
  - Auditoría completa de cada mensaje recibido.

GRANTS + RLS en la misma migración.

## 2. Edge functions

- `wa-bot-webhook` (público, `verify_jwt = false`)
  - Recibe POST de WhatsAPI con `instance` + `data.key.remoteJid` + `data.message`.
  - Valida header `x-api-token` contra `WHATSAPI_GLOBAL_TOKEN` (secret) para evitar spoofing.
  - Normaliza el teléfono → busca en `wa_bot_authorized_numbers` (cruzando con `profiles.telefono`).
  - Si la empresa no tiene `wa_bot_enabled = true` → responde "Servicio no contratado".
  - Si el número no está autorizado → responde "No autorizado" + log.
  - Si está autorizado → parsea intent y delega.

- `wa-bot-send` (helper interno, llamado desde el webhook y desde el panel para pruebas)
  - Wrappers `send-text` y `send-file` contra `https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy`.

- Generación de PDFs en el servidor:
  - Reusar la lógica actual de PDFs (Odoo style) corriendo en edge con `jsPDF` o `pdf-lib`.
  - Subir a bucket `wa-bot-reports` (privado con `signedUrl` de 24h) → mandar como `send-file`.

## 3. Comandos v1 (NLP simple + regex)

Parser minimal en español, no requiere LLM:

- **Reporte diario**: `reporte hoy`, `reporte ayer`, `reporte 12/06`, `reporte semana`
  → genera PDF estilo `reporteDiarioPdf` (ventas + cobros + gastos + utilidad) y lo manda.
- **Stock**: `stock`, `stock bajo`, `stock bajo 10`, `stock <nombre producto>`
  → texto con top 20 productos con `cantidad <= min` (o umbral), o detalle de un producto.
- **Cliente / estado de cuenta**: `cliente <nombre o teléfono>`
  → busca match; si hay varios manda lista corta; si hay uno responde saldo + últimas 5 ventas + link a PDF de estado de cuenta.
- **Cobros del día**: `cobros hoy`, `cobros ayer`
  → resumen texto: total, por método, top 5 movimientos; "pendientes" muestra cartera vencida.
- **Ayuda**: cualquier texto no reconocido → menú con comandos disponibles.

Todo respeta `empresa.zona_horaria` y los permisos del número autorizado (no puede pedir lo que no tiene marcado).

## 4. Panel admin de la empresa

Nueva página `src/pages/WhatsAppBotPage.tsx` (módulo `whatsapp_bot`, permiso nuevo):

- Estado del servicio (badge "Contratado / No contratado" leyendo `empresa_addons`).
- Si está contratado:
  - Tabla de **números autorizados**: agregar desde dropdown de usuarios con teléfono, o teléfono libre; togglear permisos por comando.
  - Sección **Comandos disponibles** con ejemplos copiables.
  - Botón "Probar bot" → llama `wa-bot-send` con un mensaje de bienvenida al número del usuario logueado.
  - Historial últimos 50 logs (`wa_bot_logs`).
- Si no está contratado: tarjeta promocional + CTA "Solicitar activación" (manda notificación al super admin).

## 5. Panel Super Admin

En `SuperAdminPage.tsx`, agregar columna y modal **"Bot WhatsApp"**:

- Toggle `wa_bot_enabled` por empresa.
- Campo precio mensual (referencia).
- Fecha de alta y quién lo activó.
- Aparece "Solicitudes pendientes" cuando alguna empresa pidió activación.

## 6. Configuración WhatsAPI

- Nuevo secret en Lovable Cloud: `WHATSAPI_GLOBAL_TOKEN`.
- URL del webhook a configurar en WhatsAPI: `https://<proyecto>.supabase.co/functions/v1/wa-bot-webhook`.
- Único token, único webhook; el `empresa_id` se resuelve por número emisor (cruce contra `wa_bot_authorized_numbers`).

## 7. Seguridad y límites

- Rate limit por número (máx. 20 msj/min) en `wa-bot-logs` con conteo en ventana.
- Saneamiento del texto antes de logear.
- PDFs en bucket privado con signed URL temporal.
- Si una empresa pierde el add-on, el bot responde mensaje informativo y deja de generar PDFs.

## Detalles técnicos (referencia rápida)

- WhatsAPI endpoint base: `https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy` con header `x-api-token`.
- Webhook payload usa `data.key.remoteJid` (sufijo `@s.whatsapp.net` para personales).
- Normalización de teléfono: quitar sufijo, dejar E.164.
- PDF de reporte diario: reutilizar `src/lib/reporteDiarioPdf.ts` adaptado para correr en Deno (o regenerar HTML→PDF en función). Si jsPDF no corre en Deno, generar el PDF en el cliente NO aplica → usar `pdf-lib` (`npm:pdf-lib`) que sí funciona en edge.
- Empresa resuelta por número: una persona puede estar autorizada en >1 empresa; en ese caso responder lista "Responde 1, 2..." para elegir contexto (estado conversacional en `wa_bot_logs` con TTL 5 min).

## Lo que NO incluye esta v1

- Cobro automático con Stripe del add-on (queda como activación manual del Super Admin).
- Botones interactivos / listas (WhatsAPI no los soporta).
- Multi-instancia WhatsAPI (token global único).

¿Apruebas el plan así o quieres ajustar (precio, comandos extra, mover el cobro a Stripe)?
