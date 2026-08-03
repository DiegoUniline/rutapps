# 02 · Esquema de la base de datos (autogenerado)

> Generado con `scripts/gen-docs-schema.ts` a partir de `src/integrations/supabase/types.ts`.
> No editar a mano: regenerar tras cada migración.

**Totales:** 153 tablas · 1 vistas · 78 funciones RPC · 17 enums.

## Índice de tablas

- [ajustes_inventario](#ajustesinventario) (12 campos)
- [almacenes](#almacenes) (10 campos)
- [auditoria_entradas](#auditoriaentradas) (5 campos)
- [auditoria_escaneos](#auditoriaescaneos) (7 campos)
- [auditoria_lineas](#auditorialineas) (11 campos)
- [auditorias](#auditorias) (16 campos)
- [billing_message_templates](#billingmessagetemplates) (9 campos)
- [billing_notifications](#billingnotifications) (12 campos)
- [broadcast_messages](#broadcastmessages) (5 campos)
- [broadcast_reads](#broadcastreads) (3 campos)
- [caja_movimientos](#cajamovimientos) (8 campos)
- [caja_turnos](#cajaturnos) (23 campos)
- [cancellation_requests](#cancellationrequests) (9 campos)
- [carga_lineas](#cargalineas) (7 campos)
- [carga_pedidos](#cargapedidos) (4 campos)
- [cargas](#cargas) (10 campos)
- [cat_forma_pago](#catformapago) (4 campos)
- [cat_metodo_pago](#catmetodopago) (4 campos)
- [cat_moneda](#catmoneda) (4 campos)
- [cat_regimen_fiscal](#catregimenfiscal) (6 campos)
- [cat_tipo_comprobante](#cattipocomprobante) (4 campos)
- [cat_uso_cfdi](#catusocfdi) (6 campos)
- [cfdi_lineas](#cfdilineas) (17 campos)
- [cfdi_pago_documentos](#cfdipagodocumentos) (18 campos)
- [cfdi_pagos](#cfdipagos) (36 campos)
- [cfdis](#cfdis) (39 campos)
- [clasificaciones](#clasificaciones) (6 campos)
- [cliente_orden_ruta](#clienteordenruta) (11 campos)
- [cliente_pedido_sugerido](#clientepedidosugerido) (5 campos)
- [clientes](#clientes) (49 campos)
- [cobradores](#cobradores) (6 campos)
- [cobro_aplicaciones](#cobroaplicaciones) (5 campos)
- [cobro_reintentos](#cobroreintentos) (11 campos)
- [cobros](#cobros) (15 campos)
- [comision_esquemas](#comisionesquemas) (10 campos)
- [compra_lineas](#compralineas) (11 campos)
- [compras](#compras) (17 campos)
- [consumo_datos](#consumodatos) (11 campos)
- [conteo_entradas](#conteoentradas) (6 campos)
- [conteo_lineas](#conteolineas) (15 campos)
- [conteos_fisicos](#conteosfisicos) (17 campos)
- [cotizacion_lineas](#cotizacionlineas) (23 campos)
- [cotizaciones](#cotizaciones) (30 campos)
- [cupon_usos](#cuponusos) (6 campos)
- [cupones](#cupones) (15 campos)
- [dashboard_ai_recomendaciones](#dashboardairecomendaciones) (7 campos)
- [descarga_ruta](#descargaruta) (19 campos)
- [descarga_ruta_lineas](#descargarutalineas) (9 campos)
- [devolucion_lineas](#devolucionlineas) (10 campos)
- [devolucion_motivo_config](#devolucionmotivoconfig) (5 campos)
- [devoluciones](#devoluciones) (14 campos)
- [distancia_cache](#distanciacache) (6 campos)
- [email_send_log](#emailsendlog) (8 campos)
- [email_send_state](#emailsendstate) (7 campos)
- [email_unsubscribe_tokens](#emailunsubscribetokens) (5 campos)
- [empresa_addons](#empresaaddons) (10 campos)
- [empresas](#empresas) (44 campos)
- [entrega_lineas](#entregalineas) (15 campos)
- [entregas](#entregas) (20 campos)
- [facturas](#facturas) (22 campos)
- [feature_flags](#featureflags) (9 campos)
- [gastos](#gastos) (13 campos)
- [import_job_lineas](#importjoblineas) (13 campos)
- [import_jobs](#importjobs) (15 campos)
- [internal_notification_reads](#internalnotificationreads) (3 campos)
- [internal_notifications](#internalnotifications) (12 campos)
- [lista_precios](#listaprecios) (9 campos)
- [lista_precios_lineas](#listaprecioslineas) (5 campos)
- [listas](#listas) (5 campos)
- [lotes](#lotes) (11 campos)
- [maintenance_log](#maintenancelog) (6 campos)
- [marcas](#marcas) (5 campos)
- [merma_lineas](#mermalineas) (10 campos)
- [merma_motivos](#mermamotivos) (5 campos)
- [mermas](#mermas) (16 campos)
- [metas_venta](#metasventa) (15 campos)
- [movimientos_inventario](#movimientosinventario) (16 campos)
- [notification_views](#notificationviews) (6 campos)
- [notifications](#notifications) (14 campos)
- [optimizacion_recargas](#optimizacionrecargas) (12 campos)
- [optimizacion_rutas_log](#optimizacionrutaslog) (6 campos)
- [otp_codes](#otpcodes) (6 campos)
- [pago_comisiones](#pagocomisiones) (15 campos)
- [pago_compras](#pagocompras) (11 campos)
- [partner_atribuciones](#partneratribuciones) (7 campos)
- [partner_comisiones](#partnercomisiones) (14 campos)
- [partner_niveles](#partnerniveles) (11 campos)
- [partner_pagos](#partnerpagos) (9 campos)
- [partner_solicitudes](#partnersolicitudes) (14 campos)
- [partners](#partners) (14 campos)
- [payment_links](#paymentlinks) (19 campos)
- [planes](#planes) (10 campos)
- [producto_equivalencias](#productoequivalencias) (9 campos)
- [producto_presentaciones](#productopresentaciones) (12 campos)
- [producto_proveedores](#productoproveedores) (8 campos)
- [productos](#productos) (57 campos)
- [profiles](#profiles) (17 campos)
- [promocion_aplicada](#promocionaplicada) (7 campos)
- [promociones](#promociones) (21 campos)
- [proveedores](#proveedores) (24 campos)
- [publicidad_anuncios](#publicidadanuncios) (12 campos)
- [publicidad_vistas](#publicidadvistas) (4 campos)
- [reportes_personalizados](#reportespersonalizados) (10 campos)
- [role_permisos](#rolepermisos) (5 campos)
- [roles](#roles) (9 campos)
- [ruta_polyline_cache](#rutapolylinecache) (8 campos)
- [ruta_sesiones](#rutasesiones) (22 campos)
- [solicitudes_pago](#solicitudespago) (17 campos)
- [stock_almacen](#stockalmacen) (6 campos)
- [stock_apartado](#stockapartado) (10 campos)
- [stock_camion](#stockcamion) (8 campos)
- [stock_lotes](#stocklotes) (7 campos)
- [subscription_plans](#subscriptionplans) (21 campos)
- [subscriptions](#subscriptions) (21 campos)
- [super_admins](#superadmins) (4 campos)
- [suppressed_emails](#suppressedemails) (5 campos)
- [tarifa_lineas](#tarifalineas) (17 campos)
- [tarifas](#tarifas) (10 campos)
- [tasas_ieps](#tasasieps) (5 campos)
- [tasas_isr_ret](#tasasisrret) (5 campos)
- [tasas_iva](#tasasiva) (5 campos)
- [tasas_iva_ret](#tasasivaret) (5 campos)
- [tienda_clientes](#tiendaclientes) (10 campos)
- [tienda_config](#tiendaconfig) (19 campos)
- [timbres_movimientos](#timbresmovimientos) (10 campos)
- [timbres_saldo](#timbressaldo) (4 campos)
- [traspaso_lineas](#traspasolineas) (5 campos)
- [traspasos](#traspasos) (13 campos)
- [trial_blacklist](#trialblacklist) (7 campos)
- [tutorial_videos](#tutorialvideos) (8 campos)
- [unidades](#unidades) (6 campos)
- [unidades_sat](#unidadessat) (4 campos)
- [user_favorites](#userfavorites) (7 campos)
- [user_roles](#userroles) (4 campos)
- [vehiculos](#vehiculos) (16 campos)
- [vendedor_ubicaciones](#vendedorubicaciones) (9 campos)
- [vendedor_ubicaciones_historial](#vendedorubicacioneshistorial) (8 campos)
- [vendedores](#vendedores) (5 campos)
- [venta_comisiones](#ventacomisiones) (13 campos)
- [venta_historial](#ventahistorial) (8 campos)
- [venta_lineas](#ventalineas) (47 campos)
- [ventas](#ventas) (38 campos)
- [ventas_descuadre_auditoria](#ventasdescuadreauditoria) (11 campos)
- [visitas](#visitas) (12 campos)
- [wa_bot_authorized_numbers](#wabotauthorizednumbers) (21 campos)
- [wa_bot_logs](#wabotlogs) (10 campos)
- [wa_campaign_sends](#wacampaignsends) (8 campos)
- [wa_campaigns](#wacampaigns) (9 campos)
- [wa_optouts](#waoptouts) (6 campos)
- [whatsapp_config](#whatsappconfig) (16 campos)
- [whatsapp_log](#whatsapplog) (10 campos)
- [whatsapp_templates](#whatsapptemplates) (7 campos)
- [zonas](#zonas) (5 campos)

---

## ajustes_inventario

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `batch_id` | string | sí |  |  |
| `cantidad_anterior` | number | no |  |  |
| `cantidad_nueva` | number | no |  |  |
| `created_at` | string | no |  |  |
| `diferencia` | number | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `id` | string | no |  |  |
| `motivo` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `user_id` | string | no | **sí** |  |

---

## almacenes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `direccion` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `es_merma` | boolean | no |  |  |
| `gps_lat` | number | sí |  |  |
| `gps_lng` | number | sí |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `tipo` | string | no |  |  |

**Referenciada por:** `ajustes_inventario.almacen_id`, `auditorias.almacen_id`, `cargas.almacen_destino_id`, `cargas.almacen_id`, `compras.almacen_id`, `conteos_fisicos.almacen_id`, `cotizaciones.almacen_id`, `descarga_ruta.almacen_destino_id`, `devoluciones.almacen_destino_id`, `entrega_lineas.almacen_origen_id`, `entregas.almacen_id`, `mermas.almacen_origen_id`, `movimientos_inventario.almacen_destino_id`, `movimientos_inventario.almacen_origen_id`, `profiles.almacen_id`, `stock_almacen.almacen_id`, `tienda_config.almacen_id`, `traspasos.almacen_destino_id`, `traspasos.almacen_origen_id`, `venta_lineas.almacen_id`, `ventas.almacen_id`

---

## auditoria_entradas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `auditoria_linea_id` | string | no | **sí** | → `auditoria_lineas.id` |
| `cantidad` | number | no |  |  |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## auditoria_escaneos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `auditoria_id` | string | no | **sí** | → `auditorias.id` |
| `cantidad` | number | no |  |  |
| `created_at` | string | no |  |  |
| `escaneado_at` | string | no |  |  |
| `escaneado_por` | string | no |  |  |
| `id` | string | no |  |  |
| `linea_id` | string | no | **sí** | → `auditoria_lineas.id` |

---

## auditoria_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `ajustado` | boolean | no |  |  |
| `auditoria_id` | string | no | **sí** | → `auditorias.id` |
| `cantidad_esperada` | number | no |  |  |
| `cantidad_real` | number | sí |  |  |
| `cerrada` | boolean | no |  |  |
| `cerrada_at` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `diferencia` | number | no |  |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |

**Referenciada por:** `auditoria_entradas.auditoria_linea_id`, `auditoria_escaneos.linea_id`

---

## auditorias

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `aprobado_por` | string | sí |  | → `profiles.id` |
| `cerrada_at` | string | sí |  |  |
| `cerrada_por` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `fecha_aprobacion` | string | sí |  |  |
| `filtro_tipo` | string | no |  |  |
| `filtro_valor` | string | sí |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `notas` | string | sí |  |  |
| `notas_supervisor` | string | sí |  |  |
| `status` | Database["public"]["Enums"]["status_auditoria"] | no |  |  |
| `user_id` | string | no | **sí** |  |

**Referenciada por:** `auditoria_escaneos.auditoria_id`, `auditoria_lineas.auditoria_id`

---

## billing_message_templates

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `campos` | Json | no |  |  |
| `created_at` | string | no |  |  |
| `emoji` | string | no |  |  |
| `encabezado` | string | sí |  |  |
| `id` | string | no |  |  |
| `pie_mensaje` | string | sí |  |  |
| `tipo` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |

---

## billing_notifications

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `channel` | string | no |  |  |
| `created_at` | string | no |  |  |
| `customer_email` | string | no | **sí** |  |
| `customer_phone` | string | sí |  |  |
| `error_detalle` | string | sí |  |  |
| `id` | string | no |  |  |
| `mensaje` | string | sí |  |  |
| `monto_centavos` | number | sí |  |  |
| `status` | string | no |  |  |
| `stripe_invoice_id` | string | sí |  |  |
| `stripe_invoice_url` | string | sí |  |  |
| `tipo` | string | no |  |  |

---

## broadcast_messages

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `id` | string | no |  |  |
| `mensaje` | string | no | **sí** |  |
| `tipo` | string | no |  |  |

**Referenciada por:** `broadcast_reads.message_id`

---

## broadcast_reads

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `message_id` | string | no | **sí** | → `broadcast_messages.id` |
| `read_at` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## caja_movimientos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `monto` | number | no | **sí** |  |
| `motivo` | string | sí |  |  |
| `tipo` | string | no | **sí** |  |
| `turno_id` | string | no | **sí** | → `caja_turnos.id` |
| `user_id` | string | no | **sí** |  |

---

## caja_turnos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `abierto_at` | string | no |  |  |
| `arqueo_denominaciones` | Json | sí |  |  |
| `caja_nombre` | string | no |  |  |
| `cajero_id` | string | no | **sí** |  |
| `cerrado_at` | string | sí |  |  |
| `cerrado_por` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `diferencia` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fondo_inicial` | number | no |  |  |
| `id` | string | no |  |  |
| `notas_apertura` | string | sí |  |  |
| `notas_cierre` | string | sí |  |  |
| `status` | string | no |  |  |
| `total_efectivo_contado` | number | sí |  |  |
| `total_efectivo_esperado` | number | sí |  |  |
| `total_otros_contado` | number | sí |  |  |
| `total_otros_esperado` | number | sí |  |  |
| `total_tarjeta_contado` | number | sí |  |  |
| `total_tarjeta_esperado` | number | sí |  |  |
| `total_transferencia_contado` | number | sí |  |  |
| `total_transferencia_esperado` | number | sí |  |  |
| `updated_at` | string | no |  |  |

**Referenciada por:** `caja_movimientos.turno_id`, `ventas.turno_id`

---

## cancellation_requests

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cancelled` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `discount_accepted` | boolean | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `offered_discount` | boolean | no |  |  |
| `reason` | string | no |  |  |
| `reason_detail` | string | sí |  |  |
| `user_id` | string | no | **sí** |  |

---

## carga_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad_cargada` | number | no |  |  |
| `cantidad_devuelta` | number | no |  |  |
| `cantidad_vendida` | number | no |  |  |
| `carga_id` | string | no | **sí** | → `cargas.id` |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `producto_id` | string | sí |  | → `productos.id` |

---

## carga_pedidos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `carga_id` | string | no | **sí** | → `cargas.id` |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `venta_id` | string | no | **sí** | → `ventas.id` |

---

## cargas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_destino_id` | string | sí |  | → `almacenes.id` |
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `repartidor_id` | string | sí |  | → `profiles.id` |
| `status` | Database["public"]["Enums"]["status_carga"] | no |  |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |

**Referenciada por:** `carga_lineas.carga_id`, `carga_pedidos.carga_id`, `descarga_ruta.carga_id`, `devoluciones.carga_id`, `ruta_sesiones.carga_id`

---

## cat_forma_pago

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `clave` | string | no | **sí** |  |
| `descripcion` | string | no | **sí** |  |
| `id` | string | no |  |  |

---

## cat_metodo_pago

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `clave` | string | no | **sí** |  |
| `descripcion` | string | no | **sí** |  |
| `id` | string | no |  |  |

---

## cat_moneda

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `clave` | string | no | **sí** |  |
| `descripcion` | string | no | **sí** |  |
| `id` | string | no |  |  |

---

## cat_regimen_fiscal

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `clave` | string | no | **sí** |  |
| `descripcion` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `persona_fisica` | boolean | sí |  |  |
| `persona_moral` | boolean | sí |  |  |

---

## cat_tipo_comprobante

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `clave` | string | no | **sí** |  |
| `descripcion` | string | no | **sí** |  |
| `id` | string | no |  |  |

---

## cat_uso_cfdi

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `clave` | string | no | **sí** |  |
| `descripcion` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `persona_fisica` | boolean | sí |  |  |
| `persona_moral` | boolean | sí |  |  |

---

## cfdi_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no |  |  |
| `cfdi_id` | string | no | **sí** | → `cfdis.id` |
| `created_at` | string | no |  |  |
| `descripcion` | string | no |  |  |
| `id` | string | no |  |  |
| `ieps_monto` | number | no |  |  |
| `ieps_pct` | number | no |  |  |
| `iva_monto` | number | no |  |  |
| `iva_pct` | number | no |  |  |
| `precio_unitario` | number | no |  |  |
| `product_code` | string | no |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `subtotal` | number | no |  |  |
| `total` | number | no |  |  |
| `unit_code` | string | no |  |  |
| `unit_name` | string | no |  |  |
| `venta_linea_id` | string | sí |  | → `venta_lineas.id` |

---

## cfdi_pago_documentos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cfdi_id` | string | sí |  | → `cfdis.id` |
| `cfdi_pago_id` | string | no | **sí** | → `cfdi_pagos.id` |
| `cfdi_relacionado_uuid` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `folio_dr` | string | sí |  |  |
| `id` | string | no |  |  |
| `imp_pagado` | number | no |  |  |
| `imp_saldo_ant` | number | no |  |  |
| `imp_saldo_insoluto` | number | no |  |  |
| `iva_trasladado_dr` | number | no |  |  |
| `metodo_pago_dr` | string | sí |  |  |
| `moneda_dr` | string | no |  |  |
| `num_parcialidad` | number | no |  |  |
| `objeto_imp_dr` | string | sí |  |  |
| `serie_dr` | string | sí |  |  |
| `tipo_cambio_dr` | number | no |  |  |
| `venta_id` | string | sí |  | → `ventas.id` |

---

## cfdi_pagos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cadena_original` | string | sí |  |  |
| `cancel_date` | string | sí |  |  |
| `cancel_status` | string | sí |  |  |
| `cobro_id` | string | sí |  | → `cobros.id` |
| `created_at` | string | no |  |  |
| `cta_beneficiario` | string | sí |  |  |
| `cta_ordenante` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `enviado_a` | string | sí |  |  |
| `enviado_at` | string | sí |  |  |
| `error_detalle` | string | sí |  |  |
| `expedition_place` | string | sí |  |  |
| `facturama_id` | string | sí |  |  |
| `fecha_pago` | string | no | **sí** |  |
| `fecha_timbrado` | string | sí |  |  |
| `folio` | string | sí |  |  |
| `folio_fiscal` | string | sí |  |  |
| `forma_pago` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `moneda` | string | no |  |  |
| `monto` | number | no |  |  |
| `no_certificado_emisor` | string | sí |  |  |
| `no_certificado_sat` | string | sí |  |  |
| `nom_banco_ord_ext` | string | sí |  |  |
| `num_operacion` | string | sí |  |  |
| `pdf_url` | string | sí |  |  |
| `rfc_emisor_cta_ben` | string | sí |  |  |
| `rfc_emisor_cta_ord` | string | sí |  |  |
| `sello_cfdi` | string | sí |  |  |
| `sello_sat` | string | sí |  |  |
| `serie` | string | sí |  |  |
| `status` | string | no |  |  |
| `tipo_cambio` | number | no |  |  |
| `updated_at` | string | no |  |  |
| `user_id` | string | no | **sí** |  |
| `xml_url` | string | sí |  |  |

**Referenciada por:** `cfdi_pago_documentos.cfdi_pago_id`

---

## cfdis

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cadena_original` | string | sí |  |  |
| `cancel_date` | string | sí |  |  |
| `cancel_status` | string | sí |  |  |
| `cfdi_type` | string | no |  |  |
| `created_at` | string | no |  |  |
| `currency` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `enviado_a` | string | sí |  |  |
| `enviado_at` | string | sí |  |  |
| `error_detalle` | string | sí |  |  |
| `expedition_place` | string | sí |  |  |
| `facturama_id` | string | sí |  |  |
| `fecha_timbrado` | string | sí |  |  |
| `folio` | string | sí |  |  |
| `folio_fiscal` | string | sí |  |  |
| `id` | string | no |  |  |
| `ieps_total` | number | no |  |  |
| `iva_total` | number | no |  |  |
| `no_certificado_emisor` | string | sí |  |  |
| `no_certificado_sat` | string | sí |  |  |
| `payment_form` | string | sí |  |  |
| `payment_method` | string | sí |  |  |
| `pdf_url` | string | sí |  |  |
| `receiver_cfdi_use` | string | sí |  |  |
| `receiver_fiscal_regime` | string | sí |  |  |
| `receiver_name` | string | sí |  |  |
| `receiver_rfc` | string | sí |  |  |
| `receiver_tax_zip_code` | string | sí |  |  |
| `retenciones_total` | number | no |  |  |
| `sello_cfdi` | string | sí |  |  |
| `sello_sat` | string | sí |  |  |
| `serie` | string | sí |  |  |
| `status` | string | no |  |  |
| `subtotal` | number | no |  |  |
| `total` | number | no |  |  |
| `updated_at` | string | no |  |  |
| `user_id` | string | no | **sí** |  |
| `venta_id` | string | sí |  | → `ventas.id` |
| `xml_url` | string | sí |  |  |

**Referenciada por:** `cfdi_lineas.cfdi_id`, `cfdi_pago_documentos.cfdi_id`, `venta_lineas.factura_cfdi_id`

---

## clasificaciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `imagen_url` | string | sí |  |  |
| `nombre` | string | no | **sí** |  |

**Referenciada por:** `conteos_fisicos.clasificacion_id`, `metas_venta.clasificacion_id`, `productos.clasificacion_id`

---

## cliente_orden_ruta

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cliente_id` | string | no | **sí** | → `clientes.id` |
| `created_at` | string | no |  |  |
| `dia` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `orden` | number | no |  |  |
| `origin_label` | string | sí |  |  |
| `origin_lat` | number | sí |  |  |
| `origin_lng` | number | sí |  |  |
| `updated_at` | string | no |  |  |
| `vendedor_id` | string | sí |  |  |

---

## cliente_pedido_sugerido

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no |  |  |
| `cliente_id` | string | no | **sí** | → `clientes.id` |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `producto_id` | string | sí |  | → `productos.id` |

---

## clientes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cobrador_id` | string | sí |  | → `profiles.id` |
| `codigo` | string | sí |  |  |
| `colonia` | string | sí |  |  |
| `contacto` | string | sí |  |  |
| `cp` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `credito` | boolean | sí |  |  |
| `dia_visita` | string[] | sí |  |  |
| `dias_credito` | number | sí |  |  |
| `direccion` | string | sí |  |  |
| `email` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `facturama_correo_facturacion` | string | sí |  |  |
| `facturama_cp` | string | sí |  |  |
| `facturama_id` | string | sí |  |  |
| `facturama_razon_social` | string | sí |  |  |
| `facturama_regimen_fiscal` | string | sí |  |  |
| `facturama_rfc` | string | sí |  |  |
| `facturama_uso_cfdi` | string | sí |  |  |
| `fecha_alta` | string | sí |  |  |
| `foto_fachada_url` | string | sí |  |  |
| `foto_url` | string | sí |  |  |
| `frecuencia` | Database["public"]["Enums"]["frecuencia_visita"] | sí |  |  |
| `gps_lat` | number | sí |  |  |
| `gps_lng` | number | sí |  |  |
| `id` | string | no |  |  |
| `lada` | string | sí |  |  |
| `limite_credito` | number | sí |  |  |
| `lista_id` | string | sí |  | → `listas.id` |
| `lista_precio_id` | string | sí |  | → `lista_precios.id` |
| `nombre` | string | no | **sí** |  |
| `notas` | string | sí |  |  |
| `notas_fiscales` | string | sí |  |  |
| `orden` | number | sí |  |  |
| `portal_token` | string | sí |  |  |
| `recibir_notificaciones` | boolean | no |  |  |
| `regimen_fiscal` | string | sí |  |  |
| `requiere_factura` | boolean | sí |  |  |
| `rfc` | string | sí |  |  |
| `rfc_validado_at` | string | sí |  |  |
| `rfc_validado_detalle` | Json | sí |  |  |
| `rfc_validado_status` | string | sí |  |  |
| `status` | Database["public"]["Enums"]["status_cliente"] | sí |  |  |
| `tarifa_id` | string | sí |  | → `tarifas.id` |
| `telefono` | string | sí |  |  |
| `updated_at` | string | sí |  |  |
| `uso_cfdi` | string | sí |  |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |
| `zona_id` | string | sí |  | → `zonas.id` |

**Referenciada por:** `cliente_orden_ruta.cliente_id`, `cliente_pedido_sugerido.cliente_id`, `cobros.cliente_id`, `cotizaciones.cliente_id`, `devoluciones.cliente_id`, `entregas.cliente_id`, `tienda_clientes.cliente_id`, `ventas.cliente_id`, `visitas.cliente_id`

---

## cobradores

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `telefono` | string | sí |  |  |

---

## cobro_aplicaciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cobro_id` | string | no | **sí** | → `cobros.id` |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `monto_aplicado` | number | no |  |  |
| `venta_id` | string | no | **sí** | → `ventas.id` |

---

## cobro_reintentos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `estado` | string | no |  |  |
| `factura_id` | string | no | **sí** | → `facturas.id` |
| `id` | string | no |  |  |
| `intento_num` | number | no | **sí** |  |
| `procesado_at` | string | sí |  |  |
| `proxima_fecha` | string | no | **sí** |  |
| `stripe_invoice_id` | string | sí |  |  |
| `ultimo_error` | string | sí |  |  |
| `updated_at` | string | no |  |  |

---

## cobros

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cliente_id` | string | no | **sí** | → `clientes.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `id` | string | no |  |  |
| `metodo_pago` | string | no |  |  |
| `monto` | number | no |  |  |
| `notas` | string | sí |  |  |
| `notif_email_status` | string | sí |  |  |
| `notif_error` | string | sí |  |  |
| `notif_wa_status` | string | sí |  |  |
| `referencia` | string | sí |  |  |
| `status` | string | no |  |  |
| `updated_at` | string | sí |  |  |
| `user_id` | string | no | **sí** |  |

**Referenciada por:** `cfdi_pagos.cobro_id`, `cobro_aplicaciones.cobro_id`

---

## comision_esquemas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `base` | string | no | **sí** |  |
| `config` | Json | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `periodo` | string | no | **sí** |  |
| `tipo` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |

**Referenciada por:** `profiles.comision_esquema_id`

---

## compra_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no |  |  |
| `cantidad_recibida` | number | no |  |  |
| `compra_id` | string | no | **sí** | → `compras.id` |
| `created_at` | string | no |  |  |
| `factor_conversion` | number | no |  |  |
| `id` | string | no |  |  |
| `piezas_total` | number | sí |  |  |
| `precio_unitario` | number | no |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `subtotal` | number | sí |  |  |
| `total` | number | sí |  |  |

---

## compras

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `condicion_pago` | string | no |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `dias_credito` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `folio` | string | sí |  |  |
| `id` | string | no |  |  |
| `iva_total` | number | sí |  |  |
| `notas` | string | sí |  |  |
| `notas_pago` | string | sí |  |  |
| `proveedor_id` | string | sí |  | → `proveedores.id` |
| `saldo_pendiente` | number | sí |  |  |
| `status` | string | no |  |  |
| `subtotal` | number | sí |  |  |
| `total` | number | sí |  |  |

**Referenciada por:** `compra_lineas.compra_id`, `pago_compras.compra_id`

---

## consumo_datos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `bytes_descarga` | number | no |  |  |
| `bytes_subida` | number | no |  |  |
| `created_at` | string | no |  |  |
| `desglose` | Json | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `origen` | string | no |  |  |
| `peticiones` | number | no |  |  |
| `updated_at` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## conteo_entradas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no |  |  |
| `codigo_escaneado` | string | sí |  |  |
| `conteo_linea_id` | string | no | **sí** | → `conteo_lineas.id` |
| `creado_por` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |

---

## conteo_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `ajuste_aplicado` | boolean | no |  |  |
| `cantidad_contada` | number | sí |  |  |
| `conteo_id` | string | no | **sí** | → `conteos_fisicos.id` |
| `costo_unitario` | number | no |  |  |
| `created_at` | string | no |  |  |
| `diferencia` | number | sí |  |  |
| `diferencia_valor` | number | sí |  |  |
| `id` | string | no |  |  |
| `linea_abierta_en` | string | no |  |  |
| `linea_cerrada_en` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `status` | string | no |  |  |
| `stock_esperado` | number | sí |  |  |
| `stock_inicial` | number | no |  |  |

**Referenciada por:** `conteo_entradas.conteo_linea_id`

---

## conteos_fisicos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `abierto_en` | string | no |  |  |
| `almacen_id` | string | no | **sí** | → `almacenes.id` |
| `asignado_a` | string | sí |  |  |
| `cerrado_en` | string | sí |  |  |
| `clasificacion_id` | string | sí |  | → `clasificaciones.id` |
| `creado_por` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `diferencia_total_valor` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `filtro_stock` | string | no |  |  |
| `folio` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `productos_contados` | number | no |  |  |
| `status` | string | no |  |  |
| `total_productos` | number | no |  |  |
| `updated_at` | string | no |  |  |

**Referenciada por:** `conteo_lineas.conteo_id`

---

## cotizacion_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no |  |  |
| `cotizacion_id` | string | no | **sí** | → `cotizaciones.id` |
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `descuento_pct` | number | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `ieps_monto` | number | no |  |  |
| `ieps_pct` | number | no |  |  |
| `impuesto` | number | no |  |  |
| `impuesto_pct` | number | no |  |  |
| `iva_monto` | number | no |  |  |
| `iva_pct` | number | no |  |  |
| `lista_precio_id` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `orden` | number | no |  |  |
| `precio_manual` | boolean | no |  |  |
| `precio_unitario` | number | no |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `producto_snapshot` | Json | sí |  |  |
| `subtotal` | number | no |  |  |
| `total` | number | no |  |  |
| `unidad_id` | string | sí |  | → `unidades.id` |

---

## cotizaciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `cliente_id` | string | sí |  | → `clientes.id` |
| `cliente_snapshot` | Json | sí |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `descuento` | number | no |  |  |
| `descuento_extra` | number | no |  |  |
| `descuento_extra_motivo` | string | sí |  |  |
| `descuento_extra_tipo` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `enviada_wa_at` | string | sí |  |  |
| `estado` | string | no |  |  |
| `fecha` | string | no |  |  |
| `folio` | string | sí |  |  |
| `id` | string | no |  |  |
| `ieps_total` | number | no |  |  |
| `impuestos` | number | no |  |  |
| `iva_total` | number | no |  |  |
| `lista_precio_id` | string | sí |  |  |
| `moneda` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `subtotal` | number | no |  |  |
| `tarifa_id` | string | sí |  | → `tarifas.id` |
| `token_publico` | string | no |  |  |
| `total` | number | no |  |  |
| `updated_at` | string | no |  |  |
| `vence_at` | string | sí |  |  |
| `vendedor_id` | string | sí |  |  |
| `venta_id` | string | sí |  |  |
| `vigencia_dias` | number | no |  |  |

**Referenciada por:** `cotizacion_lineas.cotizacion_id`

---

## cupon_usos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `aplicado_at` | string | sí |  |  |
| `cupon_id` | string | no | **sí** | → `cupones.id` |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `meses_restantes` | number | sí |  |  |
| `subscription_id` | string | sí |  | → `subscriptions.id` |

---

## cupones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `acumulable` | boolean | sí |  |  |
| `codigo` | string | no | **sí** |  |
| `created_at` | string | sí |  |  |
| `descripcion` | string | sí |  |  |
| `descuento_pct` | number | no |  |  |
| `id` | string | no |  |  |
| `meses_duracion` | number | sí |  |  |
| `partner_id` | string | sí |  | → `partner_resumen.partner_id` → `partners.id` |
| `planes_aplicables` | string[] | sí |  |  |
| `uso_maximo` | number | sí |  |  |
| `uso_por_empresa` | number | sí |  |  |
| `usos_actuales` | number | sí |  |  |
| `vigencia_fin` | string | sí |  |  |
| `vigencia_inicio` | string | sí |  |  |

**Referenciada por:** `cupon_usos.cupon_id`, `partner_atribuciones.cupon_id`

---

## dashboard_ai_recomendaciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `content` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `model` | string | sí |  |  |
| `snapshot` | Json | sí |  |  |
| `user_id` | string | no | **sí** |  |

---

## descarga_ruta

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_destino_id` | string | sí |  | → `almacenes.id` |
| `aprobado_por` | string | sí |  | → `profiles.id` |
| `carga_id` | string | sí |  | → `cargas.id` |
| `created_at` | string | no |  |  |
| `descargo_camion` | boolean | no |  |  |
| `diferencia_efectivo` | number | no |  |  |
| `efectivo_entregado` | number | no |  |  |
| `efectivo_esperado` | number | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `fecha_aprobacion` | string | sí |  |  |
| `fecha_fin` | string | sí |  |  |
| `fecha_inicio` | string | sí |  |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `notas_supervisor` | string | sí |  |  |
| `status` | Database["public"]["Enums"]["status_descarga"] | no |  |  |
| `user_id` | string | no | **sí** |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |

**Referenciada por:** `descarga_ruta_lineas.descarga_id`

---

## descarga_ruta_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad_esperada` | number | no |  |  |
| `cantidad_real` | number | no |  |  |
| `created_at` | string | no |  |  |
| `descarga_id` | string | no | **sí** | → `descarga_ruta.id` |
| `diferencia` | number | no |  |  |
| `id` | string | no |  |  |
| `motivo` | Database["public"]["Enums"]["motivo_diferencia"] | sí |  |  |
| `notas` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |

---

## devolucion_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `accion` | Database["public"]["Enums"]["accion_devolucion"] | no |  |  |
| `cantidad` | number | no |  |  |
| `created_at` | string | no |  |  |
| `devolucion_id` | string | no | **sí** | → `devoluciones.id` |
| `id` | string | no |  |  |
| `monto_credito` | number | no |  |  |
| `motivo` | Database["public"]["Enums"]["motivo_devolucion"] | no |  |  |
| `notas` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `reemplazo_producto_id` | string | sí |  | → `productos.id` |

---

## devolucion_motivo_config

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `a_mermas` | boolean | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `motivo` | string | no | **sí** |  |
| `updated_at` | string | sí |  |  |

---

## devoluciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_destino_id` | string | sí |  | → `almacenes.id` |
| `carga_id` | string | sí |  | → `cargas.id` |
| `cliente_id` | string | sí |  | → `clientes.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `reembolso_efectivo` | boolean | no |  |  |
| `reembolso_metodo` | string | sí |  |  |
| `tipo` | Database["public"]["Enums"]["tipo_devolucion"] | no |  |  |
| `user_id` | string | no | **sí** |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |
| `venta_id` | string | sí |  | → `ventas.id` |

**Referenciada por:** `devolucion_lineas.devolucion_id`, `gastos.devolucion_id`

---

## distancia_cache

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `destino_hash` | string | no | **sí** |  |
| `distancia_m` | number | no | **sí** |  |
| `duracion_s` | number | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `origen_hash` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |

---

## email_send_log

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `error_message` | string | sí |  |  |
| `id` | string | no |  |  |
| `message_id` | string | sí |  |  |
| `metadata` | Json | sí |  |  |
| `recipient_email` | string | no | **sí** |  |
| `status` | string | no | **sí** |  |
| `template_name` | string | no | **sí** |  |

---

## email_send_state

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `auth_email_ttl_minutes` | number | no |  |  |
| `batch_size` | number | no |  |  |
| `id` | number | no |  |  |
| `retry_after_until` | string | sí |  |  |
| `send_delay_ms` | number | no |  |  |
| `transactional_email_ttl_minutes` | number | no |  |  |
| `updated_at` | string | no |  |  |

---

## email_unsubscribe_tokens

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `email` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `token` | string | no | **sí** |  |
| `used_at` | string | sí |  |  |

---

## empresa_addons

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `updated_at` | string | no |  |  |
| `wa_bot_activated_at` | string | sí |  |  |
| `wa_bot_activated_by` | string | sí |  |  |
| `wa_bot_enabled` | boolean | no |  |  |
| `wa_bot_monthly_price` | number | sí |  |  |
| `wa_bot_notes` | string | sí |  |  |
| `wa_bot_requested_at` | string | sí |  |  |

---

## empresas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `apartado_almacenes_ids` | string[] | no |  |  |
| `apartado_solo_con_stock` | boolean | no |  |  |
| `apartar_stock_pedidos` | boolean | no |  |  |
| `ciudad` | string | sí |  |  |
| `clientes_visibilidad` | string | no |  |  |
| `colonia` | string | sí |  |  |
| `cp` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `csf_url` | string | sí |  |  |
| `demo_expires_at` | string | sí |  |  |
| `direccion` | string | sí |  |  |
| `email` | string | no | **sí** |  |
| `email_cc_facturacion` | string | sí |  |  |
| `email_facturacion` | string | sí |  |  |
| `enviar_recibo_auto` | boolean | no |  |  |
| `estado` | string | sí |  |  |
| `forma_pago_sat` | string | sí |  |  |
| `id` | string | no |  |  |
| `is_partner_sandbox` | boolean | no |  |  |
| `jornada_permite_sin_vehiculo` | boolean | no |  |  |
| `lada` | string | no |  |  |
| `licencia` | string | sí |  |  |
| `logo_url` | string | sí |  |  |
| `maneja_lotes` | boolean | no |  |  |
| `metodo_pago_sat` | string | sí |  |  |
| `moneda` | string | no |  |  |
| `monthly_sales_goal` | number | no |  |  |
| `nombre` | string | no | **sí** |  |
| `notas_ticket` | string | sí |  |  |
| `onboarding_completado` | boolean | sí |  |  |
| `owner_user_id` | string | sí |  |  |
| `partner_owner_id` | string | sí |  | → `partner_resumen.partner_id` → `partners.id` |
| `politica_cobro` | string | no |  |  |
| `pos_turnos_habilitado` | boolean | no |  |  |
| `razon_social` | string | sí |  |  |
| `regimen_fiscal` | string | sí |  |  |
| `requiere_jornada_desde` | string | sí |  |  |
| `requiere_jornada_ruta` | boolean | no |  |  |
| `rfc` | string | sí |  |  |
| `telefono` | string | no | **sí** |  |
| `ticket_ancho` | string | no |  |  |
| `ticket_campos` | Json | sí |  |  |
| `uso_cfdi` | string | sí |  |  |
| `zona_horaria` | string | no |  |  |

**Referenciada por:** `ajustes_inventario.empresa_id`, `almacenes.empresa_id`, `auditorias.empresa_id`, `caja_movimientos.empresa_id`, `caja_turnos.empresa_id`, `cancellation_requests.empresa_id`, `cargas.empresa_id`, `cfdi_pago_documentos.empresa_id`, `cfdi_pagos.empresa_id`, `cfdis.empresa_id`, `clasificaciones.empresa_id`, `cliente_orden_ruta.empresa_id`, `clientes.empresa_id`, `cobradores.empresa_id`, `cobros.empresa_id`, `comision_esquemas.empresa_id`, `compras.empresa_id`, `consumo_datos.empresa_id`, `conteos_fisicos.empresa_id`, `cupon_usos.empresa_id`, `descarga_ruta.empresa_id`, `devolucion_motivo_config.empresa_id`, `devoluciones.empresa_id`, `empresa_addons.empresa_id`, `entregas.empresa_id`, `facturas.empresa_id`, `gastos.empresa_id`, `lista_precios.empresa_id`, `listas.empresa_id`, `marcas.empresa_id`, `metas_venta.empresa_id`, `movimientos_inventario.empresa_id`, `notifications.empresa_id`, `optimizacion_recargas.empresa_id`, `optimizacion_rutas_log.empresa_id`, `pago_comisiones.empresa_id`, `pago_compras.empresa_id`, `partner_atribuciones.empresa_id`, `partner_comisiones.empresa_id`, `partners.sandbox_empresa_id`, `payment_links.empresa_id`, `productos.empresa_id`, `profiles.empresa_id`, `promociones.empresa_id`, `proveedores.empresa_id`, `reportes_personalizados.empresa_id`, `roles.empresa_id`, `ruta_sesiones.empresa_id`, `solicitudes_pago.empresa_id`, `stock_almacen.empresa_id`, `stock_camion.empresa_id`, `subscriptions.empresa_id`, `tarifas.empresa_id`, `tasas_ieps.empresa_id`, `tasas_isr_ret.empresa_id`, `tasas_iva.empresa_id`, `tasas_iva_ret.empresa_id`, `tienda_clientes.empresa_id`, `tienda_config.empresa_id`, `timbres_movimientos.empresa_id`, `timbres_saldo.empresa_id`, `traspasos.empresa_id`, `tutorial_videos.empresa_id`, `unidades.empresa_id`, `vehiculos.empresa_id`, `vendedor_ubicaciones.empresa_id`, `vendedores.empresa_id`, `venta_comisiones.empresa_id`, `venta_historial.empresa_id`, `venta_lineas.empresa_id`, `ventas.empresa_id`, `visitas.empresa_id`, `wa_bot_authorized_numbers.empresa_id`, `wa_bot_logs.empresa_id`, `whatsapp_config.empresa_id`, `whatsapp_log.empresa_id`, `whatsapp_templates.empresa_id`, `zonas.empresa_id`

---

## entrega_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_origen_id` | string | sí |  | → `almacenes.id` |
| `cantidad_entregada` | number | no |  |  |
| `cantidad_pedida` | number | no |  |  |
| `created_at` | string | no |  |  |
| `entrega_id` | string | no | **sí** | → `entregas.id` |
| `hecho` | boolean | no |  |  |
| `id` | string | no |  |  |
| `lote_id` | string | sí |  |  |
| `motivo_no_entrega` | string | sí |  |  |
| `paquetes` | number | sí |  |  |
| `presentacion_factor` | number | sí |  |  |
| `presentacion_id` | string | sí |  |  |
| `presentacion_nombre` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `unidad_id` | string | sí |  | → `unidades.id` |

---

## entregas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `cliente_id` | string | sí |  | → `clientes.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `fecha_asignacion` | string | sí |  |  |
| `fecha_carga` | string | sí |  |  |
| `fecha_entrega` | string | sí |  |  |
| `folio` | string | sí |  |  |
| `id` | string | no |  |  |
| `motivo_no_entrega` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `orden_entrega` | number | sí |  |  |
| `pedido_id` | string | sí |  | → `ventas.id` |
| `status` | Database["public"]["Enums"]["status_entrega"] | no |  |  |
| `updated_at` | string | sí |  |  |
| `validado_at` | string | sí |  |  |
| `validado_por` | string | sí |  |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |
| `vendedor_ruta_id` | string | sí |  | → `profiles.id` |

**Referenciada por:** `entrega_lineas.entrega_id`

---

## facturas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `concepto` | string | sí |  |  |
| `creado_en` | string | sí |  |  |
| `descuento_porcentaje` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `es_prorrateo` | boolean | sí |  |  |
| `estado` | string | sí |  |  |
| `fecha_emision` | string | sí |  |  |
| `fecha_pago` | string | sí |  |  |
| `fecha_vencimiento` | string | sí |  |  |
| `id` | string | no |  |  |
| `metodo_pago` | string | sí |  |  |
| `num_usuarios` | number | no |  |  |
| `numero_factura` | string | sí |  |  |
| `periodo_fin` | string | no | **sí** |  |
| `periodo_inicio` | string | no | **sí** |  |
| `precio_unitario` | number | no |  |  |
| `referencia_pago` | string | sí |  |  |
| `stripe_invoice_id` | string | sí |  |  |
| `stripe_payment_intent_id` | string | sí |  |  |
| `subtotal` | number | no |  |  |
| `suscripcion_id` | string | sí |  | → `subscriptions.id` |
| `total` | number | no |  |  |

**Referenciada por:** `cobro_reintentos.factura_id`, `partner_comisiones.factura_id`

---

## feature_flags

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `alcance` | string | no |  |  |
| `clave` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `id` | string | no |  |  |
| `licencias` | string[] | no |  |  |
| `nombre` | string | no | **sí** |  |
| `notas_prueba` | string | sí |  |  |
| `updated_at` | string | no |  |  |

---

## gastos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `concepto` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `devolucion_id` | string | sí |  | → `devoluciones.id` |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `foto_url` | string | sí |  |  |
| `id` | string | no |  |  |
| `metodo_pago` | string | sí |  |  |
| `monto` | number | no |  |  |
| `notas` | string | sí |  |  |
| `user_id` | string | no | **sí** |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |
| `venta_id` | string | sí |  | → `ventas.id` |

**Referenciada por:** `pago_comisiones.gasto_id`

---

## import_job_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | sí |  |  |
| `codigo_externo` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `descripcion_externa` | string | sí |  |  |
| `empresa_id` | string | no | **sí** |  |
| `fila_num` | number | no | **sí** |  |
| `id` | string | no |  |  |
| `job_id` | string | no | **sí** | → `import_jobs.id` |
| `match_tipo` | string | no | **sí** |  |
| `mensaje` | string | sí |  |  |
| `precio` | number | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `raw` | Json | sí |  |  |

---

## import_jobs

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `archivo_nombre` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `duplicados` | number | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `errores` | number | no |  |  |
| `id` | string | no |  |  |
| `matched` | number | no |  |  |
| `resumen` | Json | sí |  |  |
| `sin_coincidencia` | number | no |  |  |
| `sistema_origen` | string | sí |  |  |
| `status` | string | no |  |  |
| `tipo` | string | no |  |  |
| `total_filas` | number | no |  |  |
| `updated_at` | string | no |  |  |

**Referenciada por:** `import_job_lineas.job_id`

---

## internal_notification_reads

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `notification_id` | string | no | **sí** | → `internal_notifications.id` |
| `read_at` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## internal_notifications

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `body` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `dedupe_key` | string | sí |  |  |
| `empresa_id` | string | no | **sí** |  |
| `entity_id` | string | sí |  |  |
| `entity_type` | string | sí |  |  |
| `id` | string | no |  |  |
| `link` | string | sí |  |  |
| `metadata` | Json | sí |  |  |
| `tipo` | string | no | **sí** |  |
| `title` | string | no | **sí** |  |

**Referenciada por:** `internal_notification_reads.notification_id`

---

## lista_precios

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activa` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `es_principal` | boolean | no |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `share_activo` | boolean | no |  |  |
| `share_token` | string | no |  |  |
| `tarifa_id` | string | no | **sí** | → `tarifas.id` |

**Referenciada por:** `clientes.lista_precio_id`, `lista_precios_lineas.lista_precio_id`, `tarifa_lineas.lista_precio_id`, `tienda_config.lista_precios_default_id`, `venta_lineas.lista_precio_id`

---

## lista_precios_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `lista_precio_id` | string | no | **sí** | → `lista_precios.id` |
| `precio` | number | no |  |  |
| `producto_id` | string | no | **sí** | → `productos.id` |

---

## listas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |

**Referenciada por:** `clientes.lista_id`, `productos.lista_id`

---

## lotes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `codigo` | string | no | **sí** |  |
| `costo` | number | sí |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `fecha_caducidad` | string | sí |  |  |
| `fecha_fabricacion` | string | sí |  |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `producto_id` | string | no | **sí** | → `productos.id` |
| `updated_at` | string | no |  |  |

**Referenciada por:** `stock_apartado.lote_id`, `stock_lotes.lote_id`, `venta_lineas.lote_id`

---

## maintenance_log

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `duracion_ms` | number | no |  |  |
| `ejecutado_en` | string | no |  |  |
| `ejecutado_por` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `tablas_procesadas` | string[] | no |  |  |

---

## marcas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |

**Referenciada por:** `metas_venta.marca_id`, `productos.marca_id`

---

## merma_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no | **sí** |  |
| `costo_unitario` | number | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `merma_id` | string | no | **sí** | → `mermas.id` |
| `precio_venta_unitario` | number | no |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `subtotal_costo` | number | no |  |  |
| `subtotal_venta` | number | no |  |  |

---

## merma_motivos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |

**Referenciada por:** `mermas.motivo_id`

---

## mermas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_origen_id` | string | no | **sí** | → `almacenes.id` |
| `cancelada` | boolean | no |  |  |
| `cancelada_at` | string | sí |  |  |
| `cancelada_por` | string | sí |  |  |
| `creado_por` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `devolucion_id` | string | sí |  |  |
| `empresa_id` | string | no | **sí** |  |
| `fecha` | string | no |  |  |
| `folio` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `motivo_id` | string | sí |  | → `merma_motivos.id` |
| `observaciones` | string | sí |  |  |
| `ruta_id` | string | sí |  |  |
| `total_costo` | number | no |  |  |
| `total_venta` | number | no |  |  |

**Referenciada por:** `merma_lineas.merma_id`

---

## metas_venta

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `clasificacion_id` | string | sí |  | → `clasificaciones.id` |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `marca_id` | string | sí |  | → `marcas.id` |
| `meta_monto` | number | no |  |  |
| `meta_unidades` | number | no |  |  |
| `notas` | string | sí |  |  |
| `periodo_month` | number | no | **sí** |  |
| `periodo_year` | number | no | **sí** |  |
| `presentacion_id` | string | sí |  | → `producto_presentaciones.id` |
| `producto_id` | string | sí |  | → `productos.id` |
| `updated_at` | string | no |  |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |

---

## movimientos_inventario

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_destino_id` | string | sí |  | → `almacenes.id` |
| `almacen_origen_id` | string | sí |  | → `almacenes.id` |
| `cantidad` | number | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `id` | string | no |  |  |
| `lote_id` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `referencia_id` | string | sí |  |  |
| `referencia_tipo` | string | sí |  |  |
| `tipo` | Database["public"]["Enums"]["tipo_movimiento"] | no | **sí** |  |
| `unidad_id` | string | sí |  | → `unidades.id` |
| `user_id` | string | sí |  |  |
| `vendedor_destino_id` | string | sí |  | → `profiles.id` |

---

## notification_views

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `dismissed` | boolean | no |  |  |
| `id` | string | no |  |  |
| `last_seen_at` | string | no |  |  |
| `notification_id` | string | no | **sí** | → `notifications.id` |
| `user_id` | string | no | **sí** |  |
| `view_count` | number | no |  |  |

---

## notifications

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `bg_color` | string | sí |  |  |
| `body` | string | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | sí |  | → `empresas.id` |
| `end_date` | string | sí |  |  |
| `id` | string | no |  |  |
| `image_url` | string | sí |  |  |
| `is_active` | boolean | no |  |  |
| `max_views` | number | no |  |  |
| `redirect_url` | string | sí |  |  |
| `start_date` | string | no |  |  |
| `text_color` | string | sí |  |  |
| `title` | string | no | **sí** |  |
| `type` | Database["public"]["Enums"]["notification_type"] | no |  |  |

**Referenciada por:** `notification_views.notification_id`

---

## optimizacion_recargas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad_creditos` | number | no |  |  |
| `created_at` | string | no |  |  |
| `creditos_consumidos` | number | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `moneda` | string | no |  |  |
| `monto_centavos` | number | no |  |  |
| `paid_at` | string | sí |  |  |
| `status` | string | no |  |  |
| `stripe_payment_intent_id` | string | sí |  |  |
| `stripe_session_id` | string | sí |  |  |
| `user_id` | string | no | **sí** |  |

---

## optimizacion_rutas_log

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `clientes_count` | number | no |  |  |
| `created_at` | string | no |  |  |
| `dia_filtro` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## otp_codes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `attempts` | number | no |  |  |
| `code` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `phone` | string | no | **sí** |  |
| `verified` | boolean | no |  |  |

---

## pago_comisiones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `detalle_calculo` | Json | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `estado` | string | no |  |  |
| `fecha_corte` | string | no | **sí** |  |
| `fecha_pago` | string | sí |  |  |
| `gasto_id` | string | sí |  | → `gastos.id` |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `periodo_desde` | string | sí |  |  |
| `periodo_hasta` | string | sí |  |  |
| `tipo_calculo` | string | no |  |  |
| `total_comisiones` | number | no |  |  |
| `user_id` | string | no | **sí** |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |

**Referenciada por:** `venta_comisiones.pago_comision_id`, `ventas.comision_volumen_pago_id`

---

## pago_compras

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `compra_id` | string | no | **sí** | → `compras.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `id` | string | no |  |  |
| `metodo_pago` | string | no |  |  |
| `monto` | number | no |  |  |
| `notas` | string | sí |  |  |
| `proveedor_id` | string | sí |  | → `proveedores.id` |
| `referencia` | string | sí |  |  |
| `user_id` | string | no | **sí** |  |

---

## partner_atribuciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `cupon_id` | string | sí |  | → `cupones.id` |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `metodo` | string | no | **sí** |  |
| `partner_id` | string | no | **sí** | → `partner_resumen.partner_id` → `partners.id` |
| `ref_slug` | string | sí |  |  |

---

## partner_comisiones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `cupon_pct` | number | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `factura_id` | string | sí |  | → `facturas.id` |
| `id` | string | no |  |  |
| `monto_comision` | number | no |  |  |
| `monto_factura` | number | no |  |  |
| `notas` | string | sí |  |  |
| `pagado_en` | string | sí |  |  |
| `pago_id` | string | sí |  |  |
| `partner_id` | string | no | **sí** | → `partner_resumen.partner_id` → `partners.id` |
| `partner_pct` | number | no | **sí** |  |
| `periodo` | string | no | **sí** |  |
| `status` | string | no |  |  |

---

## partner_niveles

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `beneficios` | string[] | sí |  |  |
| `bono_mxn` | number | sí |  |  |
| `color` | string | sí |  |  |
| `comision_pct` | number | no | **sí** |  |
| `created_at` | string | no |  |  |
| `emoji` | string | sí |  |  |
| `empresas_max` | number | sí |  |  |
| `empresas_min` | number | no | **sí** |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `orden` | number | no | **sí** |  |

---

## partner_pagos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `metodo` | string | sí |  |  |
| `monto` | number | no | **sí** |  |
| `notas` | string | sí |  |  |
| `pagado_en` | string | no |  |  |
| `pagado_por` | string | sí |  |  |
| `partner_id` | string | no | **sí** | → `partner_resumen.partner_id` → `partners.id` |
| `referencia` | string | sí |  |  |

---

## partner_solicitudes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `email` | string | no | **sí** |  |
| `experiencia` | string | sí |  |  |
| `id` | string | no |  |  |
| `motivo` | string | sí |  |  |
| `nombre` | string | no | **sí** |  |
| `notas_admin` | string | sí |  |  |
| `partner_id` | string | sí |  | → `partner_resumen.partner_id` → `partners.id` |
| `processed_at` | string | sí |  |  |
| `processed_by` | string | sí |  |  |
| `redes` | string | sí |  |  |
| `status` | string | no |  |  |
| `telefono` | string | sí |  |  |
| `updated_at` | string | no |  |  |

---

## partners

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `comision_pct` | number | no |  |  |
| `created_at` | string | no |  |  |
| `email` | string | sí |  |  |
| `estado` | string | no |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `notas` | string | sí |  |  |
| `peor_nivel_fecha` | string | sí |  |  |
| `peor_nivel_pct_60d` | number | sí |  |  |
| `ref_slug` | string | no | **sí** |  |
| `sandbox_empresa_id` | string | sí |  | → `empresas.id` |
| `telefono` | string | sí |  |  |
| `updated_at` | string | no |  |  |
| `user_id` | string | sí |  |  |

**Referenciada por:** `cupones.partner_id`, `empresas.partner_owner_id`, `partner_atribuciones.partner_id`, `partner_comisiones.partner_id`, `partner_pagos.partner_id`, `partner_solicitudes.partner_id`

---

## payment_links

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `completed_at` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `customer_email` | string | no |  |  |
| `customer_name` | string | no |  |  |
| `customer_phone` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `empresa_nombre` | string | no |  |  |
| `id` | string | no |  |  |
| `openpay_card_id` | string | sí |  |  |
| `openpay_customer_id` | string | sí |  |  |
| `openpay_plan_id` | string | no | **sí** |  |
| `openpay_subscription_id` | string | sí |  |  |
| `plan_amount` | number | no |  |  |
| `plan_currency` | string | no |  |  |
| `plan_name` | string | no |  |  |
| `plan_repeat_unit` | string | no |  |  |
| `status` | string | no |  |  |
| `token` | string | no |  |  |

---

## planes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | sí |  |  |
| `creado_en` | string | sí |  |  |
| `descripcion` | string | sí |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `precio_base_mes` | number | no | **sí** |  |
| `precio_usuario_extra` | number | no |  |  |
| `stripe_price_id` | string | sí |  |  |
| `stripe_product_id` | string | sí |  |  |
| `usuarios_incluidos` | number | no |  |  |

---

## producto_equivalencias

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `codigo_externo` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `producto_id` | string | no | **sí** | → `productos.id` |
| `sistema_origen` | string | sí |  |  |
| `updated_at` | string | no |  |  |

---

## producto_presentaciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `codigo_barras` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `es_principal_stock` | boolean | no |  |  |
| `factor_base` | number | no | **sí** |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `orden` | number | no |  |  |
| `precio_especial` | number | sí |  |  |
| `producto_id` | string | no | **sí** | → `productos.id` |
| `updated_at` | string | no |  |  |

**Referenciada por:** `metas_venta.presentacion_id`

---

## producto_proveedores

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `es_principal` | boolean | no |  |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `precio_compra` | number | sí |  |  |
| `producto_id` | string | no | **sí** | → `productos.id` |
| `proveedor_id` | string | no | **sí** | → `proveedores.id` |
| `tiempo_entrega_dias` | number | sí |  |  |

---

## productos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacenes` | string[] | sí |  |  |
| `calculo_costo` | Database["public"]["Enums"]["calculo_costo"] | sí |  |  |
| `cantidad` | number | sí |  |  |
| `clasificacion_id` | string | sí |  | → `clasificaciones.id` |
| `clave_alterna` | string | sí |  |  |
| `codigo` | string | no | **sí** |  |
| `codigo_origen` | string | sí |  |  |
| `codigo_sat` | string | sí |  |  |
| `costo` | number | sí |  |  |
| `costo_incluye_impuestos` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `dias_cobertura` | number | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `es_combo` | boolean | sí |  |  |
| `es_granel` | boolean | no |  |  |
| `factor_conversion` | number | sí |  |  |
| `formula` | string | sí |  |  |
| `id` | string | no |  |  |
| `ieps_pct` | number | no |  |  |
| `ieps_tipo` | string | no |  |  |
| `imagen_url` | string | sí |  |  |
| `iva_pct` | number | no |  |  |
| `lead_time_dias` | number | no |  |  |
| `lista_id` | string | sí |  | → `listas.id` |
| `maneja_lote` | boolean | no |  |  |
| `marca_id` | string | sí |  | → `marcas.id` |
| `max` | number | sí |  |  |
| `min` | number | sí |  |  |
| `modo_compra_sugerida` | string | no |  |  |
| `monto_maximo` | number | sí |  |  |
| `nombre` | string | no | **sí** |  |
| `nombre_compra` | string | sí |  |  |
| `nombre_ticket` | string | sí |  |  |
| `nombre_venta` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `pct_comision` | number | sí |  |  |
| `permitir_descuento` | boolean | sí |  |  |
| `precio_principal` | number | sí |  |  |
| `precio_sugerido_publico` | number | no |  |  |
| `proveedor_preferido_id` | string | sí |  | → `proveedores.id` |
| `se_puede_comprar` | boolean | sí |  |  |
| `se_puede_inventariar` | boolean | sí |  |  |
| `se_puede_vender` | boolean | sí |  |  |
| `status` | Database["public"]["Enums"]["status_producto"] | sí |  |  |
| `tarifa_id` | string | sí |  | → `tarifas.id` |
| `tiene_comision` | boolean | sí |  |  |
| `tiene_ieps` | boolean | sí |  |  |
| `tiene_iva` | boolean | sí |  |  |
| `tipo_comision` | Database["public"]["Enums"]["tipo_comision"] | sí |  |  |
| `udem_sat_id` | string | sí |  | → `unidades_sat.id` |
| `unidad_compra_id` | string | sí |  | → `unidades.id` |
| `unidad_granel` | string | no |  |  |
| `unidad_venta_id` | string | sí |  | → `unidades.id` |
| `updated_at` | string | sí |  |  |
| `usa_listas_precio` | boolean | no |  |  |
| `usa_presentaciones` | boolean | no |  |  |
| `vender_sin_stock` | boolean | sí |  |  |

**Referenciada por:** `ajustes_inventario.producto_id`, `auditoria_lineas.producto_id`, `carga_lineas.producto_id`, `cfdi_lineas.producto_id`, `cliente_pedido_sugerido.producto_id`, `compra_lineas.producto_id`, `conteo_lineas.producto_id`, `cotizacion_lineas.producto_id`, `descarga_ruta_lineas.producto_id`, `devolucion_lineas.producto_id`, `devolucion_lineas.reemplazo_producto_id`, `entrega_lineas.producto_id`, `import_job_lineas.producto_id`, `lista_precios_lineas.producto_id`, `lotes.producto_id`, `merma_lineas.producto_id`, `metas_venta.producto_id`, `movimientos_inventario.producto_id`, `producto_equivalencias.producto_id`, `producto_presentaciones.producto_id`, `producto_proveedores.producto_id`, `promociones.producto_gratis_id`, `stock_almacen.producto_id`, `stock_camion.producto_id`, `traspaso_lineas.producto_id`, `venta_comisiones.producto_id`, `venta_lineas.producto_id`

---

## profiles

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `archivado_en` | string | sí |  |  |
| `archivado_motivo` | string | sí |  |  |
| `archivado_por` | string | sí |  |  |
| `avatar_url` | string | sí |  |  |
| `comision_esquema_id` | string | sí |  | → `comision_esquemas.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `estado` | string | no |  |  |
| `id` | string | no |  |  |
| `must_change_password` | boolean | no |  |  |
| `nombre` | string | sí |  |  |
| `pin_code` | string | sí |  |  |
| `super_admin_override_empresa_id` | string | sí |  |  |
| `telefono` | string | sí |  |  |
| `ui_prefs` | Json | no |  |  |
| `user_id` | string | no | **sí** |  |

**Referenciada por:** `auditorias.aprobado_por`, `cargas.repartidor_id`, `cargas.vendedor_id`, `clientes.cobrador_id`, `clientes.vendedor_id`, `descarga_ruta.aprobado_por`, `descarga_ruta.vendedor_id`, `devoluciones.vendedor_id`, `entregas.vendedor_id`, `entregas.vendedor_ruta_id`, `gastos.vendedor_id`, `metas_venta.vendedor_id`, `movimientos_inventario.vendedor_destino_id`, `pago_comisiones.vendedor_id`, `ruta_sesiones.vendedor_id`, `stock_camion.vendedor_id`, `traspasos.vendedor_destino_id`, `traspasos.vendedor_origen_id`, `vehiculos.vendedor_default_id`, `venta_comisiones.vendedor_id`, `ventas.vendedor_id`, `wa_bot_authorized_numbers.profile_id`

---

## promocion_aplicada

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `descuento_aplicado` | number | no |  |  |
| `id` | string | no |  |  |
| `promocion_id` | string | no | **sí** | → `promociones.id` |
| `venta_id` | string | no | **sí** | → `ventas.id` |
| `venta_linea_id` | string | sí |  | → `venta_lineas.id` |

---

## promociones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activa` | boolean | no |  |  |
| `acumulable` | boolean | no |  |  |
| `aplica_a` | Database["public"]["Enums"]["aplica_promocion"] | no |  |  |
| `cantidad_gratis` | number | sí |  |  |
| `cantidad_minima` | number | sí |  |  |
| `clasificacion_ids` | string[] | sí |  |  |
| `cliente_ids` | string[] | sí |  |  |
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `dias_semana` | string[] | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `prioridad` | number | no |  |  |
| `producto_gratis_id` | string | sí |  | → `productos.id` |
| `producto_ids` | string[] | sí |  |  |
| `tipo` | Database["public"]["Enums"]["tipo_promocion"] | no |  |  |
| `valor` | number | no |  |  |
| `vigencia_fin` | string | sí |  |  |
| `vigencia_inicio` | string | sí |  |  |
| `zona_ids` | string[] | sí |  |  |

**Referenciada por:** `promocion_aplicada.promocion_id`

---

## proveedores

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `banco` | string | sí |  |  |
| `ciudad` | string | sí |  |  |
| `clabe` | string | sí |  |  |
| `colonia` | string | sí |  |  |
| `condicion_pago` | string | no |  |  |
| `contacto` | string | sí |  |  |
| `cp` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `cuenta_banco` | string | sí |  |  |
| `dias_credito` | number | sí |  |  |
| `direccion` | string | sí |  |  |
| `email` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `estado` | string | sí |  |  |
| `id` | string | no |  |  |
| `limite_credito` | number | sí |  |  |
| `nombre` | string | no | **sí** |  |
| `notas` | string | sí |  |  |
| `razon_social` | string | sí |  |  |
| `rfc` | string | sí |  |  |
| `sitio_web` | string | sí |  |  |
| `status` | string | no |  |  |
| `telefono` | string | sí |  |  |
| `tiempo_entrega_dias` | number | sí |  |  |

**Referenciada por:** `compras.proveedor_id`, `pago_compras.proveedor_id`, `producto_proveedores.proveedor_id`, `productos.proveedor_preferido_id`

---

## publicidad_anuncios

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `cta_label` | string | sí |  |  |
| `cta_url` | string | sí |  |  |
| `descripcion` | string | sí |  |  |
| `id` | string | no |  |  |
| `media_url` | string | sí |  |  |
| `mostrar_popup` | boolean | no |  |  |
| `tipo_media` | string | no |  |  |
| `titulo` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |

**Referenciada por:** `publicidad_vistas.anuncio_id`

---

## publicidad_vistas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `anuncio_id` | string | no | **sí** | → `publicidad_anuncios.id` |
| `id` | string | no |  |  |
| `user_id` | string | no | **sí** |  |
| `viewed_at` | string | no |  |  |

---

## reportes_personalizados

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `columnas` | Json | no |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `descripcion` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `filtros_default` | Json | no |  |  |
| `fuente` | string | no |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |

---

## role_permisos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `accion` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `modulo` | string | no | **sí** |  |
| `permitido` | boolean | no |  |  |
| `role_id` | string | no | **sí** | → `roles.id` |

---

## roles

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `acceso_ruta_movil` | boolean | no |  |  |
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `es_sistema` | boolean | no |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `solo_movil` | boolean | no |  |  |

**Referenciada por:** `role_permisos.role_id`, `user_roles.role_id`

---

## ruta_polyline_cache

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `distancia_total_m` | number | sí |  |  |
| `duracion_total_s` | number | sí |  |  |
| `empresa_id` | string | no | **sí** |  |
| `encoded_polyline` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `vendedor_id` | string | no | **sí** |  |
| `waypoints_hash` | string | no | **sí** |  |

---

## ruta_sesiones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `carga_id` | string | sí |  | → `cargas.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `fin_at` | string | sí |  |  |
| `foto_fin_url` | string | sí |  |  |
| `foto_inicio_url` | string | sí |  |  |
| `id` | string | no |  |  |
| `inicio_at` | string | no |  |  |
| `km_fin` | number | sí |  |  |
| `km_inicio` | number | no | **sí** |  |
| `km_recorridos` | number | sí |  |  |
| `lat_fin` | number | sí |  |  |
| `lat_inicio` | number | sí |  |  |
| `lng_fin` | number | sí |  |  |
| `lng_inicio` | number | sí |  |  |
| `notas_fin` | string | sí |  |  |
| `notas_inicio` | string | sí |  |  |
| `status` | string | no |  |  |
| `updated_at` | string | no |  |  |
| `vehiculo_id` | string | sí |  | → `vehiculos.id` |
| `vendedor_id` | string | no | **sí** | → `profiles.id` |

---

## solicitudes_pago

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `aprobado_por` | string | sí |  |  |
| `cantidad_timbres` | number | sí |  |  |
| `cantidad_usuarios` | number | sí |  |  |
| `comprobante_url` | string | sí |  |  |
| `concepto` | string | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha_aprobacion` | string | sí |  |  |
| `id` | string | no |  |  |
| `metodo` | string | no |  |  |
| `monto_centavos` | number | no |  |  |
| `notas` | string | sí |  |  |
| `notas_admin` | string | sí |  |  |
| `plan_price_id` | string | sí |  |  |
| `status` | string | no |  |  |
| `tipo` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## stock_almacen

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | no | **sí** | → `almacenes.id` |
| `cantidad` | number | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `producto_id` | string | no | **sí** | → `productos.id` |
| `updated_at` | string | no |  |  |

---

## stock_apartado

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | no | **sí** |  |
| `cantidad` | number | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `lote_id` | string | sí |  | → `lotes.id` |
| `producto_id` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |
| `venta_id` | string | no | **sí** | → `ventas.id` |
| `venta_linea_id` | string | no | **sí** | → `venta_lineas.id` |

---

## stock_camion

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad_actual` | number | no |  |  |
| `cantidad_inicial` | number | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `id` | string | no |  |  |
| `producto_id` | string | no | **sí** | → `productos.id` |
| `vendedor_id` | string | no | **sí** | → `profiles.id` |

---

## stock_lotes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | no | **sí** |  |
| `cantidad` | number | no |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `lote_id` | string | no | **sí** | → `lotes.id` |
| `producto_id` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |

---

## subscription_plans

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `capacitacion_sesiones` | number | no |  |  |
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `descuento_pct` | number | no |  |  |
| `features_json` | Json | no |  |  |
| `id` | string | no |  |  |
| `ideal_para` | string | sí |  |  |
| `meses` | number | no |  |  |
| `nombre` | string | no | **sí** |  |
| `orden` | number | no |  |  |
| `periodo` | string | no |  |  |
| `popular` | boolean | no |  |  |
| `precio_base` | number | no |  |  |
| `precio_extra_usuario` | number | no |  |  |
| `precio_por_usuario` | number | no |  |  |
| `slug` | string | sí |  |  |
| `stripe_price_id` | string | sí |  |  |
| `stripe_price_id_extra` | string | sí |  |  |
| `stripe_product_id` | string | sí |  |  |
| `usuarios_incluidos` | number | no |  |  |

**Referenciada por:** `subscriptions.plan_id`

---

## subscriptions

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `acceso_bloqueado` | boolean | no |  |  |
| `cancel_at_period_end` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `current_period_end` | string | sí |  |  |
| `current_period_start` | string | sí |  |  |
| `descuento_porcentaje` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `es_manual` | boolean | sí |  |  |
| `fecha_vencimiento` | string | sí |  |  |
| `id` | string | no |  |  |
| `legacy_pricing` | boolean | no |  |  |
| `max_usuarios` | number | no |  |  |
| `plan_id` | string | sí |  | → `subscription_plans.id` |
| `status` | string | no |  |  |
| `stripe_customer_id` | string | sí |  |  |
| `stripe_payment_method_id` | string | sí |  |  |
| `stripe_subscription_id` | string | sí |  |  |
| `terms_accepted_at` | string | sí |  |  |
| `trial_ends_at` | string | sí |  |  |
| `ultimo_checkout_session_id` | string | sí |  |  |
| `updated_at` | string | no |  |  |

**Referenciada por:** `cupon_usos.subscription_id`, `facturas.suscripcion_id`

---

## super_admins

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `email` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## suppressed_emails

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `email` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `metadata` | Json | sí |  |  |
| `reason` | string | no | **sí** |  |

---

## tarifa_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `aplica_a` | Database["public"]["Enums"]["aplica_a_tarifa"] | no |  |  |
| `base_precio` | string | no |  |  |
| `clasificacion_ids` | string[] | no |  |  |
| `comision_pct` | number | no |  |  |
| `created_at` | string | no |  |  |
| `descuento_max` | number | sí |  |  |
| `descuento_pct` | number | sí |  |  |
| `id` | string | no |  |  |
| `lista_precio_id` | string | sí |  | → `lista_precios.id` |
| `margen_pct` | number | sí |  |  |
| `notas` | string | sí |  |  |
| `precio` | number | no |  |  |
| `precio_minimo` | number | sí |  |  |
| `producto_ids` | string[] | no |  |  |
| `redondeo` | string | no |  |  |
| `tarifa_id` | string | no | **sí** | → `tarifas.id` |
| `tipo_calculo` | Database["public"]["Enums"]["tipo_calculo_tarifa"] | no |  |  |

---

## tarifas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activa` | boolean | sí |  |  |
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `moneda` | string | sí |  |  |
| `nombre` | string | no | **sí** |  |
| `tipo` | Database["public"]["Enums"]["tipo_tarifa"] | sí |  |  |
| `vigencia_fin` | string | sí |  |  |
| `vigencia_inicio` | string | sí |  |  |

**Referenciada por:** `clientes.tarifa_id`, `cotizaciones.tarifa_id`, `lista_precios.tarifa_id`, `productos.tarifa_id`, `tarifa_lineas.tarifa_id`, `ventas.tarifa_id`

---

## tasas_ieps

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `porcentaje` | number | no | **sí** |  |

---

## tasas_isr_ret

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `porcentaje` | number | no |  |  |

---

## tasas_iva

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `porcentaje` | number | no | **sí** |  |

---

## tasas_iva_ret

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `porcentaje` | number | no |  |  |

---

## tienda_clientes

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cliente_id` | string | no | **sí** | → `clientes.id` |
| `created_at` | string | no |  |  |
| `email` | string | no | **sí** |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `password_hash` | string | no | **sí** |  |
| `telefono` | string | sí |  |  |
| `ultimo_login` | string | sí |  |  |
| `updated_at` | string | no |  |  |
| `verificado` | boolean | no |  |  |

---

## tienda_config

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activa` | boolean | no |  |  |
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `banner_url` | string | sí |  |  |
| `beneficios` | Json | no |  |  |
| `color_primario` | string | sí |  |  |
| `color_secundario` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `lista_precios_default_id` | string | sí |  | → `lista_precios.id` |
| `logo_url` | string | sí |  |  |
| `mensaje_bienvenida` | string | sí |  |  |
| `nombre_tienda` | string | no | **sí** |  |
| `permitir_invitados` | boolean | no |  |  |
| `plantilla` | string | no |  |  |
| `slug` | string | no | **sí** |  |
| `updated_at` | string | no |  |  |
| `usar_lista_cliente` | boolean | no |  |  |
| `whatsapp_pedidos` | string | sí |  |  |

---

## timbres_movimientos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `referencia_id` | string | sí |  |  |
| `saldo_anterior` | number | no |  |  |
| `saldo_nuevo` | number | no |  |  |
| `tipo` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## timbres_saldo

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `saldo` | number | no |  |  |
| `updated_at` | string | no |  |  |

---

## traspaso_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cantidad` | number | no |  |  |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `traspaso_id` | string | no | **sí** | → `traspasos.id` |

---

## traspasos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_destino_id` | string | sí |  | → `almacenes.id` |
| `almacen_origen_id` | string | sí |  | → `almacenes.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `folio` | string | sí |  |  |
| `id` | string | no |  |  |
| `notas` | string | sí |  |  |
| `status` | Database["public"]["Enums"]["status_traspaso"] | no |  |  |
| `tipo` | Database["public"]["Enums"]["tipo_traspaso"] | no |  |  |
| `user_id` | string | no | **sí** |  |
| `vendedor_destino_id` | string | sí |  | → `profiles.id` |
| `vendedor_origen_id` | string | sí |  | → `profiles.id` |

**Referenciada por:** `traspaso_lineas.traspaso_id`

---

## trial_blacklist

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `bloqueado_por` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `email` | string | sí |  |  |
| `empresa_nombre` | string | sí |  |  |
| `id` | string | no |  |  |
| `motivo` | string | sí |  |  |
| `telefono` | string | sí |  |  |

---

## tutorial_videos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `description` | string | sí |  |  |
| `empresa_id` | string | sí |  | → `empresas.id` |
| `id` | string | no |  |  |
| `module` | string | sí |  |  |
| `sort_order` | number | no |  |  |
| `title` | string | no | **sí** |  |
| `url` | string | no | **sí** |  |

---

## unidades

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `abreviatura` | string | sí |  |  |
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |

**Referenciada por:** `cotizacion_lineas.unidad_id`, `entrega_lineas.unidad_id`, `movimientos_inventario.unidad_id`, `productos.unidad_compra_id`, `productos.unidad_venta_id`, `venta_lineas.unidad_id`

---

## unidades_sat

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `clave` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |

**Referenciada por:** `productos.udem_sat_id`

---

## user_favorites

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `icon` | string | sí |  |  |
| `id` | string | no |  |  |
| `label` | string | no | **sí** |  |
| `orden` | number | no |  |  |
| `path` | string | no | **sí** |  |
| `user_id` | string | no | **sí** |  |

---

## user_roles

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `id` | string | no |  |  |
| `role_id` | string | no | **sí** | → `roles.id` |
| `user_id` | string | no | **sí** |  |

---

## vehiculos

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `alias` | string | no | **sí** |  |
| `anio` | number | sí |  |  |
| `capacidad_kg` | number | sí |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `foto_url` | string | sí |  |  |
| `id` | string | no |  |  |
| `km_actual` | number | no |  |  |
| `marca` | string | sí |  |  |
| `modelo` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `placa` | string | sí |  |  |
| `status` | string | no |  |  |
| `tipo` | string | no |  |  |
| `updated_at` | string | no |  |  |
| `vendedor_default_id` | string | sí |  | → `profiles.id` |

**Referenciada por:** `ruta_sesiones.vehiculo_id`

---

## vendedor_ubicaciones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `accuracy` | number | sí |  |  |
| `battery_level` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `heading` | number | sí |  |  |
| `lat` | number | no | **sí** |  |
| `lng` | number | no | **sí** |  |
| `speed` | number | sí |  |  |
| `updated_at` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## vendedor_ubicaciones_historial

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `accuracy` | number | sí |  |  |
| `battery_level` | number | sí |  |  |
| `empresa_id` | string | no | **sí** |  |
| `id` | string | no |  |  |
| `lat` | number | no | **sí** |  |
| `lng` | number | no | **sí** |  |
| `recorded_at` | string | no |  |  |
| `user_id` | string | no | **sí** |  |

---

## vendedores

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |
| `telefono` | string | sí |  |  |

---

## venta_comisiones

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `comision_monto` | number | no |  |  |
| `comision_pct` | number | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha_venta` | string | no |  |  |
| `id` | string | no |  |  |
| `monto_venta` | number | no |  |  |
| `pagada` | boolean | no |  |  |
| `pago_comision_id` | string | sí |  | → `pago_comisiones.id` |
| `producto_id` | string | sí |  | → `productos.id` |
| `vendedor_id` | string | no | **sí** | → `profiles.id` |
| `venta_id` | string | no | **sí** | → `ventas.id` |
| `venta_linea_id` | string | no | **sí** | → `venta_lineas.id` |

---

## venta_historial

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `accion` | string | no | **sí** |  |
| `created_at` | string | no |  |  |
| `detalles` | Json | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `user_id` | string | sí |  |  |
| `user_nombre` | string | no |  |  |
| `venta_id` | string | no | **sí** | → `ventas.id` |

---

## venta_lineas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `base_descuento_manual` | number | sí |  |  |
| `base_ieps` | number | sí |  |  |
| `base_iva` | number | sí |  |  |
| `cantidad` | number | no |  |  |
| `cantidad_bonificada` | number | sí |  |  |
| `created_at` | string | no |  |  |
| `descripcion` | string | sí |  |  |
| `descuento_manual` | boolean | sí |  |  |
| `descuento_manual_monto` | number | sí |  |  |
| `descuento_pct` | number | sí |  |  |
| `descuento_promocion_monto` | number | sí |  |  |
| `descuento_registrado_por` | string | sí |  |  |
| `descuento_total_monto` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `es_bonificacion` | boolean | sí |  |  |
| `factura_cfdi_id` | string | sí |  | → `cfdis.id` |
| `facturado` | boolean | sí |  |  |
| `facturado_global` | boolean | no |  |  |
| `id` | string | no |  |  |
| `ieps_monto` | number | sí |  |  |
| `ieps_pct` | number | sí |  |  |
| `importe_bruto` | number | sí |  |  |
| `impuestos_totales` | number | sí |  |  |
| `iva_monto` | number | sí |  |  |
| `iva_pct` | number | sí |  |  |
| `lista_precio_id` | string | sí |  | → `lista_precios.id` |
| `lote_id` | string | sí |  | → `lotes.id` |
| `motivo_descuento_manual` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `objeto_impuesto` | string | sí |  |  |
| `paquetes` | number | sí |  |  |
| `precio_lista_unitario` | number | sí |  |  |
| `precio_manual` | boolean | no |  |  |
| `precio_unitario` | number | no |  |  |
| `precio_unitario_sin_redondeo` | number | sí |  |  |
| `presentacion_factor` | number | sí |  |  |
| `presentacion_id` | string | sí |  |  |
| `presentacion_nombre` | string | sí |  |  |
| `producto_id` | string | sí |  | → `productos.id` |
| `promocion_id` | string | sí |  |  |
| `promocion_nombre` | string | sí |  |  |
| `subtotal` | number | sí |  |  |
| `total` | number | sí |  |  |
| `unidad_id` | string | sí |  | → `unidades.id` |
| `updated_at` | string | no |  |  |
| `venta_id` | string | no | **sí** | → `ventas.id` |

**Referenciada por:** `cfdi_lineas.venta_linea_id`, `promocion_aplicada.venta_linea_id`, `stock_apartado.venta_linea_id`, `venta_comisiones.venta_linea_id`

---

## ventas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `almacen_id` | string | sí |  | → `almacenes.id` |
| `cerrado_at` | string | sí |  |  |
| `cerrado_por` | string | sí |  |  |
| `cerrado_snapshot` | Json | sí |  |  |
| `cliente_id` | string | sí |  | → `clientes.id` |
| `comision_volumen_pago_id` | string | sí |  | → `pago_comisiones.id` |
| `concepto` | string | sí |  |  |
| `condicion_pago` | Database["public"]["Enums"]["condicion_pago"] | no |  |  |
| `created_at` | string | no |  |  |
| `descuento_extra` | number | no |  |  |
| `descuento_extra_motivo` | string | sí |  |  |
| `descuento_extra_tipo` | string | no |  |  |
| `descuento_total` | number | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `entrega_inmediata` | boolean | sí |  |  |
| `es_saldo_inicial` | boolean | no |  |  |
| `fecha` | string | no |  |  |
| `fecha_entrega` | string | sí |  |  |
| `fecha_vencimiento` | string | sí |  |  |
| `folio` | string | sí |  |  |
| `id` | string | no |  |  |
| `ieps_total` | number | sí |  |  |
| `iva_total` | number | sí |  |  |
| `notas` | string | sí |  |  |
| `origen` | string | sí |  |  |
| `pedido_origen_id` | string | sí |  | → `ventas.id` |
| `politica_cobro` | string | sí |  |  |
| `requiere_factura` | boolean | sí |  |  |
| `saldo_pendiente` | number | sí |  |  |
| `status` | Database["public"]["Enums"]["status_venta"] | no |  |  |
| `subtotal` | number | sí |  |  |
| `tarifa_id` | string | sí |  | → `tarifas.id` |
| `tipo` | Database["public"]["Enums"]["tipo_venta"] | no |  |  |
| `total` | number | sí |  |  |
| `total_efectivo` | number | sí |  |  |
| `turno_id` | string | sí |  | → `caja_turnos.id` |
| `updated_at` | string | sí |  |  |
| `vendedor_id` | string | sí |  | → `profiles.id` |

**Referenciada por:** `carga_pedidos.venta_id`, `cfdi_pago_documentos.venta_id`, `cfdis.venta_id`, `cobro_aplicaciones.venta_id`, `devoluciones.venta_id`, `entregas.pedido_id`, `gastos.venta_id`, `promocion_aplicada.venta_id`, `stock_apartado.venta_id`, `venta_comisiones.venta_id`, `venta_historial.venta_id`, `venta_lineas.venta_id`, `ventas.pedido_origen_id`, `visitas.venta_id`

---

## ventas_descuadre_auditoria

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `detalle` | Json | sí |  |  |
| `diferencia` | number | sí |  |  |
| `empresa_id` | string | sí |  |  |
| `id` | string | no |  |  |
| `precio_esperado` | number | sí |  |  |
| `precio_guardado` | number | sí |  |  |
| `producto_id` | string | sí |  |  |
| `tipo` | string | no |  |  |
| `venta_id` | string | sí |  |  |
| `venta_linea_id` | string | sí |  |  |

---

## visitas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `cliente_id` | string | sí |  | → `clientes.id` |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `fecha` | string | no |  |  |
| `gps_lat` | number | sí |  |  |
| `gps_lng` | number | sí |  |  |
| `id` | string | no |  |  |
| `motivo` | string | sí |  |  |
| `notas` | string | sí |  |  |
| `tipo` | string | no |  |  |
| `user_id` | string | no | **sí** |  |
| `venta_id` | string | sí |  | → `ventas.id` |

---

## wa_bot_authorized_numbers

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `auto_intro_sent_at` | string | sí |  |  |
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `last_sent_alertas_semanal` | string | sí |  |  |
| `last_sent_cobranza_diaria` | string | sí |  |  |
| `last_sent_reporte_diario` | string | sí |  |  |
| `nombre` | string | sí |  |  |
| `permisos` | Json | no |  |  |
| `phone_e164` | string | no | **sí** |  |
| `pref_alertas_semanal` | boolean | no |  |  |
| `pref_cobranza_diaria` | boolean | no |  |  |
| `pref_hora_reporte_diario` | number | no |  |  |
| `pref_reporte_diario` | boolean | no |  |  |
| `pref_reporte_diario_formato` | string | no |  |  |
| `pref_reporte_diario_frecuencia` | string | no |  |  |
| `profile_id` | string | sí |  | → `profiles.id` |
| `updated_at` | string | no |  |  |
| `welcome_sent_at` | string | sí |  |  |

---

## wa_bot_logs

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `empresa_id` | string | sí |  | → `empresas.id` |
| `id` | string | no |  |  |
| `inbound_text` | string | sí |  |  |
| `intent` | string | sí |  |  |
| `outcome` | string | no |  |  |
| `params` | Json | sí |  |  |
| `pdf_url` | string | sí |  |  |
| `phone` | string | no | **sí** |  |
| `response_summary` | string | sí |  |  |

---

## wa_campaign_sends

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `campaign_id` | string | no | **sí** | → `wa_campaigns.id` |
| `created_at` | string | no |  |  |
| `empresa_nombre` | string | sí |  |  |
| `error_detalle` | string | sí |  |  |
| `id` | string | no |  |  |
| `nombre` | string | sí |  |  |
| `status` | string | no |  |  |
| `telefono` | string | no | **sí** |  |

---

## wa_campaigns

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `filters` | string[] | sí |  |  |
| `id` | string | no |  |  |
| `image_url` | string | sí |  |  |
| `message` | string | sí |  |  |
| `status` | string | no |  |  |
| `total_failed` | number | no |  |  |
| `total_recipients` | number | no |  |  |
| `total_sent` | number | no |  |  |

**Referenciada por:** `wa_campaign_sends.campaign_id`

---

## wa_optouts

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | no |  |  |
| `created_by` | string | sí |  |  |
| `id` | string | no |  |  |
| `motivo` | string | sí |  |  |
| `nombre` | string | sí |  |  |
| `telefono` | string | no | **sí** |  |

---

## whatsapp_config

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `api_token` | string | no |  |  |
| `api_url` | string | no |  |  |
| `aviso_dia_antes` | boolean | no |  |  |
| `aviso_vencido` | boolean | no |  |  |
| `created_at` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `enviar_recibo_pago` | boolean | no |  |  |
| `evolution_connected_at` | string | sí |  |  |
| `evolution_instance_name` | string | sí |  |  |
| `evolution_last_qr_at` | string | sí |  |  |
| `evolution_phone_number` | string | sí |  |  |
| `evolution_status` | string | sí |  |  |
| `id` | string | no |  |  |
| `instance_name` | string | no |  |  |
| `provider` | string | no |  |  |

---

## whatsapp_log

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `created_at` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `error_detalle` | string | sí |  |  |
| `id` | string | no |  |  |
| `imagen_url` | string | sí |  |  |
| `mensaje` | string | sí |  |  |
| `referencia_id` | string | sí |  |  |
| `status` | string | no |  |  |
| `telefono` | string | no | **sí** |  |
| `tipo` | string | no | **sí** |  |

---

## whatsapp_templates

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | sí |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `mensaje` | string | no |  |  |
| `nombre` | string | no |  |  |
| `tipo` | string | no | **sí** |  |

---

## zonas

| Campo | Tipo | Nulo | Obligatorio al insertar | FK |
|---|---|---|---|---|
| `activo` | boolean | no |  |  |
| `created_at` | string | no |  |  |
| `empresa_id` | string | no | **sí** | → `empresas.id` |
| `id` | string | no |  |  |
| `nombre` | string | no | **sí** |  |

**Referenciada por:** `clientes.zona_id`

---

# Vistas

## partner_resumen (vista)

| Campo | Tipo |
|---|---|
| `comision_pct` | number |
| `empresas_referidas` | number |
| `estado` | string |
| `nombre` | string |
| `partner_id` | string |
| `ref_slug` | string |
| `saldo_pendiente` | number |
| `total_generado` | number |
| `total_pagado` | number |


# Funciones / RPC disponibles

- `_aplica_stock_lote()`
- `_mover_stock_entre_almacenes()`
- `add_timbres()`
- `admin_reparar_promociones()`
- `admin_sync_duplicados()`
- `admin_sync_recientes()`
- `aplicar_cobro()`
- `aplicar_partner_referido()`
- `aprobar_solicitud_partner()`
- `archivar_usuario()`
- `asignar_lote_masivo()`
- `calc_audit_stock_teorico()`
- `calcular_comision_volumen()`
- `cancelar_entregas_bulk()`
- `cancelar_traspaso()`
- `cerrar_pedido_parcial()`
- `check_stock_lote_paridad()`
- `close_audit_line()`
- `close_full_audit()`
- `confirm_timbre_reserve()`
- `confirmar_traspaso()`
- `deduct_timbre()`
- `delete_email()`
- `delete_empresa_cascade()`
- `delete_empresas_bulk()`
- `enqueue_email()`
- `fn_disponible_almacen()`
- `fn_disponible_lotes()`
- `fn_recalc_venta_header()`
- `fn_recalc_venta_saldo()`
- `fn_reevaluar_promos_venta()`
- `generar_recibo_volumen()`
- `generate_folio()`
- `get_audit_users()`
- `get_empresa_user_emails()`
- `get_entregas_bulk_preview()`
- `get_inactive_empresas()`
- `get_optimization_quota()`
- `get_partner_active_empresas()`
- `get_partner_nivel()`
- `get_sandbox_usage()`
- `get_user_archive_summary()`
- `is_empresa_admin()`
- `log_venta_historial()`
- `move_to_dlq()`
- `next_folio()`
- `pagar_comisiones_partner()`
- `reabrir_pedido_parcial()`
- `read_email_batch()`
- `reasignar_entregas_bulk()`
- `reasignar_pendientes_usuario()`
- `recalc_producto_costo()`
- `rechazar_solicitud_partner()`
- `recibir_compra_linea_parcial()`
- `recibir_linea_compra()`
- `reconciliar_saldos_cliente()`
- `reconciliar_saldos_empresa()`
- `registrar_cobro()`
- `registrar_merma()`
- `registrar_saldo_inicial()`
- `release_timbre()`
- `repair_missing_entrega_carga()`
- `reprogramar_entregas_bulk()`
- `reserve_timbre()`
- `revertir_surtido_linea()`
- `saldo_clientes_a_la_fecha()`
- `set_ui_pref()`
- `stock_a_la_fecha()`
- `stock_almacen_at_eod()`
- `stock_almacen_at_eod_v2()`
- `super_admin_list_empresas()`
- `surtir_linea_entrega()`
- `surtir_linea_entrega_lotes()`
- `surtir_linea_entrega_parcial()`
- `tiene_cobertura_vigente()`
- `validar_stock_cotizacion()`
- `verify_admin_pin()`
- `wa_clientes_saldos()`

# Enums

- `aplica_a_tarifa`: "todos" | "categoria" | "producto"
- `condicion_pago`: "contado" | "credito" | "por_definir"
- `frecuencia_visita`: "diaria" | "semanal" | "quincenal" | "mensual"
- `notification_redirect_type`: "internal" | "external" | "both"
- `notification_type`: "banner" | "modal" | "bubble"
- `status_carga`: "pendiente" | "en_ruta" | "completada" | "cancelada"
- `status_cliente`: "activo" | "inactivo" | "suspendido"
- `status_descarga`: "pendiente" | "aprobada" | "rechazada"
- `status_producto`: "activo" | "inactivo" | "borrador"
- `status_traspaso`: "borrador" | "confirmado" | "cancelado"
- `tipo_calculo_tarifa`: "margen_costo" | "descuento_precio" | "precio_fijo"
- `tipo_comision`: "porcentaje" | "monto_fijo"
- `tipo_devolucion`: "almacen" | "tienda" | "—" | "–" | "-"
- `tipo_movimiento`: "entrada" | "salida" | "transferencia"
- `tipo_tarifa`: "general" | "por_cliente" | "por_ruta"
- `tipo_traspaso`: "almacen_almacen" | "almacen_ruta" | "ruta_almacen"
- `tipo_venta`: "pedido" | "venta_directa" | "saldo_inicial"
