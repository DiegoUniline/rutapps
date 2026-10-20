# Auditoría de seguridad · Edge functions con `service_role` (2026-10-20)

**Alcance:** 63 de 76 edge functions usan `SUPABASE_SERVICE_ROLE_KEY` (se saltan RLS). Revisión de solo lectura del código (`supabase/functions/*`, `_shared/`, migraciones relacionadas). **No** se probó contra producción.
**Regla aprobada (dueño):** el super admin puede entrar a cualquier empresa; solo es hallazgo si no se valida en servidor.

**Hecho transversal:** `verify_jwt = true` no protege por sí solo: la anon key pública (en el bundle del front y en `.env`) es un JWT válido. Una función que no valida usuario o secreto en su código es, en la práctica, pública. 28 funciones además tienen `verify_jwt = false` en `supabase/config.toml`.

**Verificación:** ✅V = revisado línea por línea por el agente principal · ✅ = confirmado en código por revisor · 🟡 = sospecha (depende de datos o de la config desplegada).

## CRÍTICAS

| # | función / objeto | qué permite | evidencia | estado |
|---|---|---|---|---|
| S-01 | `subscription-cleanup` | Cualquiera en internet (sin llave) dispara el **borrado físico** de ventas, clientes, productos, cobros, compras, inventario… de empresas `past_due` > 90 días. Hoy 0 empresas califican (SQL del dueño 2026-10-20) | `config.toml:31-32`; `subscription-cleanup/index.ts:9-24, 60-113` | ✅V |
| S-02 | RPC `add_timbres` | `SECURITY DEFINER` sin chequeo de quién llama y sin `REVOKE`: cualquier usuario se abona timbres a cualquier empresa | `migrations/20260317174056_*.sql:84-113` | ✅V (permiso real en prod 🟡) |
| S-03 | `tienda-login` | Auto-crea acceso con contraseña fija `123456` para cualquier cliente del CRM; `ilike` acepta `%`: entrar como cualquier cliente sin conocer su correo; el mensaje de error revela la contraseña | `tienda-login/index.ts:44-92` | ✅V |
| S-04 | `tienda-register` | Si el correo (o patrón `%`) coincide con un cliente del CRM, borra su acceso y crea uno con la contraseña del atacante | `tienda-register/index.ts:42-78` | ✅ |
| S-05 | `billing-notify` | Con la anon key: WhatsApp con texto libre a cualquier número desde el número de RutApp; reenvío masivo de avisos de cobro de todas las empresas; la respuesta devuelve empresa, monto y email; dispara el ciclo de suspensiones | `billing-notify/index.ts:387-444, 523-612, 880-946` | ✅ |
| S-06 | `create-checkout` | `empresa_id` y `price_id` vienen del body: un usuario de A liga su suscripción a la empresa B y luego la bloquea al cancelar | `create-checkout/index.ts:56-64, 238-263`; `stripe-webhook/index.ts:251-349, 729-741` | ✅ |
| S-07 | `purchase-timbres` | Doble abono por carrera en `verify_payment` (revisa, acredita y marca sin bloqueo) | `purchase-timbres/index.ts:99-120` | ✅ |
| S-08 | `facturama` `timbrar` | El emisor (RFC) viene del body: timbrar CFDI con el RFC/CSD de otra empresa (cuenta Facturama compartida) | `facturama/index.ts:100-102, 229, 347-364` | ✅ (aceptación por Facturama 🟡) |
| S-09 | `facturama` `cancelar` | Se planta una fila `cfdis` propia con el `facturama_id` de otra empresa y se cancela su CFDI ante el SAT | `facturama/index.ts:579-609`; RLS `cfdis` FOR ALL | ✅ |
| S-10 | `send-cobro-recibo` | Con la anon key y un `cobro_id` ajeno: devuelve el `portal_token` del cliente (RFC, ventas, cobros) y manda correo con la marca de esa empresa y un `pdf_url` del atacante | `send-cobro-recibo/index.ts:31-61, 162-166` | ✅ |

## ALTAS

| # | función / objeto | qué permite | evidencia | estado |
|---|---|---|---|---|
| S-11 | RPC `wa_clientes_saldos` | `SECURITY DEFINER`, `p_empresa` libre, `GRANT … TO authenticated`: cualquier usuario lee clientes, teléfonos y saldos de otra empresa | `migrations/20260614000402_*.sql:2-36` | ✅V |
| S-12 | bucket `empresa-assets` | CFDI (XML/PDF) en bucket público con SELECT `TO public`: listar y descargar XML de todas las empresas; INSERT/UPDATE/DELETE para cualquier autenticado sin filtrar ruta | `migrations/20260314232729_*.sql:13-15`; `20260717160041_*.sql:1-13` | ✅ (estado en prod 🟡) |
| S-13 | `facturama` `list_csds` / `upload_csd` | Cualquier usuario lista los CSD de todas las empresas y puede reemplazar el CSD de cualquier RFC | `facturama/index.ts:155-220` | ✅ |
| S-14 | `facturama-reconcile` | Anónimo recibe Id de Facturama, UUID, total y fecha de CFDI de cualquier emisor (alimenta S-09) | `facturama-reconcile/index.ts:39-117` | ✅ |
| S-15 | `wa-bot-webhook` | Sin autenticación real: suplantar cualquier número, gasto de IA ilimitado, spam desde el número global | `wa-bot-webhook/index.ts:421-430` | ✅ |
| S-16 | `wa-scheduler-reporte-diario`, `-cobranza-diaria`, `-alertas-semanal` | `{force:true}` con la anon key envía reportes a todos los números de todas las empresas (incluso dados de baja), repetible | `*/index.ts` (ver revisión) | ✅ |
| S-17 | `manage-subscription` | Cualquier rol cambia plan con `new_price_id` del cliente, cancela, o aplica descuento de retención 15 % repetido | `manage-subscription/index.ts:291-387` | ✅ |
| S-18 | `partner-welcome` | Anónimo manda WhatsApp a cualquier número con el token de WhatsApp de una empresa cliente | `partner-welcome/index.ts:38-82` | ✅ |
| S-19 | `send-otp` | Rate limit solo por teléfono exacto (spam masivo); código con `Math.random`; intentos se revisan después de comparar | `send-otp/index.ts:11-140` | ✅ |
| S-20 | `tienda-asistente-pedido` | Anónimo dispara OpenAI sin límite (LLM + audio 9 MB) | `tienda-asistente-pedido/index.ts:255-276` | ✅ |
| S-21 | `tienda-login` / `tienda-register` | Enumeración de correos y de la cartera de clientes (`possible_duplicate`), sin rate limit | `tienda-login:54-103`; `tienda-register:83-142` | ✅ |

## MEDIAS / BAJAS (resumen)
- `admin-users`: `create-user` acepta `role_id` sin validar empresa; `set-password` puede cambiar la contraseña de un super admin si su perfil está en esa empresa 🟡; `list-users` sin rol.
- `billing-align-bridge-aug2026` y `admin-backfill-facturas`: super admin por **correo fijo** en código; la primera ya caducó y sigue desplegada (crea y cobra facturas Stripe).
- `admin-billing`, `partner-welcome`: usan la fila más antigua de `whatsapp_config` (puede ser de un cliente) como token de la plataforma 🟡.
- `facturama`: super admin por lista de correos fija; `descargar` por `facturama_id` plantado 🟡.
- `select-plan`, `create-trial-checkout`: sin rol admin, modifican la suscripción antes de cobrar; planes inactivos elegibles.
- `notify-alerts-scan`: escaneo global invocable anónimo (DoS); `wa-test-envios-preview`: función de prueba desplegada que escribe en producción.
- `tienda-checkout`: no revisa acceso bloqueado ni productos inactivos, no transaccional; `tienda-catalog` ignora `permitir_invitados`; tokens de tienda no se revocan.
- `tienda-admin-clientes`: busca `profiles.id = user.id` (columna equivocada) y usa `super_admin_override_empresa_id` sin validar super admin — latente CRÍTICA si se “arregla” solo la columna.
- `demo-login`: crea usuarios/empresas demo ilimitados y entrega JWT real (habilita abuso de funciones de IA con JWT).
- `soporte-chat`: el prompt expone correo del super admin y la contraseña `123456`.
- `openpay-public`: URL de sandbox fija en código (funcional).
- Transversal: CORS `*`; varios `catch` devuelven `err.message`.

## Sin hallazgo entre empresas
`admin-cleanup-stripe-invoices`, `admin-team-account`, `billing-cycle`, `billing-realign-to-month-start`, `billing-reanchor-to-cdmx-8am`, `check-subscription`, `daily-billing`, `user-lifecycle`, `customer-portal`, `list-invoices`, `public-catalog`, `whatsapp-sender`, `whatsapp-evolution`, `wa-campaign`, `dashboard-ai-advisor`, `cliente-portal`, `cotizacion-publica`, `purchase-route-credits`, `partner-sandbox-login`.

## Pendiente de comprobar en producción (lectura, requiere autorización)
- Permisos reales de `add_timbres` y `wa_clientes_saldos` (`has_function_privilege`).
- Políticas reales del bucket `empresa-assets`.
- `verify_jwt` desplegado de cada función (puede diferir de `config.toml`).
- Fila más antigua de `whatsapp_config` y empresa del perfil de los super admins.
