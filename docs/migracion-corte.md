# Corte Lovable → Supabase propio (D-018)

Destino: Supabase `amybkerwkybffllaxpnz` · Front: Cloudflare Pages · Origen: Lovable Cloud `pkdwemunxxpafpmiqxiq`.
Repo: `DiegoUniline/rutapps` (desconectado de Lovable el 2026-11-16).

## Estado (2026-11-19)
| Pieza | Estado |
|---|---|
| Esquema + datos de prueba (backup 16-nov) | ✅ |
| 76 edge functions | ✅ (rama `claude/ecstatic-bohr-9mairg`) |
| Secrets internos (SITE_URL, CRON_SECRET, TIENDA_JWT_SECRET, BILLING_BRIDGE_INTERNAL_SECRET) | ✅ |
| IA → Gemini, correo → Resend, front sin ref fijo | ✅ código |
| Secrets de proveedores | ❌ al corte |
| Crons | ❌ falta extraer lista real del backup |
| Storage (archivos) | ❌ `scripts/migracion/copiar-storage.mjs` listo |
| Auth (URLs, SMTP) | ❌ |
| Cloudflare Pages | ❓ |

## Congelar desde ya
Ningún cambio de esquema en Lovable (chat/SQL). `recargar-datos.sh` aborta si tablas o columnas difieren.

## Día del corte (en la Mac, desde ~/rutapps)
```bash
export PGPASSWORD='...'
db="postgresql://postgres.amybkerwkybffllaxpnz@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
f="$HOME/Downloads/<backup_nuevo>.backup"
./scripts/migracion/recargar-datos.sh "$f" "$db"
./scripts/migracion/recargar-datos.sh "$f" "$db" --ejecutar
```
```bash
OLD_URL=https://pkdwemunxxpafpmiqxiq.supabase.co OLD_ANON_KEY=<anon viejo> MIGRACION_TOKEN=<token> NEW_URL=https://amybkerwkybffllaxpnz.supabase.co NEW_SERVICE_ROLE_KEY=<service_role nuevo> node scripts/migracion/copiar-storage.mjs
```
Después: secrets de proveedores, crons, webhooks (Stripe, Openpay, Evolution/WhatsApp, Facturama) a `https://amybkerwkybffllaxpnz.supabase.co/functions/v1/...`, DNS `rutapp.mx` → Cloudflare Pages.

## Auth (dashboard → Authentication → URL Configuration / SMTP)
- Site URL: `https://rutapp.mx`
- Redirect URLs: `https://rutapp.mx/**`, `https://*.pages.dev/**`, `http://localhost:8080/**`
- 401/401 usuarios con email confirmado en origen (login email+password, reset de password, signUp con `emailRedirectTo`).
- SMTP Resend: `smtp.resend.com:465`, usuario `resend`, password = RESEND_API_KEY, remitente `noreply@rutapp.mx`.

## Storage
Buckets privados (`csf`, `cfdi-archivos`, `recibos-cobros`, `tienda-assets`, `email-assets`, `wa-bot-reports`) solo se leen con service_role del origen → función temporal `scripts/migracion/export-storage-lovable.ts` publicada en Lovable con nombre `migracion-export-storage`; borrarla al terminar. `database_export_*` se omiten.
