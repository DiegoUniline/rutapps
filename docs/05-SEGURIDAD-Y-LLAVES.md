# 05 · Llaves primarias, RLS y reglas de seguridad

> Snapshot tomado directamente de Postgres (`pg_class`, `pg_constraint`, `pg_policies`)
> el **3 de agosto de 2026**. 153 tablas en el esquema `public`, **todas con RLS activado**.
> Para regenerar el esquema de campos y rutas: `bunx tsx scripts/gen-docs-schema.ts`.

---

## 1. Convenciones de llaves

- **Llave primaria**: casi todas las tablas usan `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- **Excepciones (llave compuesta o natural):**

| Tabla | Llave primaria |
|---|---|
| `broadcast_reads` | `(message_id, user_id)` |
| `internal_notification_reads` | `(notification_id, user_id)` |
| `distancia_cache` | `(empresa_id, origen_hash, destino_hash)` |
| `vendedor_ubicaciones` | `user_id` (una fila viva por vendedor) |

- **Llave de tenant**: `empresa_id uuid NOT NULL REFERENCES empresas(id)` en toda tabla de negocio.
  Las tablas hijas (`*_lineas`, `*_aplicaciones`, `promocion_aplicada`, …) **no** llevan
  `empresa_id`: heredan el aislamiento del padre por FK.
- **Únicos relevantes** (además del PK):

| Tabla | Restricción única |
|---|---|
| `empresas` | `email`, `telefono`, `licencia` (número de 8 dígitos irrepetible) |
| `clientes` | `portal_token` |
| `feature_flags` | `clave` |
| `billing_message_templates` | `tipo` |
| `carga_pedidos` | `(carga_id, venta_id)` |
| `cliente_pedido_sugerido` | `(cliente_id, producto_id)` |
| `lista_precios_lineas` | `(lista_precio_id, producto_id)` |
| `devolucion_motivo_config` | `(empresa_id, motivo)` |
| `consumo_datos` | `(empresa_id, user_id, fecha, origen)` |
| `empresa_addons` | `empresa_id` |
| `email_unsubscribe_tokens` | `email`, `token` |
| `cat_*` (catálogos SAT) | `clave` |

---

## 2. Cómo funciona la seguridad

### 2.1 Funciones helper (SECURITY DEFINER, `SET search_path = public`)

| Función | Qué devuelve | Uso |
|---|---|---|
| `get_my_empresa_id()` | `empresa_id` del `profiles` del usuario autenticado | base de casi toda política |
| `is_super_admin(uid)` | `true` si el usuario está en `super_admins` | override global |
| `has_role(uid, role)` | `true` si existe fila en `user_roles` | permisos por rol |
| `is_diego_super_admin()` | dueño de la plataforma (facturación/fiscal) | acciones críticas |

Nunca se consulta la propia tabla dentro de su política (evita recursión de RLS):
siempre se pasa por estas funciones.

### 2.2 Patrones de política que verás en la tabla del §3

| Etiqueta | Significado |
|---|---|
| `empresa` | `empresa_id = get_my_empresa_id()` (directo o vía JOIN al padre), normalmente con `OR is_super_admin(auth.uid())` |
| `super admin` | solo `super_admins` (o el dueño de plataforma) |
| `usuario` | ligada a `auth.uid()` (fila propia del usuario) |
| `abierta` | `USING (true)` — legible por cualquier sesión **autenticada** |
| `otra` | condición específica (token público, partner, service role) |
| `+anon` | la política también aplica al rol `anon` (acceso público sin sesión) |

### 2.3 GRANTs

Todas las tablas de `public` tienen GRANT a `anon`, `authenticated` y `service_role`
(PostgREST lo exige). **La barrera real es RLS**: sin política que lo permita, `anon` no
ve ninguna fila aunque tenga el GRANT.

### 2.4 Superficie pública intencional (rol `anon`)

Estas son las únicas rutas por las que un visitante sin sesión toca datos:

| Tabla | Política | Motivo |
|---|---|---|
| `cotizaciones`, `cotizacion_lineas` | lectura por token | cotización pública compartida |
| `tienda_config` | lectura si la tienda está activa | tienda en línea |
| `productos` | lectura acotada por auditoría/catálogo | catálogo público y escaneo |
| `auditoria_escaneos` | lectura/inserción acotada a la auditoría | escaneo desde móvil sin sesión |
| `subscription_plans`, `partner_niveles`, `tutorial_videos`, `unidades_sat`, `cat_*` | lectura | contenido público / catálogos SAT |
| `partner_solicitudes` | solo `INSERT` | formulario de alta de partner |

Todo lo demás pasa por sesión autenticada.

### 2.5 Reglas no negociables

1. **Roles nunca en `profiles`**: viven en `user_roles` / `roles` + `role_permisos`
   (evita escalación de privilegios).
2. **Toda función `SECURITY DEFINER` lleva `SET search_path = public`.**
3. **Índice obligatorio** en cada `empresa_id` y en cada FK usada en políticas o joins.
4. **RLS es la última línea, no la única**: el front filtra siempre por `empresa_id` y lo
   incluye en la `queryKey` de React Query (ver `docs/01`, §4).
5. **Service role** solo dentro de Edge Functions; nunca en el bundle del cliente.
6. **Dinero / stock / folios** se mueven exclusivamente por RPC atómicas con `FOR UPDATE`.

---

## 3. Tabla completa: PK · RLS · políticas · grants

| Tabla | PK | RLS | Políticas (cmd → alcance) | Grants |
|---|---|---|---|---|
| `ajustes_inventario` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `almacenes` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `auditoria_entradas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `auditoria_escaneos` | `id` | sí | Public read scans (SELECT→otra +anon); Tenant insert scans (INSERT→empresa); Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `auditoria_lineas` | `id` | sí | Tenant isolation (ALL→empresa); Tenant read auditoria_lineas (SELECT→empresa) | anon:R auth:R W service |
| `auditorias` | `id` | sí | Tenant isolation (ALL→empresa); Tenant read auditorias (SELECT→empresa) | anon:R auth:R W service |
| `billing_message_templates` | `id` | sí | Super admins manage billing templates (ALL→super admin) | anon:R auth:R W service |
| `billing_notifications` | `id` | sí | Super admins manage billing_notifications (ALL→super admin) | anon:R auth:R W service |
| `broadcast_messages` | `id` | sí | Auth users can read broadcasts (SELECT→abierta); Only super admins can delete broadcasts (DELETE→usuario); Only super admins can insert broadcasts (INSERT→usuario) | anon:R auth:R W service |
| `broadcast_reads` | `message_id,user_id` | sí | Users manage own reads (ALL→usuario) | anon:R auth:R W service |
| `caja_movimientos` | `id` | sí | caja_mov_delete_empresa (DELETE→empresa); caja_mov_insert_empresa (INSERT→empresa); caja_mov_select_empresa (SELECT→empresa); caja_mov_update_empresa (UPDATE→empresa) | anon:R auth:R W service |
| `caja_turnos` | `id` | sí | caja_turnos_delete_empresa (DELETE→empresa); caja_turnos_insert_empresa (INSERT→empresa); caja_turnos_select_empresa (SELECT→empresa); caja_turnos_update_empresa (UPDATE→empresa) | anon:R auth:R W service |
| `cancellation_requests` | `id` | sí | Super admins view all (SELECT→super admin); Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `carga_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `carga_pedidos` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cargas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cat_forma_pago` | `id` | sí | Public read (SELECT→abierta) | anon:R auth:R W service |
| `cat_metodo_pago` | `id` | sí | Public read (SELECT→abierta) | anon:R auth:R W service |
| `cat_moneda` | `id` | sí | Public read (SELECT→abierta) | anon:R auth:R W service |
| `cat_regimen_fiscal` | `id` | sí | Public read (SELECT→abierta) | anon:R auth:R W service |
| `cat_tipo_comprobante` | `id` | sí | Public read (SELECT→abierta) | anon:R auth:R W service |
| `cat_uso_cfdi` | `id` | sí | Public read (SELECT→abierta) | anon:R auth:R W service |
| `cfdi_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cfdi_pago_documentos` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cfdi_pagos` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cfdis` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `clasificaciones` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cliente_orden_ruta` | `id` | sí | cliente_orden_ruta_tenant_isolation (ALL→empresa) | anon:R auth:R W service |
| `cliente_pedido_sugerido` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `clientes` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cobradores` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cobro_aplicaciones` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cobro_reintentos` | `id` | sí | Super admin can manage cobro_reintentos (ALL→super admin) | anon:R auth:R W service |
| `cobros` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `comision_esquemas` | `id` | sí | esquemas_modify_empresa (ALL→usuario); esquemas_select_empresa (SELECT→usuario) | anon:R auth:R W service |
| `compra_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `compras` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `consumo_datos` | `id` | sí | consumo_datos_insert_propio (INSERT→empresa); consumo_datos_select_empresa (SELECT→empresa); consumo_datos_update_propio (UPDATE→usuario) | anon:R auth:R W service |
| `conteo_entradas` | `id` | sí | conteo_entradas_empresa (ALL→empresa) | anon:R auth:R W service |
| `conteo_lineas` | `id` | sí | conteo_lineas_empresa (ALL→empresa) | anon:R auth:R W service |
| `conteos_fisicos` | `id` | sí | conteos_empresa (ALL→empresa) | anon:R auth:R W service |
| `cotizacion_lineas` | `id` | sí | Public read lineas (SELECT→abierta +anon); Tenant isolation lineas (ALL→empresa) | anon:R auth:R W service |
| `cotizaciones` | `id` | sí | Public token read (SELECT→abierta +anon); Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `cupon_usos` | `id` | sí | Partner ve usos de sus cupones (SELECT→otra); cupon_usos_insert_empresa (INSERT→empresa); cupon_usos_select_empresa (SELECT→empresa); cupon_usos_super_admin (ALL→super admin) | anon:R auth:R W service |
| `cupones` | `id` | sí | Partner crea/edita/elimina sus cupones (INSERT, UPDATE, DELETE→otra); Partner ve sus cupones (SELECT→super admin); cupones_delete/insert/update_super_admin (→super admin) | anon:R auth:R W service |
| `dashboard_ai_recomendaciones` | `id` | sí | Users delete own AI reco (DELETE→usuario); Users insert own AI reco (INSERT→usuario); Users view own empresa AI reco (SELECT→usuario) | anon:R auth:R W service |
| `descarga_ruta` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `descarga_ruta_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `devolucion_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `devolucion_motivo_config` | `id` | sí | Tenant devol motivo config (ALL→empresa) | anon:R auth:R W service |
| `devoluciones` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `distancia_cache` | `empresa_id,origen_hash,destino_hash` | sí | distancia_cache empresa access (ALL→usuario) | anon:R auth:R W service |
| `email_send_log` | `id` | sí | Service role can insert/read/update send log (→otra) | anon:R auth:R W service |
| `email_send_state` | `id` | sí | Service role can manage send state (ALL→otra) | anon:R auth:R W service |
| `email_unsubscribe_tokens` | `id` | sí | Service role can insert/read/mark tokens (→otra) | anon:R auth:R W service |
| `empresa_addons` | `id` | sí | empresa_addons insert by empresa or admin (INSERT→super admin); read by own empresa (SELECT→super admin); update super admin only (UPDATE→super admin) | anon:R auth:R W service |
| `empresas` | `id` | sí | Partners can view referred empresas (SELECT→usuario); Super admins can insert/update/view all (→super admin); Users can update/view their empresa (→empresa) | anon:R auth:R W service |
| `entrega_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `entregas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `facturas` | `id` | sí | Only Diego can delete/insert/update invoices (→usuario); Users can read own company invoices or Diego all (SELECT→empresa) | anon:R auth:R W service |
| `feature_flags` | `id` | sí | feature_flags_admin_all (ALL→super admin); feature_flags_select_auth (SELECT→abierta) | anon:R auth:R W service |
| `gastos` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `import_job_lineas` | `id` | sí | Tenant manage import_job_lineas (ALL→empresa) | anon:R auth:R W service |
| `import_jobs` | `id` | sí | Tenant manage import_jobs (ALL→empresa) | anon:R auth:R W service |
| `internal_notification_reads` | `notification_id,user_id` | sí | manage_own_reads (ALL→usuario) | anon:R auth:R W service |
| `internal_notifications` | `id` | sí | delete_same_empresa (DELETE→usuario); select_same_empresa (SELECT→usuario) | anon:R auth:R W service |
| `lista_precios` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `lista_precios_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `listas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `lotes` | `id` | sí | lotes_delete/insert/select/update (→empresa) | anon:R auth:R W service |
| `maintenance_log` | `id` | sí | Super admins can insert/view maintenance log (→super admin) | anon:R auth:R W service |
| `marcas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `merma_lineas` | `id` | sí | Tenant isolation merma_lineas (ALL→empresa) | anon:R auth:R W service |
| `merma_motivos` | `id` | sí | Tenant isolation merma_motivos (ALL→empresa) | anon:R auth:R W service |
| `mermas` | `id` | sí | Tenant isolation mermas (ALL→empresa) | anon:R auth:R W service |
| `metas_venta` | `id` | sí | metas_venta tenant access (ALL→super admin) | anon:R auth:R W service |
| `movimientos_inventario` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `notification_views` | `id` | sí | Users manage own views (ALL→usuario) | anon:R auth:R W service |
| `notifications` | `id` | sí | Super admins manage all notifications (ALL→super admin); Users read own tenant notifications (SELECT→empresa) | anon:R auth:R W service |
| `optimizacion_recargas` | `id` | sí | Admins ven recargas de su empresa (SELECT→usuario) | anon:R auth:R W service |
| `optimizacion_rutas_log` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `otp_codes` | `id` | sí | Super admins can read otp_codes (SELECT→super admin) | anon:R auth:R W service |
| `pago_comisiones` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `pago_compras` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `partner_atribuciones` | `id` | sí | Partner ve sus atribuciones (SELECT→super admin); Super admin gestiona atribuciones (ALL→super admin) | anon:R auth:R W service |
| `partner_comisiones` | `id` | sí | Partner ve sus comisiones (SELECT→super admin); Super admin gestiona comisiones (ALL→super admin) | anon:R auth:R W service |
| `partner_niveles` | `id` | sí | Niveles públicos (SELECT→abierta); Solo super admin gestiona niveles (ALL→super admin) | anon:R auth:R W service |
| `partner_pagos` | `id` | sí | Partner ve sus pagos (SELECT→super admin); Super admin gestiona pagos (ALL→super admin) | anon:R auth:R W service |
| `partner_solicitudes` | `id` | sí | public_insert_partner_solicitud (INSERT→otra +anon); super_admin_select/update/delete_solicitudes (→usuario) | anon:R auth:R W service |
| `partners` | `id` | sí | Partner actualiza notas/contacto (UPDATE→usuario); Partner ve sus datos (SELECT→super admin); Super admin gestiona partners (ALL→super admin) | anon:R auth:R W service |
| `payment_links` | `id` | sí | Super admins manage payment_links (ALL→super admin) | anon:R auth:R W service |
| `planes` | `id` | sí | Authenticated users can read active plans (SELECT→abierta) | anon:R auth:R W service |
| `producto_equivalencias` | `id` | sí | Tenant manage producto_equivalencias (ALL→empresa) | anon:R auth:R W service |
| `producto_presentaciones` | `id` | sí | Tenant isolation presentaciones (ALL→empresa) | anon:R auth:R W service |
| `producto_proveedores` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `productos` | `id` | sí | Anon read productos via audit (SELECT→otra +anon); Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `profiles` | `id` | sí | Super admins can view all profiles (SELECT→super admin); Users can insert own profile (INSERT→usuario); Users can update/view empresa profiles (→empresa); Users can update/view own profile (→usuario) | anon:R auth:R W service |
| `promocion_aplicada` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `promociones` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `proveedores` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `publicidad_anuncios` | `id` | sí | Anyone authenticated can view active ads (SELECT→abierta); Super admins can manage ads (ALL→usuario) | anon:R auth:R W service |
| `publicidad_vistas` | `id` | sí | Super admins see all views (SELECT→usuario); Users insert/see their own views (→usuario) | anon:R auth:R W service |
| `reportes_personalizados` | `id` | sí | Empresa members manage reportes_personalizados (ALL→usuario) | anon:R auth:R W service |
| `role_permisos` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `roles` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `ruta_polyline_cache` | `id` | sí | polyline_cache empresa access (ALL→usuario) | anon:R auth:R W service |
| `ruta_sesiones` | `id` | sí | ruta_sesiones_delete/insert/select/update_empresa (→empresa) | anon:R auth:R W service |
| `solicitudes_pago` | `id` | sí | Super admins full access solicitudes (ALL→super admin); Users can create solicitudes (INSERT→empresa); Users can view own empresa solicitudes (SELECT→empresa) | anon:R auth:R W service |
| `stock_almacen` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `stock_apartado` | `id` | sí | stock_apartado tenant access (ALL→usuario) | anon:R auth:R W service |
| `stock_camion` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `stock_lotes` | `id` | sí | stock_lotes_delete/insert/select/update (→empresa) | anon:R auth:R W service |
| `subscription_plans` | `id` | sí | Anon can read active plans (SELECT→otra +anon); Anyone can read plans (SELECT→abierta); Super admins manage plans (ALL→usuario) | anon:R auth:R W service |
| `subscriptions` | `id` | sí | Empresa can read own subscription (SELECT→empresa); Super admins manage subscriptions (ALL→super admin) | anon:R auth:R W service |
| `super_admins` | `id` | sí | Super admins full access on super_admins (ALL→super admin) | anon:R auth:R W service |
| `suppressed_emails` | `id` | sí | Service role can insert/read suppressed emails (→otra) | anon:R auth:R W service |
| `tarifa_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `tarifas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `tasas_ieps` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `tasas_isr_ret` | `id` | sí | tasas_isr_ret_read (SELECT→empresa); tasas_isr_ret_write (ALL→empresa) | anon:R auth:R W service |
| `tasas_iva` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `tasas_iva_ret` | `id` | sí | tasas_iva_ret_read (SELECT→empresa); tasas_iva_ret_write (ALL→empresa) | anon:R auth:R W service |
| `tienda_clientes` | `id` | sí | Empresa admin ve tienda clientes (ALL→usuario) | anon:R auth:R W service |
| `tienda_config` | `id` | sí | Empresa admin manage tienda config (ALL→super admin); Tienda config visible públicamente si activa (SELECT→otra +anon) | anon:R auth:R W service |
| `timbres_movimientos` | `id` | sí | Super admins manage all movimientos (ALL→super admin); Users can view their empresa movimientos (SELECT→empresa) | anon:R auth:R W service |
| `timbres_saldo` | `id` | sí | Super admins manage all saldos (ALL→super admin); Users can view their empresa saldo (SELECT→empresa) | anon:R auth:R W service |
| `traspaso_lineas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `traspasos` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `trial_blacklist` | `id` | sí | Super admins can manage blacklist (ALL→super admin) | anon:R auth:R W service |
| `tutorial_videos` | `id` | sí | Anyone can view tutorial videos (SELECT→abierta +anon); Only owner can insert/update/delete (→super admin) | anon:R auth:R W service |
| `unidades` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `unidades_sat` | `id` | sí | Public read (SELECT→abierta) | anon:R auth:R W service |
| `user_favorites` | `id` | sí | Users insert/update/delete/view own favorites (→usuario) | anon:R auth:R W service |
| `user_roles` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `vehiculos` | `id` | sí | vehiculos_delete/insert/select/update_empresa (→empresa) | anon:R auth:R W service |
| `vendedor_ubicaciones` | `user_id` | sí | vu_company_select (SELECT→empresa); vu_self_upsert/update (→empresa); vu_self_delete (DELETE→usuario) | anon:R auth:R W service |
| `vendedor_ubicaciones_historial` | `id` | sí | Empresa puede leer su historial (SELECT→empresa); Usuario inserta su propio punto (INSERT→empresa) | anon:R auth:R W service |
| `vendedores` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `venta_comisiones` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `venta_historial` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `venta_lineas` | `id` | sí | Tenant isolation (ALL→empresa, vía `ventas`) | anon:R auth:R W service |
| `ventas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `ventas_descuadre_auditoria` | `id` | sí | empresa puede ver sus descuadres (SELECT→empresa) | anon:R auth:R W service |
| `visitas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `wa_bot_authorized_numbers` | `id` | sí | wa_bot_numbers select/insert/update/delete by empresa (→super admin) | anon:R auth:R W service |
| `wa_bot_logs` | `id` | sí | wa_bot_logs read by empresa (SELECT→super admin) | anon:R auth:R W service |
| `wa_campaign_sends` | `id` | sí | Super admins full access campaign sends (ALL→super admin) | anon:R auth:R W service |
| `wa_campaigns` | `id` | sí | Super admins full access campaigns (ALL→super admin) | anon:R auth:R W service |
| `wa_optouts` | `id` | sí | Super admins read wa_optouts (SELECT→super admin); insert/delete (→usuario) | anon:R auth:R W service |
| `whatsapp_config` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `whatsapp_log` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `whatsapp_templates` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |
| `zonas` | `id` | sí | Tenant isolation (ALL→empresa) | anon:R auth:R W service |

---

## 4. Cómo verificar que sigue vigente

```sql
-- tablas sin RLS (debe devolver 0 filas)
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;

-- tablas con RLS pero sin políticas (quedan bloqueadas)
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity
and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname);
```

En el front: `bun scripts/audit-empresa-filter.ts` y `bun scripts/audit-pagination.ts`.
