# Corte Lovable → Supabase propio (D-018)

Destino: Supabase `amybkerwkybffllaxpnz` · Front: Cloudflare Pages · Origen: Lovable Cloud `pkdwemunxxpafpmiqxiq`.
Repo: `DiegoUniline/rutapps` (desconectado de Lovable el 2026-11-16).

## Estado (2026-11-19)
| Pieza | Estado |
|---|---|
| Esquema ✅ · datos: base de PRUEBA limpia 2026-11-19 (2 empresas, sin transacciones); el corte recarga todo con `recargar-datos.sh` | ✅ |
| 76 edge functions | ✅ (rama `claude/ecstatic-bohr-9mairg`) |
| Secrets internos (SITE_URL, CRON_SECRET, TIENDA_JWT_SECRET, BILLING_BRIDGE_INTERNAL_SECRET) | ✅ |
| IA → Gemini, correo → Resend, front sin ref fijo | ✅ código |
| Secrets de proveedores | ❌ al corte |
| Crons (13, copiados de `cron.job` del origen) | ✅ creados APAGADOS (`scripts/migracion/crons.sql`) |
| Storage (archivos) | ❌ `scripts/migracion/copiar-storage.mjs` listo |
| Auth (URLs, SMTP) | ❌ |
| Cloudflare Pages | ❓ |

## Congelar desde ya
✅ Confirmado por el dueño 2026-11-19: esquema congelado en origen, solo crecen datos. `recargar-datos.sh` aborta si tablas o columnas difieren.

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
Después:
```bash
SERVICE_ROLE_KEY='<service_role nuevo>' ./scripts/migracion/vault.sh "$db"
psql -d "$db" -c "select cron.alter_job(jobid, active := true) from cron.job;"
```
Y: secrets de proveedores, webhooks (Stripe, Openpay, Evolution/WhatsApp, Facturama) a `https://amybkerwkybffllaxpnz.supabase.co/functions/v1/...`, DNS `rutapp.mx` → Cloudflare Pages.

## Auth (dashboard → Authentication → URL Configuration / SMTP)
- Site URL: `https://rutapp.mx`
- Redirect URLs: `https://rutapp.mx/**`, `https://*.pages.dev/**`, `http://localhost:8080/**`
- 401/401 usuarios con email confirmado en origen (login email+password, reset de password, signUp con `emailRedirectTo`).
- SMTP Resend: `smtp.resend.com:465`, usuario `resend`, password = RESEND_API_KEY, remitente `noreply@rutapp.mx`.

## Storage
Buckets privados (`csf`, `cfdi-archivos`, `recibos-cobros`, `tienda-assets`, `email-assets`, `wa-bot-reports`) solo se leen con service_role del origen → función temporal `scripts/migracion/export-storage-lovable.ts` publicada en Lovable con nombre `migracion-export-storage`; borrarla al terminar. `database_export_*` se omiten.

## Notas
- `fn_notify_empresa_alta` (trigger en `empresas`) manda webhook a hadesai.com.mx: altas de empresa hechas en el entorno de prueba también lo disparan.
- Crons que leen Vault: `create-invoice-reminder-daily` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) y `billing-align-bridge-aug2026-daily` (BILLING_BRIDGE_INTERNAL_SECRET) → `vault.sh`.

## Migraciones: repo vs producción (2026-11-19)
- Historial real (`supabase_migrations` del backup → `migracion.schema_migrations`): **601** registros, último `20260916203947`. Lovable registra la hora de aplicación (segundos después del nombre del archivo), no el nombre.
- Repo: **723** archivos; 700 hasta el 16-sep (≈99 sin registro equivalente) y **23** posteriores sin registro.
- Los 23 posteriores (promociones, inventario fase 1, editar venta, ajustar entrega, facturación 0a–3, folios, rendimiento, cerrado total efectivo) **sí están aplicados**: sus objetos existen en la BD (22/22 verificados).
- Conclusión: las 723 migraciones no reproducen la BD de forma confiable → **línea base desde la BD real** (723 movidas a `supabase/migrations_legacy/` con CONFIRMO del dueño 2026-11-19; falta `20261119000001_base_public.sql` desde pg_dump).

## Verificación tras importar el histórico (2026-11-20)
La BD de pruebas se vació a propósito; el histórico se importa completo en el corte. Los datos de Lovable se generaron con el código anterior, así que después de importarlos:
1. **Entregas validadas con el mismo producto en 2+ renglones** (defecto corregido en `20261120200000_entrega_hecho_producto_repetido.sql`): correr la consulta de `docs/auditoria/2026-11-20-presentaciones-granel.md` (entregado vs `movimientos_inventario` `entrega_hecho`). Si hay faltantes, proponer ajuste al dueño antes de operar.
2. **Kardex vs existencias** por ubicación (debe dar 0 descuadres; consulta usada en las pruebas de D-036).
3. **Comisiones de productos de precio fijo** (D-041): las ventas históricas no tienen comisión de producto; no se recalculan (solo hacia adelante).
