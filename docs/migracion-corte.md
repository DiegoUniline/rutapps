# Corte Lovable → Supabase propio (D-018)

Destino: Supabase `amybkerwkybffllaxpnz` · Front: Cloudflare Pages · Origen: Lovable Cloud `pkdwemunxxpafpmiqxiq`.
Repo: `DiegoUniline/rutapps` (desconectado de Lovable el 2026-11-16).

## Estado (2026-11-19)
| Pieza | Estado |
|---|---|
| Datos | ✅ CARGADOS 2026-11-23 (recargar-datos.sh --ejecutar, backup rutapps_261123): 409 usuarios, 262 empresas, 82,285 ventas, 21,167 clientes, 22,961 productos, 587,813 movimientos; última venta 2026-11-23 00:41 UTC |
| 76 edge functions | ✅ (rama `claude/ecstatic-bohr-9mairg`) |
| Secrets internos (SITE_URL, CRON_SECRET, TIENDA_JWT_SECRET, BILLING_BRIDGE_INTERNAL_SECRET) | ✅ |
| IA → Gemini, correo → Resend, front sin ref fijo | ✅ código |
| Secrets de proveedores | 🔄 2026-11-23 cargando: Stripe (+ webhook nuevo creado y APAGADO hasta el corte), Facturama, Gemini, Maps, Routes (clave sin restricción de sitio, solo Routes API), ORS, Resend. Sin Evolution/WhatsAPI (D-054) ni Openpay (D-053) |
| Crons (13) | ✅ 11 encendidos 2026-11-23; faltan `create-invoice-reminder-daily` y `billing-align-bridge-aug2026-daily` (necesitan `vault.sh`) |
| Storage (archivos) | ❌ `scripts/migracion/copiar-storage.mjs` listo |
| Auth (URLs, SMTP) | ❌ · Resend: dominio `rutapp.mx` Verified 2026-11-22 (DNS hoy en GoDaddy; al pasar a Cloudflare conservar los registros de Resend) |
| Mantenimiento | Quitado 2026-11-23 (`activo: false` en `src/lib/mantenimiento.ts`) |
| Cloudflare (Worker `rutapps`) | ✅ publicado en `https://rutapps.diego-leon.workers.dev` (Production, rama main). Dominio `rutapp.mx` se conecta SOLO al final del corte (Domains → Add) |

## Congelar desde ya
✅ Confirmado por el dueño 2026-11-19: esquema congelado en origen, solo crecen datos. Desde 2026-11-21 el destino tiene **más** que el origen (42 migraciones posteriores a la base): `recargar-datos.sh` acepta que el destino sea **superconjunto** y aborta solo si el backup trae tablas/columnas que el destino no tiene, o si una columna nueva del destino es NOT NULL sin default.

## Día del corte (en la Mac, desde ~/rutapps), en este orden
1. **Destino al día:** todas las migraciones del repo aplicadas en `amybkerwkybffllaxpnz` (la última hoy es `20261121050000_f1_devoluciones`; revisar con `list_migrations`). Si falta una, el ensayo lo delata (columna o tabla del backup que no existe) o la recarga corre con funciones viejas.
2. **Backup nuevo de Lovable** (`pg_dump -Fc`), tomado cuando ya no haya operación en curso.
3. **Ensayo** (carga todo en una transacción y hace ROLLBACK; no cambia nada, pero mientras corre las tablas del destino quedan bloqueadas). Deja `corte-reporte-<fecha>-ensayo.txt` en la carpeta actual:
   ```bash
   export PGPASSWORD='...'
   db="postgresql://postgres.amybkerwkybffllaxpnz@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
   f="$HOME/Downloads/<backup_nuevo>.backup"
   ./scripts/migracion/recargar-datos.sh "$f" "$db"
   ```
4. **Revisar el reporte** (ver § «Qué revisar en el reporte») y llevar al dueño las líneas «PENDIENTE DUEÑO» y la sección B.
5. **Carga real** (pide escribir `CONFIRMO recargar datos`; COMMIT; deja `corte-reporte-<fecha>-ejecutar.txt`). Agregar `--recalcular-pedidos` y/o `--corregir-canceladas-devol` solo si el dueño lo decidió:
   ```bash
   ./scripts/migracion/recargar-datos.sh "$f" "$db" --ejecutar
   ```
6. Storage, Vault, crons, secrets, webhooks, Auth y DNS (abajo).

```bash
OLD_URL=https://pkdwemunxxpafpmiqxiq.supabase.co OLD_ANON_KEY=<anon viejo> MIGRACION_TOKEN=<token> NEW_URL=https://amybkerwkybffllaxpnz.supabase.co NEW_SERVICE_ROLE_KEY=<service_role nuevo> node scripts/migracion/copiar-storage.mjs
```
Después:
```bash
SERVICE_ROLE_KEY='<service_role nuevo>' ./scripts/migracion/vault.sh "$db"
psql -d "$db" -c "select cron.alter_job(jobid, active := true) from cron.job;"
```
Y: secrets de proveedores, webhooks (Stripe, Evolution/WhatsApp, Facturama; Openpay eliminado, D-053) a `https://amybkerwkybffllaxpnz.supabase.co/functions/v1/...`, DNS `rutapp.mx` → Cloudflare Pages.

## Auth (dashboard → Authentication → URL Configuration / SMTP)
- Site URL: `https://rutapp.mx`
- Redirect URLs: `https://rutapp.mx/**`, `https://rutapps.diego-leon.workers.dev/**`, `http://localhost:8080/**`
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
1. **Entregas validadas con el mismo producto en 2+ renglones** (defecto corregido en `20261120200000_entrega_hecho_producto_repetido.sql`): entregado vs `movimientos_inventario` `entrega_hecho` → `post-carga.sql` **C3**. Si hay faltantes, proponer ajuste al dueño antes de operar.
2. **Kardex vs existencias** por ubicación → **C4** (Lovable ya traía descuadres históricos; se reportan, no se corrigen).
3. **Comisiones de productos de precio fijo** (D-041): las ventas históricas no tienen comisión de producto; no se recalculan (solo hacia adelante).
4. `devolucion_lineas` con cantidad ≤ 0 → **C1**; liquidaciones duplicadas por vendedor y día → **C2**; folios → **C5**.

## Recarga con esquema nuevo (2026-11-21)

### Qué hace `recargar-datos.sh`
1. **Revisa** (sin escribir): tablas del backup ⊆ destino; columnas del backup (public + `auth.users/identities`) ⊆ destino; ninguna columna nueva del destino en tablas del backup es NOT NULL sin default. Las tablas nuevas del destino (`cobro_excedentes`, `descarga_ruta_eventos`) quedan vacías.
2. **Una sola transacción** (ensayo = ROLLBACK, `--ejecutar` = COMMIT):
   1. Compara los constraints e índices únicos del backup (`pg_restore -s`) con los del destino. Los **nuevos** sobre tablas del backup (CHECK, FK, UNIQUE, PK, índice único, NOT NULL que el backup no tenía) se quitan antes de copiar.
   2. `TRUNCATE` de todo `public`; `DELETE FROM auth.users` con triggers encendidos (la cascada limpia identidades, sesiones y MFA del destino; antes quedaban sesiones huérfanas).
   3. `SET LOCAL session_replication_role = replica` (triggers y FK apagados) y COPY de `public` + `auth.users/identities` + `SEQUENCE SET`.
   4. `scripts/migracion/post-carga.sql` (abajo).
   5. Repone lo quitado: si los datos viejos lo cumplen, queda igual que antes; si no, **CHECK/FK quedan NOT VALID** (protegen todo lo nuevo, no se validan los viejos) y **UNIQUE/índice único queda sin crear**. Nada se corrige sin decisión.
   6. Reporte: `corte-reporte-<fecha>-<modo>.txt`.
3. Nota Supabase: el rol `postgres` puede `SET session_replication_role` (sentencia), pero **no** `set_config('session_replication_role', …)` (42501). Los scripts usan la sentencia.

### Constraints agregados después de la base (inventario 2026-11-21)
Comparado catálogo de la BD nueva vs `20261119000001_base_public.sql` (mismo número por tabla salvo estos 13 + 2 tablas nuevas):

| Constraint | Migración | Columna | Datos viejos | Qué pasa |
|---|---|---|---|---|
| `devolucion_lineas_cantidad_positiva` CHECK cantidad > 0 | 20261121000000 F0 | vieja | pueden violarlo | NOT VALID + C1 lista las filas · se quedan (D-052) |
| `uq_descarga_ruta_vendedor_dia` índice único | 20261121043000 F3 | viejas | duplicados posibles | sin crear (queda el trigger) + C2 · se quedan (D-052) |
| `ajustes_inventario_status_chk` | 20261119180000 | nueva (default 'aplicado') | cumplen | se repone |
| `cobros_saldo_favor_reembolso_chk`, `cobros_devolucion_id_fkey` | 20261119200000 / 20261121050000 | nuevas (0 / NULL) | cumplen | se repone |
| `almacenes_merma_de_almacen_id_fkey`, `uq_almacenes_merma_de` | 20261120140000 D-036 | nueva (NULL) | cumplen | se repone |
| `entrega_lineas_cantidad_merma_chk`, `entrega_lineas_merma_almacen_id_fkey` | 20261120140000 D-036 | nuevas (0 / NULL) | cumplen | se repone |
| `devolucion_lineas_destino_chk`, `devolucion_lineas_reposicion_almacen_id_fkey` | 20261121050000 F1 | nuevas (NULL) | cumplen | se repone |
| `devoluciones_turno_id_fkey`, `devoluciones_caja_movimiento_id_fkey` | 20261121050000 F1 | nuevas (NULL) | cumplen | se repone |

No hay `SET NOT NULL`, cambios de tipo, `DROP COLUMN/TABLE` ni enums nuevos posteriores a la base. Todas las columnas nuevas son nullable o tienen default.

### Post-carga (`scripts/migracion/post-carga.sql`): revisión de las 42 migraciones
| Migración | Efecto sobre datos existentes | En la recarga |
|---|---|---|
| 20261120060000 ventas_tiene_promocion | marca `ventas.tiene_promocion` | **A1** se aplica (marca derivada, sin decisión) |
| 20261121043000 F3 | `descarga_ruta.inventario_aplicado_at` y `descarga_ruta_lineas.cantidad_aplicada` de liquidaciones con inventario ya aplicado | **A2/A3** se aplican (sin esto, re-aprobar volvería a meter todo a bodega, H7) |
| 20261120000000 excedentes | `cobro_excedentes` 'previo' desde `cobros.saldo_favor_monto/reembolso_monto` | **A4** idempotente; da 0 (columnas nuevas = 0; D-023) |
| 20261120030000 D-034 | recalcula estado y saldo de todos los pedidos por lo entregado | **B1** solo vista previa; `--recalcular-pedidos` lo aplica · NO se usa (D-052) |
| 20261119233000 | re-sincroniza inventario de ventas canceladas/borrador con devoluciones | **B2** solo vista previa; `--corregir-canceladas-devol` lo aplica · NO se usa (D-052) |
| 20261120010000 D-033 | cancelaba devoluciones de ventas canceladas | **fuera**: D-049 lo revirtió (cancelar la venta no cancela devoluciones) |
| 20261119180000, 200000, 20261120140000, 20261121050000 | columnas nuevas | sin backfill: el default es lo correcto (ajustes «aplicado», sin saldo a favor viejo, sin merma, destino NULL = ruteo viejo por motivo) |
| 20261121043000 (desglose congelado) | — | sin backfill: aprobadas antes de F3 siguen en vivo (D-049) |
| 20261120190000 D-041 | — | sin backfill: comisiones no se recalculan |
| Resto (funciones, índices, políticas, grants, folios BIGINT, búsqueda, borrado en uso) | ninguno | nada que hacer; no hay permisos ni `ticket_campos` sembrados |

### Folios y secuencias
- Generadores (`generate_folio`, `next_folio`, `auto_folio_*`, mermas, saldos iniciales, cotizaciones) calculan **MAX + 1** sobre los datos: siguen solos después de cargar (BIGINT desde 20261121030000).
- Contadores guardados: `cfdi_series.siguiente_folio/siguiente_folio_pago` vienen en los datos → **C5** avisa si alguno quedó ≤ al folio ya usado.
- Única secuencia de `public`: `auditoria_reparaciones_inventario_id_seq` (identity) → la fija el `SEQUENCE SET` del backup; C5 la compara con el máximo id.

### Qué revisar en el reporte
- **D constraints nuevos:** todo «repuesto y validado» salvo, a lo más, los dos ❓ de arriba.
- **A post-carga:** conteos razonables (A4 = 0).
- **B opcional:** vista previa de cuántos pedidos/saldos e inventario cambiarían; se lleva al dueño.
- **C verificación:** C1–C5; cualquier número distinto de 0 en C1/C2/C3/C5 se lleva al dueño antes de operar.
- **E totales:** usuarios, empresas, ventas y última venta = las del backup.

### Decisión del dueño sobre datos viejos ([D-052](./decisiones.md#d-052))
«Lo histórico se queda como está.» En el corte NO se corrige ni se mueve ningún dato histórico:
1. `devolucion_lineas` con cantidad ≤ 0 (C1): se quedan; el CHECK queda NOT VALID (solo valida filas nuevas).
2. Liquidaciones duplicadas por vendedor y día (C2): se quedan; el índice único no se crea (el trigger sigue evitando duplicados nuevos).
3. B1 (`--recalcular-pedidos`): **no se usa**.
4. B2 (`--corregir-canceladas-devol`): **no se usa**.
5. C3 entregas con producto repetido sin descontar: no se ajustan; solo quedan en el reporte.
Sí se aplican A1–A3: no cambian montos, cantidades ni inventario; solo marcan lo que ya pasó (bandera de promoción y «inventario ya aplicado» en liquidaciones aprobadas) para que el sistema nuevo no lo vuelva a aplicar.

Probado 2026-11-21: SQL en BD de prueba (rollback) y el script completo contra un Postgres local con esquema reducido (ensayo, ejecutar y abortos).
