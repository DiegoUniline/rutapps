
# Integración WhatsApp vía Evolution API (QR) + CRM/Inbox

## Objetivo

Reemplazar el flujo actual de "pega tu token de WhatsAPI" por un flujo tipo Kommo/Sirena:
1. La empresa entra a **Configuración → WhatsApp**.
2. Pica **"Conectar WhatsApp"** → aparece un **QR**.
3. Lo escanea con su celular (WhatsApp → Dispositivos vinculados).
4. Queda conectado; el sistema envía y recibe mensajes a través del servidor Evolution que tú administras.

Después, montar un **Inbox/CRM** dentro de Rutapp para atender clientes, levantar pedidos, mandar estados de cuenta, etc.

---

## FASE 1 — Conexión por QR (base)

**Frontend (`/configuracion/whatsapp`):**
- Ocultar los inputs de "Token / API URL".
- Nuevo botón: **Conectar WhatsApp**.
- Modal con QR (polling cada 2s al backend), estados: `esperando_qr`, `conectado`, `desconectado`.
- Muestra número conectado, batería, foto de perfil (los devuelve Evolution).
- Botón **Desconectar** (cierra sesión en Evolution).

**Backend (nueva edge function `whatsapp-evolution`):**
- Guarda credenciales del server Evolution como **secrets globales**: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (nunca expuestos al cliente).
- Endpoints internos (todos validan `empresa_id` del JWT):
  - `POST /create-instance` → nombre = `empresa_<uuid>`, integration `WHATSAPP-BAILEYS`.
  - `GET /qr` → devuelve base64 del QR.
  - `GET /status` → conectado / desconectado / esperando.
  - `POST /disconnect` → logout + delete instance.
  - `POST /send-text` → reemplaza al `whatsapp-sender` actual.
  - `POST /send-media` → para PDFs (tickets, notas, estados de cuenta).

**DB:**
- Ampliar `whatsapp_config`:
  - `provider` ∈ `whatsapi | evolution` (default `evolution` para nuevas).
  - `evolution_instance_name`, `evolution_status`, `evolution_phone_number`, `evolution_connected_at`.
- Migrar sin romper: si `api_token` existe → seguir usando `whatsapi`. Las empresas nuevas o quienes toquen "Conectar QR" pasan a `evolution`.

**Router de envío:**
- `whatsapp-sender` se convierte en dispatcher: lee `provider` y llama a la función correcta. Todos los toggles actuales (recibo de pago, aviso día antes, vencido) siguen funcionando igual.

---

## FASE 2 — Enviar comprobantes por 1 clic (sin token que pegar)

En las pantallas de venta / cotización / cobro / estado de cuenta:
- Botón **Enviar por WhatsApp** deja de abrir wa.me → llama directo a Evolution y adjunta el PDF.
- Si la empresa no tiene WhatsApp conectado, fallback al link wa.me actual.

---

## FASE 3 — Inbox / CRM básico

**DB:**
```sql
wa_conversaciones (id, empresa_id, cliente_id, telefono, ultimo_mensaje_at,
                   unread_count, status open|snoozed|closed, assigned_to)
wa_mensajes       (id, conversacion_id, empresa_id, direction in|out,
                   tipo text|image|audio|document, body, media_url,
                   evolution_message_id, from_me, ack, created_at)
```

**Webhook `whatsapp-evolution-webhook`** (Evolution manda eventos aquí):
- `messages.upsert` → crea/actualiza `wa_mensajes`, matchea `cliente_id` por teléfono, incrementa `unread_count`.
- `messages.update` → actualiza `ack` (enviado / entregado / leído).
- `connection.update` → actualiza `evolution_status`.
- Publica a Supabase Realtime → el Inbox se actualiza en vivo.

**Ruta `/whatsapp/inbox`:**
- Columna izquierda: lista de conversaciones (con avatar del cliente, último mensaje, badge de no leídos).
- Centro: hilo tipo WhatsApp Web (burbujas, hora, ✓✓).
- Derecha: **panel del cliente** con saldo, últimas ventas, botones:
  - **Levantar pedido** → abre POS pre-cargado con el cliente.
  - **Mandar estado de cuenta** → adjunta PDF.
  - **Registrar cobro**.
  - **Agendar visita**.
- Notificaciones push/badge cuando llegan mensajes.

**Permisos nuevos:** `whatsapp.inbox.ver`, `whatsapp.inbox.responder`, `whatsapp.inbox.asignar`.

---

## FASE 4 — Automatizaciones e IA (opcional, después)

- Respuestas automáticas: "Hola, escribe *saldo*, *pedido*, *catálogo*".
- Reutilizar el bot con IA existente (`wa_bot_authorized_numbers`) montado sobre Evolution en vez del gateway actual.
- Plantillas rápidas por empresa (`wa_templates`).

---

## Consumo / Costos

- **Tu server Evolution**: soporta 3–5 empresas conectadas cómodamente en el droplet actual ($6/mes). Cuando crezca, subir a $12/mes = ~10-15 empresas, o escalar horizontalmente.
- **Lovable Cloud**: el impacto real es el **webhook entrante**. Cada mensaje = 1 INSERT + 1 Realtime broadcast. Con 50 empresas × 500 msgs/día = 25k msgs/día ≈ despreciable en cómputo; el peso está en **storage** (media de audios/imágenes).
- **Mitigación**: guardar solo texto + URL del media (Evolution lo hostea), no descargar binarios al bucket salvo que el usuario los abra. Purgar mensajes > 90 días con un cron.
- **Cobro sugerido**: WhatsApp + Inbox como **add-on** ($99–149/mes por empresa), igual que ya cobras el bot IA. Cubre tu infra + margen.

---

## Detalles técnicos

- **Nombre de instancia**: `empresa_<uuid>` — aísla cada tenant en Evolution.
- **Multi-tenant en webhook**: Evolution manda `instance` en el payload → mapear a `empresa_id`. Validar firma con un `EVOLUTION_WEBHOOK_SECRET` en headers.
- **Media**: descargar bajo demanda vía endpoint autenticado, no exponer URLs de Evolution al browser (llevan API key).
- **Reconexión**: si `connection.update = close`, marcar `evolution_status = 'desconectado'` y mostrar banner "Vuelve a escanear el QR".
- **Rate limit interno**: cola en `pgmq` para envíos masivos (recordatorios de vencidos), 1 msg / 3s por instancia para no ser marcados spam.
- **Fallback**: mientras `provider = whatsapi` siga configurado, todo sigue igual — cero disrupción.

---

## Entregable por fase

- **F1** (2–3 días): conexión QR + envío de texto/PDF funcionando. Sustituye al flujo actual sin romperlo.
- **F2** (1 día): botones "Enviar por WhatsApp" en ventas/cotizaciones/cobros usan Evolution.
- **F3** (4–5 días): Inbox básico con Realtime, panel cliente, acciones rápidas.
- **F4**: cuando quieras, IA + automatizaciones.

---

## Preguntas antes de arrancar

1. ¿Empezamos por **F1 (conexión QR)** solo, y las demás fases las decidimos después de probarla? Es lo que recomiendo — así ves el impacto real de infra antes de meter el Inbox.
2. ¿Quieres que `EVOLUTION_API_URL` y `EVOLUTION_API_KEY` sean **globales tuyas** (todas las empresas usan tu server) o permitir que empresas grandes pongan su propio server Evolution?
3. Para el Inbox (F3): ¿mensajes multimedia (audios, fotos) los quieres guardar en tu Storage o solo mostrar el link de Evolution?
