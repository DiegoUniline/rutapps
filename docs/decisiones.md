# Decisiones

## D-001
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Instalar Uniline Agents · AutoPrompter v2 en RutApp, kit completo adaptado (`dist/proyecto` de `DiegoUniline/unilineagents@41adcd9`).
- **Adaptaciones:** fase operación (rebanadas solo para módulos nuevos), stack aprobado, memoria = `docs/` + `.lovable/memory/`, trabajo en rama de sesión (no push directo a `main`).
- **Afecta:** `CLAUDE.md`, `AGENTS.md` (bloque agregado; reglas previas intactas), `.claude/`, `docs/00-estado.md`, `docs/00-mapa.md`, `docs/decisiones.md`, `docs/bitacora.md`, `docs/preguntas.md`.
- **No afecta:** `src/`, `supabase/`, CI, `.lovable/memory/`, `docs/01..05`.

## D-002
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Las migraciones correctivas de producción (huecos de R-010) se entregan como SQL revisado e idempotente y **las ejecuta el dueño** en Supabase SQL Editor; el agente verifica después con SELECT. El agente no aplica cambios de BD por su cuenta.
- **Pendiente:** confirmar con datos si las fallas silenciosas afectan la operación antes de preparar los PR A/B.

## D-003
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Plan de corrección: PR A (código, R-001/R-003…R-006; R-002 excluido para no duplicar facturas) y PR B (SQL de huecos de BD, ejecutado por el dueño según D-002). Las 465 entregas `hecho` sin `fecha_entrega` se rellenan con `validado_at` y, si no hay, `updated_at`.

## D-004
- **Fecha:** 2026-10-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Para avisos de vencidas y control de crédito, una venta sin `fecha_vencimiento` vence a los **días de crédito actuales del cliente** contados desde su fecha; con `fecha_vencimiento` se usa esa fecha.
- **Evidencia:** producción — 0 clientes con vencidas usando solo `fecha_vencimiento`, 2 914 con esta regla, 3 206 si vencieran el mismo día. 5 671 ventas pendientes sin vencimiento (3 265 contado, 1 506 crédito, 900 por definir).

## D-005
- **Fecha:** 2026-10-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** La tienda en línea conserva por ahora el acceso automático de clientes del CRM con contraseña inicial `123456`; solo se deja de revelar en el mensaje de error de `tienda-login`. El correo se compara exacto y el registro no reemplaza accesos existentes (PR #153).
- **Riesgo aceptado:** quien conozca el correo de un cliente que nunca entró puede acceder a su cuenta (S-03 parcial abierto). Alternativas propuestas: código por correo/WhatsApp o contraseña asignada por la empresa.
## D-006
- **Fecha:** 2026-10-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Un documento que ya movió stock (entrega, compra recibida, traspaso confirmado, descarga aprobada, y sus renglones) **no se borra: se cancela**. La BD lo bloquea; solo los procesos del servidor (service_role) quedan exentos. Lo que no movió stock (borradores) se sigue borrando.
- **Evidencia:** producción 2026-10-20 — 466 entregas, 27 compras, 7 traspasos y 2 descargas borradas con su stock movido; casos en los últimos 7 días.

## D-007
- **Fecha:** 2026-10-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Corrección de inventario y edición por fases. Regla base: el **pedido** es lo que el cliente pidió (y se cobra según su política); la **entrega** es lo que físicamente salió; cada corrección mueve solo la diferencia y el saldo lo calcula la BD en un solo lugar.
  - **Fase 1 (BD):** D-006; reabrir entrega entregada sin stock fantasma (a borrador revierte todo; a surtido revierte entrega y carga; a cancelado/no entregado la mercancía queda en el camión); cancelar en surtido regresa a bodega; reversa de lotes de carga válida; saldo con una sola regla y nunca negativo; cierre parcial solo con entregas del pedido; devoluciones por renglón; corrección de Admin sin doble descuento y no disponible en facturadas.
  - **Fase 2:** editar ventas confirmadas en una sola operación (web, móvil, offline).
  - **Fase 3:** editar entregas y "Ajustar entrega" después de entregada.
- **Pendiente:** decisiones de negocio de fases 2 y 3 (total menor a lo pagado; producto entregado que no estaba en el pedido); stock histórico descuadrado se corrige con conteo físico (no automático).

## D-008
- **Fecha:** 2026-10-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** Editar ventas confirmadas/entregadas en una sola operación (`editar_venta`). Puede editar quien tiene **ventas · editar** (misma regla que la app: dueño siempre; sin rol = acceso total). La fase 2 **solo agrega la función**: no cambia datos ni tablas existentes.
- **Mientras no exista saldo a favor por cobros:** si el nuevo total queda abajo de lo pagado, se bloquea con aviso. El pago de más **sí debe quedar como saldo a favor** (decisión del dueño), en una fase posterior que sí cambie cómo se calcula el saldo a favor (hoy solo cuenta notas de crédito; los cobros desaplicados al cancelar tampoco se ven).
- **Comisiones:** las ya pagadas no se tocan (`fn_sync_venta_comision` ya lo respeta); quitar un renglón con comisión pagada se bloquea para no borrarla (FK en cascada).
- **Fuera de alcance:** pedido con entregas (fase 3), facturadas (nota de crédito), cerradas parcial, cambio de condición de pago/cliente/almacén al editar.

## D-009
- **Fecha:** 2026-10-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión ("Ajustar entrega" ya entregada):**
  - **Producto equivocado:** se cobra el producto que el cliente se quedó (Y) a su precio de lista; X sale del pedido.
  - **Sobrante:** quien ajusta elige si regresa al **camión** o a la **bodega**.
  - **Permiso:** logística · entregas · editar (escritorio) o ruta · editar entrega (móvil).
  - **Faltante al ajustar:** se quita del pedido (el pedido baja). Las entregas parciales normales siguen dejando pendiente lo no entregado.
- **Implementación:** `ajustar_entrega` (no cambia el estado: no reenvía avisos ni cambia fecha). Sobrante a bodega reduce carga y surtido para que "Reabrir" no devuelva doble. Cobro de parciales sigue la política de la empresa (Configuración → política de cobro).

## D-010
- **Fecha:** 2026-10-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión (megas en móvil, operación de ruta):** cargas, entregas y descargas se refrescan cada **15 min** (antes 5) y el celular baja **solo lo del vendedor/repartidor**: lo abierto o de los últimos 7 días. Con "Sincronizar" se ve al instante.
- **Implementación:** `RUTA_OPERACION_SCOPE` en `src/lib/offlineSync.ts` (sin bandera); las líneas siguen a su padre local. Super admin viendo una empresa sin vendedor elegido: sin recorte.

## D-011
- **Fecha:** 2026-10-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** las listas de **Ventas** y **Cobranza** abren en el **mes actual** cuando no hay fechas elegidas (antes cargaban todo el historial). Las fechas que el usuario elija se recuerdan como siempre.
- **Implementación:** `useListPreferences(key, { defaultMesActual: true })` (del día 1 al último día del mes, zona de la empresa). Cobranza filtra en el servidor y solo reemplaza ese rango en la copia local.

## D-012
- **Fecha:** 2026-10-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión (Mapa de clientes, optimizar por zona):** la ruta del día de un vendedor se arma **zona tras zona**. Si se optimiza una zona que ya estaba, solo se reordena su bloque y conserva su lugar. Si la zona es nueva, se agrega al final. Las demás zonas del mismo día y vendedor ya no se borran.
- **Implementación:** `mergeBloqueOrden` (`src/lib/ordenRuta.ts`). Aplica cuando hay filtro de zona, status, búsqueda o clientes elegidos. Sin esos filtros se reemplaza toda la ruta del día, como antes. El guardado ahora avisa si falla.

## D-013
- **Fecha:** 2026-10-28 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión (facturación CFDI, rumbo):** se toma como referencia la lógica de `DiegoUniline/user-hub-pro` (validación previa, timbrado sin duplicados, cancelación y complemento de pago) y se adapta a RutApp, que es multiempresa. El saldo de timbres por empresa con Stripe que ya tiene RutApp se conserva. Orden: **Fase 0** seguridad y sandbox → **Fase 1** factura de venta correcta → Fase 2 complemento de pago, global y sustitución → Fase 3 nota de crédito y abrir el módulo a las empresas.
- **Sandbox:** el dueño da de alta la cuenta sandbox de Facturama con los secrets `FACTURAMA_SANDBOX_USERNAME` y `FACTURAMA_SANDBOX_PASSWORD`. Cada empresa tiene `facturama_ambiente` (`produccion`/`sandbox`) y cada CFDI guarda el ambiente con que se timbró.
- **CSD y ambiente:** los puede cambiar el dueño de la empresa, quien tenga el permiso Facturación CFDI · editar (sin rol asignado = acceso total, igual que la app) y el super admin. Solo se acepta el CSD del RFC de la propia empresa, validado antes de subirlo.

## D-014
- **Fecha:** 2026-10-28 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión (Fase 1 facturación, factura de venta):** el servidor valida antes de timbrar, aparta la venta (nadie más puede facturar esas líneas), asigna serie/folio consecutivo por empresa (`cfdi_series`) y solo un rechazo explícito de Facturama (4xx) libera; sin respuesta queda "Timbrado incierto" hasta **Reconciliar** (busca por receptor + serie/folio + total + RFC emisor).
- **Impuestos:** se toman de la venta (precio sin impuestos antes del descuento + descuento en nodo Discount); IEPS dentro de la base del IVA; IEPS por cuota con `IsQuota`; IVA 0% = objeto 02 con tasa 0.
- **Productos sin IVA:** se elige **por producto** (`productos.cfdi_iva_sin_iva`: tasa 0% / exento / no objeto). Sin elegir, no se timbra (lo marca la validación previa).
- **Receptor:** siempre los datos fiscales de la ficha del cliente (`facturama_*`); en el timbrado solo se elige el uso de CFDI.
- **Cancelación:** motivos 01–04; el 01 exige el UUID de una factura timbrada de la misma empresa que la sustituye. Al quedar cancelada, la venta vuelve a poder facturarse.

## D-015
- **Fecha:** 2026-10-28 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión (Fase 2 facturación):**
  - Una venta se puede repartir en varias facturas (PUE o PPD) por líneas, por cantidad dentro de una línea o por monto (el sistema llena cantidades hasta el monto). Se aparta la **cantidad pendiente** de cada línea, no la línea completa. Precio unitario el de la venta; descuento proporcional a la cantidad.
  - La venta queda facturada cuando toda su cantidad está en facturas timbradas; con cualquier factura ya no se edita; al cancelar, la cantidad vuelve a estar disponible.
  - Complemento de pago (REP): **lista de cobros pendientes** (fecha límite día 5 del mes siguiente), se timbran a mano. Cada cobro aplicado a una venta se reparte entre sus facturas PPD timbradas en proporción a su importe dentro de la venta; la parte no facturada no genera REP. Parcialidad y saldos según REP anteriores; impuestos del documento en proporción a lo pagado.
  - Un cobro con REP vigente no se edita, cancela ni desaplica; una factura PPD con REP vigente no se cancela.
  - Factura global (público en general): las ventas del periodo **se eligen a mano** entre las que no tienen ninguna factura.
  - Sustitución: desde una factura timbrada se crea el borrador sustituto con las mismas cantidades; al timbrarse (relación 04) se cancela la original con motivo 01.

## D-016
- **Fecha:** 2026-10-28 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión (Fase 3 facturación):** **no se manejan notas de crédito** por ahora; la facturación queda en PUE, PPD (con complemento de pago), cancelación y factura global.
- **Apertura a las empresas (D-013):** el módulo sigue activándose por empresa con la bandera `facturacion_cfdi`; dentro, cada acción la valida el servidor con `puede_facturar`: dueño, usuario sin rol (acceso total, igual que la app) o rol con **Facturación CFDI · ver** (consultar, pendientes de complemento, validar RFC), **· crear** (timbrar, complemento, global, sustituir, reconciliar, correo) y **· eliminar** (cancelar ante el SAT). CSD, ambiente y serie siguen con **· editar**. Super admin siempre. La página Avanzado ya no es solo de super admin.

## D-017
- **Fecha:** 2026-11-04 · **Autor:** Diego León (dueño) · **Estado:** APROBADO y ejecutado
- **Autorización literal:** «CONFIRMO recrear las 48 suscripciones sin cobro inmediato» (23:43 UTC).
- **Decisión:** recrear únicamente las 48 canceladas del CSV `stripe_canceladas_2026-11-04.csv` que coinciden con la suscripción ligada en RutApp. Conservar cliente, tarjeta, precios, cantidades, descuento y fecha/hora de fin de periodo originales. No cobrar al recrearlas. No restaurar las otras 18 del archivo.
- **Ejecución:** suscripciones nuevas con `trial_end` igual a `periodo_fin` original, `proration_behavior=none`, claves de idempotencia por suscripción original y metadata `restored_from_subscription`, `restoration_incident`, `restoration_no_charge_before`. La API disponible rechazó `pending_invoice_items_behavior` antes de crear nada; se verificó que cada cliente tuviera cero partidas de factura pendientes antes de crear su reemplazo. Facturas iniciales de $0; vinculación y desbloqueo por el webhook existente (`supabase/functions/stripe-webhook/index.ts:360-459`). Sin cambios de código ni escrituras manuales de la BD.
- **Verificación 23:47 UTC:** 48/48 Stripe `trialing`; fechas/anchors originales futuros; una única suscripción no cancelada por cliente; una factura inicial por reemplazo con total, monto adeudado y pagado $0, sin payment intent/cargo; cero cargos desde cada creación. 48/48 filas de RutApp vinculadas al ID nuevo, `active`, desbloqueadas y sin diferencias en plan, usuarios, descuento, manual/legacy.
- **Fechas de corte en CDMX:** 2 el 11/11/2026; 1 el 21/11; 1 el 26/11; 1 el 27/11; 7 el 30/11; 32 el 01/12; 2 el 03/12; 1 el 15/12; 1 el 02/03/2027. Se preservó el timestamp original, no se normalizó el horario.
- **Límite:** verificadas programación y ausencia de cobro inicial; no se puede verificar hoy el éxito de cobros futuros. Stripe factura al terminar el periodo sin cobro e intenta cobrar después; una tarjeta rechazada puede provocar reintentos.

## D-018
- **Fecha:** 2026-11-16 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (en curso)
- **Decisión:** salir de Lovable Cloud. Destino de BD/Auth/Storage/Edge Functions: Supabase propio `amybkerwkybffllaxpnz` (nombre RutApp, us-east-1, Postgres 17). Front en Cloudflare Pages. Lovable sigue conectado a GitHub hasta el corte.
- **Estado verificado 2026-11-16 (MCP Supabase):** `ACTIVE_HEALTHY`; 0 tablas en `public`, 0 migraciones, 0 edge functions; extensiones instaladas solo las de fábrica (pgcrypto, uuid-ossp, pg_stat_statements, vault).
- **Fuente de datos:** ZIP exportado por el dueño desde Lovable (contenido por revisar). Origen actual: `pkdwemunxxpafpmiqxiq`.
- **Carga BD 2026-11-16 (verificado por MCP):** backup custom `rutapps_261116.backup` (pg_dump 18.6, origen PG 17.6) restaurado con `pg_restore --no-owner -L restore.list` filtrado: todo `public` + `auth.users/identities` + `storage.buckets` + políticas storage + 2 triggers en `auth.users`. Excluidos a propósito: `cron.job` (evitar envíos/billing duplicados), `vault` (cifrado con llave del origen), realtime, esquemas internos. Resultado: 185 tablas, 3,084,150 filas, 377 funciones, 192 triggers, 322 políticas (184 tablas con RLS), 358 FK, 531 índices, 32 tablas en realtime, 14 buckets, 35 políticas storage, 401 usuarios con identidad y password, 260 empresas, 78,212 ventas (última 2026-11-16 14:43 UTC = corte del backup). Errores: 568 GRANT al rol `sandbox_exec_pkdwemunxxpafpmiqxiq` (rol interno de Lovable, no aplica), 3 default privileges, identities reintentado OK.
- **Pendiente:** archivos de storage (no vienen en el backup), colas pgmq, crons, secrets, edge functions, reemplazo de `LOVABLE_API_KEY`, baseline de migraciones en repo, Cloudflare Pages, corte final con delta de datos.
- **IA (2026-11-16, dueño eligió):** Google Gemini directo. 5 funciones usan el endpoint OpenAI-compatible de Gemini; `parse-csf` usa `generateContent` nativo (PDF inline). Secret `GEMINI_API_KEY`. `tienda-asistente-pedido` ya usaba OpenAI directo (`OPENAI_API_KEY`), sin cambio.
- **Correo (2026-11-16, dueño eligió):** Resend. `_shared/transactional-email-templates/send-email.ts` envía por la API de Resend. Secrets `RESEND_API_KEY` y opcional `EMAIL_FROM_DOMAIN` (default `rutapp.mx`, debe estar verificado en Resend). `handle-email-events` y `preview-transactional-email` son exclusivos de Lovable y quedan sin uso.

## D-019
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** el precio de lo ya entregado **sigue el precio vivo del pedido** (comportamiento actual, auditoría H1). Editar el precio del pedido recalcula también el importe de lo entregado. No se agrega precio a `entrega_lineas`.
- **Consecuencia:** al bajar el total por debajo de lo pagado debe aplicar la regla de saldo a favor de D-008 en todos los caminos (corrección administrativa incluida, hallazgo H2/C2).

## D-020
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** al **cancelar una venta con pagos**, el sistema **pregunta** qué hacer con el dinero: (a) **cancelar también el pago**, o (b) **dejarlo como saldo a favor** del cliente (el pago se desaplica de la venta y queda disponible). Aplica igual en las tres formas de cancelar (detalle web, ruta y lista/masivo), que hoy hacen cosas distintas (auditoría C4).
- **Implica:** el saldo a favor se calcula en la BD e incluye cobros activos no aplicados (D-008, auditoría C3).

## D-021
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (corregida el mismo día: primero "el borrador deja de existir", luego el dueño eligió conservarlo solo al inicio)
- **Decisión:** el **borrador existe solo al inicio**: una venta o pedido puede guardarse como borrador al crearse (como hoy), pero una vez **confirmado ya no regresa a borrador**; para cambiarlo se usa **Editar venta** (`editar_venta`, una operación, inventario por diferencia, excedente → saldo a favor D-008). Los borradores existentes (731 pedidos internos, 169 ventas directas; corte 2026-11-16) se quedan como están. Pedidos de la tienda en línea siguen llegando en borrador para aprobarse.
- **Motivo:** regresar a borrador y guardar era la fuga principal del pago de más (auditoría C2: 105 casos en nov-2026).

## D-022
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** toda **reasignación** de entrega a otro vendedor y todo **cambio de almacén/camión del vendedor** con mercancía ya **asignada o cargada** mueve el stock del camión A al B en la misma operación, en todas las pantallas y funciones (`reasignar_entregas_bulk`, `reasignar_pendientes_usuario`, cambio de `profiles.almacen_id`). Auditoría R1/R3.

## D-023
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** los **datos históricos de dinero se dejan como están** (911 cobros activos sin aplicar 1.78 M, 377 ventas con pagado > total ~140 k, 21 saldos negativos, 28 canceladas con cobro aplicado; corte 2026-11-16). Solo se corrige hacia adelante.
- **Implica (🧭 criterio):** el saldo a favor nuevo cuenta solo lo generado desde su puesta en marcha (cobros desaplicados/excedentes con fecha ≥ implementación), para no hacer aparecer de golpe el histórico.

## D-024
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** en **Ajustar entrega**, quien ajusta elige **camión o bodega** (depende de quién hizo el error) y esa elección aplica a **ambos lados**: lo que sale de la entrega (p. ej. Coca) regresa ahí y lo que sí se entregó (p. ej. Pepsi) se descuenta de ahí. Hoy el producto nuevo siempre se descuenta del camión (auditoría 2026-11-19, caso Coca/Pepsi).
- **Interpretación registrada:** respuesta del dueño «todo depende de quien lo haga, por ende debemos elegir se devuelve al camión o a bodega» = una sola elección para ambos lados.

## D-025
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** cuando un cambio deja el total de una venta **abajo de lo ya pagado** (Editar venta, Corrección administrativa, Ajustar entrega, cierre parcial), el sistema **pregunta** qué hacer con el excedente: **(a) saldo a favor** del cliente, **(b) se devolvió el dinero** (reembolso registrado), o **(c) nada** (no se registra movimiento). Complementa D-008 y D-020.
- **Interpretación registrada:** «que digan saldo a favor o se devolvió el dinero o nada».

## D-026
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Regla general del dueño:** todo documento tiene **crear, editar y cancelar** (y ver/PDF).
- **Decisión (cancelar ajuste de inventario):** cancelar un ajuste ya aplicado **revierte exacto**: se registra el movimiento contrario por la misma diferencia de cada producto y el ajuste queda **Cancelado** (quién, cuándo, motivo). No se borra historial (D-006).
- **Decisión (editar ajuste de inventario):** editar = **corregir lo contado** de uno o varios productos del ajuste; el sistema mueve **solo la diferencia** contra lo que ya aplicó ese ajuste y guarda quién/cuándo editó. El motivo también se puede cambiar.

## D-027
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** en el buscador de productos de **venta y pedido** (web) aparecen **solo productos con existencia** en el almacén de la venta (sin almacén: existencia total), salvo los marcados **"vender sin stock"**. Los productos que ya están en un renglón se conservan. El buscador muestra **todos** los que coinciden (con scroll), ya no solo 10.

## D-028
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** se quita el botón **Corregir**; **Editar venta** permite cambiar **todo**: líneas, cliente, fecha, condición de pago, vendedor y notas.
- **Cliente con pagos:** los pagos aplicados **solo** a esa venta se mueven al nuevo cliente junto con ella. Si un pago también cubre otras ventas del cliente anterior, no se cambia el cliente hasta separarlo. Los precios de la venta se conservan (no se recalculan con la lista del nuevo cliente).
- **🧭 Criterio:** cambiar vendedor o fecha actualiza las comisiones **no pagadas**; si alguna comisión ya se pagó, no se permite cambiar el vendedor.

## D-029
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** regla universal de color de botones, solo con colores RutApp: **azul sólido** = confirmar, guardar, cobrar, crear/nueva; **naranja sólido** = editar; **rojo contorno** = cancelar, eliminar, devolución; **gris contorno** = consulta/impresión (documento, imprimir, PDF, exportar, ver entrega). En el detalle de venta las acciones van en un renglón: gris → rojo → azul → Editar al final.
- **Implementación:** `.btn-odoo-primary/-action/-success/-info` y `Button` default = azul; `.btn-odoo-editar` y `Button variant="editar"` = naranja; `.btn-odoo-danger` y `Button variant="destructive"` = rojo contorno.

## D-030
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** una entrega **asignada, cargada o en ruta** permite **quitar productos** (solo bajar cantidades), **reasignar** repartidor (mueve el stock de camión, D-022) y **cancelar**. Al quitar o cancelar, el sistema **pregunta** a dónde va la mercancía: **se queda en el camión** (se reconcilia en la descarga) o **regresa a bodega** (traspaso camión → almacén de surtido). Mismo criterio que D-024.
- **Límite:** productos con lote solo pueden quedarse en el camión (se regresan con la descarga).
- **Implementación:** `ajustar_entrega_cargada`, `cancelar_entrega_cargada` (migración 20261119234000).

## D-031
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («CONFIRMO migraciones de prueba hasta el corte»)
- **Decisión:** mientras la base nueva (`amybkerwkybffllaxpnz`) sea **de pruebas** y hasta el corte de producción, las migraciones **no destructivas** (crear/reemplazar funciones, vistas, columnas nuevas, recalcular datos de prueba) se aplican sin pedir `CONFIRMO` por cada una. Siguen requiriendo `CONFIRMO <acción>`: todo lo destructivo (DROP, DELETE masivo, quitar columnas/constraints/RLS), cualquier acción sobre la BD de producción (Lovable) y el corte mismo.
- **Vence:** el día del corte (docs/migracion-corte.md).

## D-032
- **Fecha:** 2026-11-19 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** cuando se elige «se le devolvió el dinero» (al cancelar o corregir una venta) y quien lo registra tiene un **turno de caja abierto**, se anota como **retiro** de ese turno («Devolución de dinero <folio>») y el arqueo lo resta. Si no tiene turno abierto, queda registrado con fecha y usuario (sin tocar caja) y se ve en estado de cuenta.
- **Implementación:** tabla `cobro_excedentes` (saldo a favor y devoluciones con fecha/usuario/venta/turno), `_registrar_excedente`, `saldos_a_favor_empresa()`; estado de cuenta muestra movimientos de saldo a favor y devoluciones de dinero (migración 20261120000000).

## D-033
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («cancela todo»)
- **Decisión:** cancelar una venta **cancela todo lo que cuelga de ella**: sus devoluciones quedan canceladas (ya no dan nota de crédito) y el **gasto** con que se reembolsó una devolución en efectivo se cancela (deja de contar en Gastos y Dashboard); ese dinero queda como «devolución de dinero» del cliente. La pregunta de qué hacer con el pago se hace **solo por lo que falta** (pagado − ya devuelto).
- **Implementación:** `gastos.cancelado_at`, `devoluciones.cancelado_at` (no se borran), `_cancelar_devoluciones_venta`, `cancelar_venta` actualizada; todas las consultas de gastos excluyen cancelados (migración 20261120010000).

## D-034
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Nota:** la parte de saldo la reemplaza [D-067](#d-067) (2026-11-25).
- **Decisión:** el **pedido** dice qué se pidió; las **entregas** dicen qué se entregó de verdad. Solo cuenta lo de entregas **validadas (hecho)** —no surtido, cargado ni en ruta—. El pedido queda **Entregado** cuando todas sus cantidades están entregadas; si falta algo queda/regresa a **Confirmado** (parcial), también al cancelar o reabrir una entrega. El **saldo de todo pedido (contado o crédito) es por lo entregado** (antes contado debía el total).
- **Implementación:** `fn_venta_cobrable`, `fn_pedido_entregado_completo`, `fn_sync_status_pedido`, triggers `auto_venta_entregado` y `ajustar_pedido_por_entregado`; en pantalla el saldo de esos pedidos se toma de la BD (migración 20261120030000). Cierra H4, H5 y H8 de la auditoría.

## D-035
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Decisión:** eliminar una venta (una o varias) es **una sola operación de la BD** y solo se permite para **borradores** o **canceladas sin pagos activos aplicados, sin facturas (CFDI, aun canceladas) y sin comisiones pagadas**; todo lo demás se cancela, no se borra. Las rechazadas regresan con su motivo.
- **Implementación:** `eliminar_ventas(uuid[])` (migración 20261120080000). Antes «Eliminar varias» borraba pagos aplicados e historial sin revisar (auditoría C5).

## D-036
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Sí, hazlo»)
- **Caso:** entrega asignada a Juan → no entregado → reasignada a Pedro → el cliente rechaza 5 de 10 → Pedro las trae en ruta pero son merma.
- **Decisión:**
  1. **Reasignar** una entrega cargada, en ruta o **no entregada** mueve la mercancía del camión anterior al nuevo y la deja **cargada** para el nuevo repartidor (también `reasignar_pendientes_usuario`, D-022).
  2. Al entregar parcial o no entregar, por producto rechazado se elige **Bueno** (queda vendible en el camión) o **Merma** (pasa a «Merma en camión»: viaja con el repartidor, no se puede vender, kardex propio).
  3. **Descarga aprobada:** lo vendible entra a bodega (como hoy) y la merma del camión pasa al almacén **Mermas** central.
  4. Cada acción en una sola transacción en la BD.
- **🧭 Criterio:** «Merma en camión» = almacén propio por camión (`almacenes.merma_de_almacen_id`), creado solo; así stock y kardex cuadran sin cambiar los cálculos existentes.
- **Implementación:** migración `20261120140000_d036_reasignar_y_merma_camion.sql` (`entrega_lineas.cantidad_merma`, `fn_sync_entrega_merma` por diferencia).

## D-037
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Todo bien» sobre el mockup https://claude.ai/artifact/4NWGjqV7F7HMSbsBfENeWh)
- **Decisión (escritorio y teléfono):**
  1. Fondo de la app **gris** (`--app-bg`); en oscuro, gris casi negro.
  2. **Un solo cuadro blanco por pantalla**: encabezado/folio, cliente, productos, totales, pagos, pestañas, buscador y tabla en la misma hoja, separados solo por líneas finas; nada de cuadros separados.
  3. **Letras con más contraste** (texto principal casi negro, secundario gris oscuro; bordes un poco más marcados).
  4. Encabezados de tabla y totales en gris muy claro **dentro** de la misma hoja.
- **Implementación:** tokens en `src/index.css` (`--app-bg`, `--foreground`, `--muted-foreground`, `--border`), `ListPage` como hoja única, `TABLE_CARD`/`GroupedTableWrapper` sin marco propio dentro de la hoja, detalle de Venta en una hoja.
- **Forma de preguntar (preferencia del dueño):** en preguntas de selección múltiple el título dice explícitamente «MARCA SOLO LO QUE QUIERES QUITAR» (o «…DEJAR») y cada opción empieza con «Quitar:» / «Dejar:».

## D-038
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (mockup https://claude.ai/artifact/UJToieXWdZfJquwHXw8QwP; quitó «buscador sigue abierto»)
- **Decisión (solo teléfono, módulo administrativo):** en **compras, traspasos, ventas y pedidos** los productos se agregan así: botón «Buscar producto» → buscador a pantalla completa (con existencias por producto) → al tocar un producto se despliegan **debajo** cantidad (− / +), presentación, precio/costo editable y subtotal, con botón **Agregar** → al agregar **regresa al documento**.
- **Variantes:** ventas/pedidos: precio de la lista del cliente, editable solo con permiso; compras: costo; traspasos: sin precio, muestra existencia del almacén origen. Escritorio sin cambios.

## D-039
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Excepción Excel/PDF»)
- **Decisión:** única excepción a «solo colores RutApp» (D-029): los botones de **Excel** van en **verde suave** y los de **PDF** en **rojo suave**, en todo el sistema, para reconocerlos de un vistazo. Todo lo demás sigue con colores RutApp.
- **Implementación:** clases `btn-excel` / `btn-pdf` en `src/index.css` (con modo oscuro); se aplican con `className` a cada botón de exportar. Los nuevos botones de Excel/PDF deben usarlas.

## D-040
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (no quitó ninguna opción)
- **Decisión (modales en web):** 3 anchos estándar — **chico 560 px** (confirmar, asignar, motivos), **mediano 760 px** (formularios, reportes), **grande 1100 px** (tablas, detalles); **encabezado y pie fijos** al hacer scroll (con línea), el botón cerrar viaja con el encabezado; **listas internas más altas** (usan el alto de pantalla, no una caja de 4 renglones); mismo estilo (fondo, esquinas, botones D-029).
- **Implementación:** central en `src/components/ui/dialog.tsx` (traduce los `max-w-*` existentes a la talla estándar; respeta anchos especiales) y `src/index.css` (sección D-040, con `:where()` para no romper modales con acomodo propio).

## D-041
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO
- **Origen:** reporte de usuario — apagó la comisión en «BOLSA Limpiador de lente 70ml» y «Jugo naranja 50ml» y seguía saliendo (venía de la lista «Precio 2 mayoristas», 10%).
- **Decisión:** la comisión sigue el **modo de precio** del producto. **Listas de precio** → la da la regla de la lista (el producto no muestra casilla propia; se cambia en la lista). **Precio fijo** → la da el producto (porcentaje o monto fijo por pieza) y las listas no aplican.
- **Implementación:** `fn_fill_venta_linea_comision` (migración `20261120190000`), pestaña Comisiones del producto, matriz Precios y Comisiones. Solo renglones nuevos o editados.
- **Corrige además:** la comisión de productos de precio fijo nunca se cobraba en ventas (la BD solo miraba listas).

## D-042
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Aplicar las 4»)
- **Decisión (botones en todo el sistema):** (1) formularios: «Guardar» azul RutApp y «Descartar» rojo suave; se eliminan «Guardar cambios», «Salir» o «Cancelar» para no guardar. (2) Modales/confirmaciones: «Cancelar» rojo suave (texto y borde rojos, fondo casi blanco); «No, volver» → «Cancelar». (3) Destructivos (Eliminar, Dar de baja, Cancelar venta/compra) también rojo suave, nunca rojo sólido; la confirmación dice la acción concreta. (4) Ventanas solo de consulta: «Cerrar» gris contorno; regresar = flecha ← gris.
- **Implementación:** `Button` variante `cancelar` y `destructive` suave; `AlertDialogCancel` usa `cancelar`; clase `btn-cancelar` para botones HTML; barrido de 128 «Cancelar», 11 rojos sólidos y 15 textos.
- **Forma de preguntar:** el dueño marcó las 4 opciones de «MARCA LO QUE QUIERES QUITAR» queriendo aplicarlas; en adelante preguntar en positivo («marca lo que SÍ quieres»).

## D-043
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Que sumen/resten 1 caja»)
- **Origen:** auditoría de presentaciones y granel (`docs/auditoria/2026-11-20-presentaciones-granel.md` §5).
- **Decisión:** en el Punto de venta y en la app de ruta, en un renglón vendido por presentación (caja/paquete) los botones «−» y «+» restan o suman **una presentación completa** (1 caja = factor de piezas) y recalculan los paquetes; por pieza o a granel siguen como antes (paso 1). «−» quita el renglón cuando ya no queda una presentación completa (igual que hoy con 1 pieza). En devoluciones de la app de ruta, los productos a granel se capturan con el **teclado numérico con decimales** de la venta móvil (se puede devolver menos de 1 kg).
- **Consecuencias:** el inventario sigue en unidad base (`venta_lineas.cantidad`); solo cambia cómo se captura. Sin cambios de BD.
- **Implementación:** `pasoCantidad` en `src/lib/ventaPresentacion.ts`; `PuntoVentaPage.tsx`, `RutaNuevaVenta/StepProductos.tsx`, `RutaNuevaVenta/StepDevoluciones.tsx`, `RutaDevolucion.tsx`.

## D-044
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Asegúrate que nada que esté desactivado aparezca en listas, solo en su histórico»; «se puede eliminar un proveedor aunque ya esté en uso»)
- **Decisión:** (1) Lo inactivo/dado de baja (productos, clientes, proveedores, almacenes, listas de precio, vendedores, zonas, vehículos…) **no se ofrece para elegir ni asignar**; en un registro que ya lo tiene se conserva y se muestra marcado «(inactivo)» (mismo criterio que categorías/marcas/unidades del producto). Los históricos (documentos, reportes, kardex, filtros de listas históricas) siguen mostrando el nombre. (2) Un maestro **en uso** (ventas, compras, movimientos, cobros, productos, pagos…) **no se elimina**: se avisa «Está en uso (N …); no se puede eliminar» y se pide desactivarlo. Preferencia: baja lógica.
- **Consecuencias:** función de solo lectura `usos_de_registros(p_tabla, p_ids)` (migración `20261120210000_d044_usos_de_registros.sql`, SECURITY DEFINER, solo ids de la empresa del usuario, cuenta referencias por FK excluyendo configuración propia del maestro y existencias en 0). No cambia FKs ni borra datos. FKs con `ON DELETE SET NULL/CASCADE` sobre historial quedan **reportadas, sin cambiar** (ver bitácora 2026-11-20).
- **Blindaje en BD (aprobado por el dueño: «Sí, bloquear en la BD», 2026-11-20):** trigger `trg_bloquear_borrado_en_uso` BEFORE DELETE en productos, clientes, proveedores, almacenes, lista_precios, tarifas, vehiculos, marcas, clasificaciones, unidades, listas y zonas; rechaza el borrado de un registro en uso con «Está en uso (…); no se puede eliminar. Márcalo Inactivo en su lugar.», aunque venga directo por API. Conteo interno `_usos_de_registros_ids` (sin `auth.uid`, sin permiso para clientes); `usos_de_registros` lo reutiliza. Excepciones: `delete_empresa_cascade` pone la bandera de transacción `app.borrando_empresa='1'` (único cambio a esa función) y el borrado en cascada desde `empresas` (empresa ya inexistente) no se bloquea. Migración `20261120220000_d044_bloquear_borrado_en_uso.sql`.
- **Implementación:** `src/lib/registrosInactivos.ts` (`opcionesConAsignado`, `validarSinUsos`); borrado físico validado en `ProductosListPage`, `ClientesListPage`, `ProveedorFormPage`, `useDeleteListaPrecio` (+ tarifa huérfana), `useDeleteVehiculo`; selectores en ficha de producto (proveedores), compras, cotizaciones, entregas, traspasos, solicitudes de traspaso/compra, promociones, clientes (lista/zona), usuarios (almacén/vehículo), tienda, descargas, configuración de apartado.


## D-045
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («haz que no se cierre a menos que ellos la cierren; al entrar en tienda en línea que les salgan sus precios bien»)
- **Decisión (tienda en línea):** (1) La sesión del cliente **no vence por tiempo**: se renueva sola al abrir la tienda y `tienda-refresh` renueva aunque el token ya haya vencido (firma válida). Solo se cierra si el cliente la cierra, si lo bloquean, si se elimina su acceso o si se desactiva la tienda; sin internet o con error del servidor la sesión se conserva. (2) Precios de la tienda = mismos que la app: copia fiel de `src/lib/priceResolver.ts` en `supabase/functions/_shared/tiendaPricing.ts` con prueba de paridad (`src/test/tiendaPricingParidad.test.ts`). Lista/tarifa del cliente con sesión igual que la venta de escritorio y de ruta: tarifa = `clientes.tarifa_id` → tarifa de su lista → tarifa general; lista = `clientes.lista_precio_id`; si el cliente no tiene ni lista ni tarifa, la lista predeterminada de la tienda. Visitante: lista predeterminada de la tienda o `precio_principal`. (3) El carrito toma los precios vigentes del catálogo (si agregó como visitante y luego entró, ve sus precios) y el pedido suma exactamente lo que vio.
- **Consecuencias:** sin cambios de BD. Requiere desplegar las edge functions `tienda-*` (con `CONFIRMO`). Un token robado sigue sirviendo hasta que bloqueen al cliente (ver propuesta de revocación al cambiar contraseña).

## D-046
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («corrige lo de eliminar empresa»; ante cobros con REP timbrado eligió «A) se borran junto con la empresa»)
- **Decisión:** eliminar una empresa (panel de super admin, CRM de trials, borrado masivo y limpieza de demos) borra **todos** sus datos en una sola transacción o nada. Los cobros con complemento de pago (REP) timbrado **se borran** junto con la empresa: elección del dueño; esa información fiscal se pierde en RutApp (el CFDI sigue existiendo ante el SAT).
- **Consecuencias:** `delete_empresa_cascade` arma el borrado desde el catálogo (todas las tablas de `public` con `empresa_id`, más sus hijas sin `empresa_id`), en pasadas hasta no dejar filas; ya no falla por tablas inexistentes ni por FKs NO ACTION nuevas. Se conserva solo `admin_trial_crm_deletions` (auditoría). Solo la pueden ejecutar super admin, `service_role` o SQL directo (antes cualquier usuario autenticado). Los candados «ya movió inventario» y «REP timbrado» se saltan solo con la bandera `app.borrando_empresa`. Empresas demo no van a la lista negra. No cambia FKs.
- **Implementación:** migración `20261120230000_eliminar_empresa_robusto.sql`; `AdminEmpresasTab.tsx` y la edge function `demo-login` (repo, **sin desplegar**) usan `delete_empresa_cascade`.

## D-047
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (reporte: «hay 10000 filas, páginas de 200; cuando filtro, por ejemplo, entrega 2000, esa estaba en la página 20 y tengo que paginar y paginar hasta llegar a ella»)
- **Decisión:** cuando hay texto de búsqueda, los resultados se ordenan por **relevancia antes que por fecha**: (0) folio/código idéntico (sin importar mayúsculas) o la parte numérica del folio igual al número buscado («2000», «ent-2000» o «ENT-002000» encuentran ENT-2000), también en el folio del documento relacionado (p. ej. el pedido de una entrega); (1) folio/código o nombre que **empieza** con el texto; (2) el resto (contiene). Dentro de cada grupo, el orden normal de la lista. La paginación y el total no cambian; la página 1 trae la coincidencia exacta. Al cambiar la búsqueda o un filtro la lista vuelve a la página 1.
- **Implementación (BD):** migración `20261120233000_d047_busqueda_relevancia.sql`: función común `fn_busqueda_relevancia(valor, búsqueda, es_folio)` (SQL IMMUTABLE incrustable; 0/1/2/3). `fn_logistica_entregas_workspace_v2` (Entregas), `fn_logistica_pedidos_page_v4` + `fn_logistica_pedidos_counts_v4` (Pedidos/Demanda) y `buscar_global` (⌘K) solo agregan el orden por relevancia (y que el mismo número de folio se encuentre aunque no «contenga» el texto: «ENT-002000»); firmas, SECURITY DEFINER, `search_path`, chequeo de empresa y columnas devueltas sin cambio. En `buscar_global` solo cambia el orden (el filtro sigue usando los índices de trigramas).
- **Implementación (front):** `src/lib/busquedaRelevancia.ts` (espejo de la función SQL, con pruebas en `src/test/busquedaRelevancia.test.ts`). Listas paginadas en servidor con PostgREST (Ventas y su vista por producto, Clientes por código, Productos por código/código de barras): `paginaConExactosPrimero` antepone las coincidencias exactas en la página 1 sin repetirlas en otras páginas y con el total exacto; solo el grupo 0 (los grupos 1/2 quedan en el orden normal porque PostgREST no ordena por expresión). Listas filtradas en el navegador: `ordenarPorRelevancia` con los 3 grupos (Traspasos y su detalle, Compras y su detalle, Cuentas por pagar, Pagos a proveedores, Devoluciones, Cobranza, Ajustes y su historial, Conteos, Cotizaciones, Facturas CFDI, Mermas, Solicitudes de compra y de traspaso, Gastos, Proveedores, Liquidaciones).
- **Rendimiento:** probado con 10 000 folios: el filtro del número de folio se activa solo si el texto tiene forma de folio y el folio contiene esos dígitos (`strpos`), sin costo apreciable; la relevancia se calcula solo sobre las filas que ya coinciden. Sin índices nuevos.

## D-048
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Ticket único con diseñador»; orden de trabajo aprobada vía coordinador; se agregó el reporte «pedido de contado sin pago sale como pagado»)
- **Decisión:** un solo ticket de venta. `construirModeloTicket` (`src/lib/ticketModelo.ts`) decide qué lleva el ticket (secciones, renglones, montos y textos) a partir de la venta y de `empresas.ticket_campos`; la pantalla tras la venta (ruta y POS, `TicketVenta`), el HTML (impresión por navegador, PNG, WhatsApp), el ESC/POS (Bluetooth y agente de escritorio) y el texto para compartir solo lo dibujan (`ticketLayout.ts`). La nota de venta carta (`generarPedidoPdf`) obedece las mismas opciones con su diseño B/N de siempre.
- **Diseñador (Configuración → Ticket):** vista previa con el ticket REAL (`buildTicketHTML` sobre una venta de ejemplo fija, al instante, 32 columnas en 58 mm y 48 en 80 mm) y la nota carta REAL (PDF, se regenera sola en escritorio; botón «Ver nota real (PDF)»). Opciones nuevas, encendidas por omisión, en el mismo `ticket_campos` (sin migración): `linea_codigo`, `linea_precio_unitario`, `linea_descuento`, `linea_precio_sugerido`, `linea_promo` (sección «Renglones de producto»), `impuestos_desglose` (IVA e IEPS por separado; apagado = un renglón «Impuestos»), y textos libres `texto_encabezado` / `texto_pie` (string, máx. 160). `ticket_campos` pasa a `Record<string, boolean | string>` con `campoOn` / `campoTexto`.
- **Total pagado:** solo pagos registrados (pagos, pago aplicado o recibido − cambio); nunca se supone pagado por ser «contado». Sin pagos se muestra «Total pagado $0.00» (igual que crédito, que no cambia) y el saldo es el total (o el saldo real si viene). En el estado de cuenta, la venta de contado con saldo suma «+Por pagar». Los llamadores pasan el pago/saldo real (entrega: pagos aplicados del pedido; detalle y lista: saldo de la BD aunque sea 0).
- **Consecuencias:** con `ticket_campos` vacío los montos no cambian (prueba antes/después en `src/test/ticketModelo.test.ts`); cambios visibles: código y descuento por renglón (nuevos, encendidos), notas de ticket completas (antes se cortaban a 32 caracteres en HTML), el ESC/POS ahora imprime encabezado «Cant Producto / Importe» y el precio sugerido como el HTML, nombres con «(cambio)», textos escapados en HTML. La nota carta muestra devoluciones y notas de ticket cuando hay y están encendidas.
- **Actualizado por [D-051](#d-051) (2026-11-21):** el PNG por captura y la imagen de WhatsApp se reemplazan por el PDF por código del mismo modelo (`ticketPdf`).

## D-049 — Devoluciones (F1) y liquidación aprobada (F3): reglas del dueño
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (respuestas a la auditoría de devoluciones y liquidación móvil)
- **Destino:** al devolver, el vendedor elige **por renglón, obligatorio**: «Vendible en camión» o «Merma en camión» (el motivo solo sugiere). La merma viaja con el camión y pasa a Mermas en la descarga (D-036). En escritorio se elige almacén.
- **Producto, cantidad y precio:** la devolución **no se liga a la venta de origen**: cualquier producto, **sin tope de cantidad** (solo cantidad > 0), acreditada al **precio de la lista de precios del cliente**.
- **Liquidación aprobada:** al aprobar se congela el efectivo esperado con su desglose; **reabrir solo con permiso**, registrando quién y por qué; el inventario se reajusta por diferencia.
- **«Al almacén» en ruta:** se **quita**; el sobrante regresa con la descarga de la liquidación.
- **«Descuento en venta» al devolver:** se **quita**; la devolución genera nota de crédito aplicada a la venta en ese momento (queda en estado de cuenta, como escritorio).
- **Cancelar la venta del día** donde se registró una devolución **no** la cancela: la devolución es un documento propio (producto donde se eligió, nota de crédito vigente) y se cancela por separado (D-026). Confirmado por el dueño 2026-11-20; modifica D-033 solo para devoluciones.
- **Implementación F3 (liquidación cerrada, 2026-11-21):** migración `20261121043000_f3_liquidacion_cerrada.sql`.
  1. **Aprobar, rechazar y reabrir son RPC** (`aprobar_liquidacion(id, notas, bodega)`, `rechazar_liquidacion(id, motivo)`, `reabrir_liquidacion(id, motivo)`; SECURITY DEFINER, misma empresa, permiso `logistica.descargas · editar`; otra empresa = «no encontrada»). Rechazo y reapertura exigen motivo. Un update suelto ya no cambia el estado ni lo congelado (trigger de permisos); una aprobada no se edita (se reabre).
  2. **Congelado:** al aprobar se guarda `esperado_desglose` (`fn_liquidacion_desglose`: todas las llaves de `fn_liquidacion_esperado` —fórmula única, no se toca— más cobros por método, cobros de saldos anteriores, ventas de contado/crédito, dinero devuelto, efectivo entregado y diferencia), `efectivo_esperado`, `diferencia_efectivo` y `congelado_at`. Aprobada = se muestra lo congelado; pendiente = en vivo; aprobadas antes de F3 siguen en vivo. Movimientos posteriores no cambian lo congelado: el detalle muestra un aviso «Hubo movimientos después de aprobar» (congelado → actual).
  3. **Historial:** `descarga_ruta_eventos` (aprobada/rechazada/reabierta, quién, cuándo, motivo y desglose; solo lectura por empresa; solo las RPC escriben) y en la liquidación `reabierta_por/at`, `motivo_reapertura`, `veces_reabierta`.
  4. **Inventario por diferencia (H7):** la primera aprobación con descargo de camión hace lo de siempre (físico a la bodega, camión en 0, diferencia como ajuste) y anota `cantidad_aplicada` por renglón e `inventario_aplicado_at`. Re-aprobar tras reabrir aplica en la bodega SOLO `real − cantidad_aplicada` (entrada o salida con kardex + ajuste «Reajuste de descarga reabierta»), sin volver a tocar el camión, lotes ni merma. Renglón agregado al reabrir cuenta desde 0. Con inventario aplicado no se rechaza, no se cambia la bodega ni el descargo, y la cantidad aplicada solo la escribe la aprobación.
  5. **Una liquidación por vendedor y día** (no cuentan las rechazadas; tampoco periodos traslapados): trigger con mensaje claro + índice único parcial `uq_descarga_ruta_vendedor_dia` (se crea solo si no hay duplicados viejos; si los hay, no se borran y queda solo el trigger).
  6. **Pantallas:** escritorio oculta Aprobar/Rechazar/Reabrir/Editar efectivo, fecha y conteo/Eliminar a quien no tiene el permiso (`usePermisos`); Reabrir pide motivo (diálogo); Eliminar solo pendientes/rechazadas sin inventario aplicado; con inventario aplicado se oculta Rechazar; historial y desglose congelado en el detalle. El teléfono muestra pendiente / aprobada (fecha y nota) / rechazada (motivo) / reabierta (motivo).
  - Verificado con rollback en BD de prueba: vendedor no aprueba, no cambia estado ni cantidad aplicada, no reabre (42501); otra empresa P0002; rechazo/reapertura sin motivo 22023; admin aprueba (bodega +8, camión 0, congelado); gasto posterior no cambia lo congelado (0.00 vs vivo −30.00); aprobada no se edita; reabrir → +5 en el conteo → re-aprobar: bodega solo +5 (un movimiento), camión recargado intacto; segunda liquidación del mismo día 23505; rechazada no bloquea una nueva, pero reabrirla con otra activa sí.
- **Implementación F1 + F2 (devoluciones, 2026-11-21):** migración `20261121050000_f1_devoluciones.sql` (solo agrega columnas nullable/default, reemplaza funciones; no borra ni cambia FKs).
  1. **Destino por renglón:** `devolucion_lineas.destino` (`vendible` | `merma`, CHECK) + `precio_unitario`, `aplica_venta`, `reposicion_almacen_id`. El trigger de inventario respeta el destino: en ruta, vendible → camión del vendedor; merma → «Merma en camión» (`_almacen_merma_camion`, D-036; se crea si falta) y la descarga aprobada la pasa a Mermas. En escritorio (almacén elegido): vendible → ese almacén; merma → Mermas. Renglones viejos (destino NULL) conservan el ruteo por motivo. Lotes: lo vendible entra con lote (FEFO-in); la merma no lleva lote (igual que D-036). Teléfono: selector obligatorio «Vendible en camión / Merma en camión» por producto; el motivo solo lo pre-selecciona (`devolucion_motivo_config`, default dañado/vencido/caducado → merma).
  2. **Precio:** lista de precios del cliente con impuestos (mismo `priceResolver` + `buildSalePricingSnapshot` que la venta; `src/lib/devolucionPrecio.ts`; en BD no existe función de precios, así que el front calcula el precio y la BD calcula el monto). El crédito de un renglón con destino lo calcula la BD: `round(precio × cantidad, 2)` (`_devolucion_linea_monto`; ignora un monto distinto mandado por el cliente). Cualquier producto, sin tope (solo cantidad > 0).
  3. **Acciones:** reposición (sin dinero; el producto entregado sale del camión en la misma transacción, también en «Solo devolución», H13; si se eligió otro producto de reemplazo va como renglón CAMBIO de la venta), nota de crédito (saldo a favor), devolver dinero (D-032: turno de caja abierto de quien registra → retiro de caja y `devoluciones.turno_id/caja_movimiento_id`; sin turno → cuenta en la liquidación del vendedor; en escritorio opcional gasto ligado a la DEVOLUCIÓN, no a la venta) y **«Aplicar a la venta»** = nota de crédito + cobro `saldo_favor` sobre la venta topado a su saldo (`cobros.devolucion_id`), lo que sobra queda a favor. «Descuento en venta» se rechaza en devoluciones nuevas. En la venta móvil la nota aplicada se resta de lo que se cobra y aparece en el ticket como pago «Nota de crédito».
  4. **Una sola vía:** `registrar_devolucion` (INVOKER, valida empresa de cliente/venta/almacén/vendedor/productos) para escritorio, móvil en línea y sin conexión: la cola manda UNA operación `rpc:registrar_devolucion` idempotente por id (prioridad después de venta, renglones, cobros y aplicaciones) y deja copia local para historial.
  5. **«Al almacén» se quitó** de Devolución de ruta: la pantalla es historial + detalle + «Nueva devolución» (abre el flujo con cliente `?solo=devolucion`).
  6. **H15:** las devoluciones de clientes ya no suben `carga_lineas.cantidad_devuelta` (solo la devolución vieja sin cliente lo hacía; la leen disponible en Mi carga y la venta móvil).
  7. **Cancelar la venta no cancela sus devoluciones** (`_cancelar_devoluciones_venta` sin efecto; `cancelar_venta` sin cambio: sigue descontando del pago solo los gastos de reembolso ligados a esa venta, que ya no se cancelan). Su inventario: la venta regresa TODO lo vendido; solo los renglones anteriores a F1 conservan la regla «no regresar lo ya devuelto» (`fn_sync_venta_inventario` con `dl.destino IS NULL`).
  8. **F2 `cancelar_devolucion(id, motivo)`** (SECURITY DEFINER, misma empresa, permiso `fn_puede_cancelar_devolucion`: super admin, dueño, usuario sin rol, rol con `ventas.devoluciones · eliminar`, o quien la registró si su rol móvil no le quita `ruta.devoluciones`): revierte exacto el neto de inventario por almacén (la merma ya descargada se toma de Mermas), la reposición (regresa al camión), lotes, cancela el cobro de la nota aplicada, rechaza si la nota a favor ya se usó, deposita a la caja el retiro, cancela el gasto, resta `cantidad_devuelta` de renglones viejos y guarda quién/cuándo/motivo. Editar = `registrar_devolucion` con `reemplaza_id` (cancela y registra en una transacción). Botón «Cancelar devolución» con motivo en el detalle de escritorio (lista de Devoluciones y pestaña de la venta) y del teléfono.
  9. **Liquidación (coordinado con F3):** único cambio a `fn_liquidacion_esperado`: el dinero devuelto que salió de una caja (`d.turno_id`) ya no se descuenta del efectivo del vendedor. Llaves sin cambio.
  10. **Entregas:** «No entregado» pide Bueno/Merma por producto (merma → `cantidad_merma`, como «Quitar producto»).
  11. **Ticket/estado de cuenta:** el ticket muestra destino (Vendible/Merma) y «Nota aplicada»; el PDF sale del mismo modelo. Estado de cuenta: «Nota de crédito (devolución) aplicada a la venta» y el dinero devuelto por devoluciones (con o sin caja).
  - Verificado con rollback en BD de prueba (Andrey vendedor, Diego dueño): vendible → camión +2, merma → merma en camión +2, reposición mismo producto neto 0 y con reemplazo −1 del camión; montos 31.50/21 (ignora 999 mandado); nota aplicada saldo 100 → 68.50 y saldo a favor 0 → 0; liquidación +21 sin caja y 0 con caja (retiro 20, depósito 20 al cancelar); gasto 12.25 no duplica; cancelar venta: devolución viva, venta regresa 5 de 5 (F1) y 2 de 3 (vieja), nota pasa a saldo a favor 21; cancelar devolución tras descarga a Mermas: inventario, saldo y liquidación vuelven exacto; doble cancelación 22023; vendedor sin permiso 42501; cliente de otra empresa 42501; mezcla con/sin destino, «descuento_venta» y cantidad 0 → 22023; editar = reemplazo; idempotente por id.

## D-050
- **Fecha:** 2026-11-20 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (orden de trabajo «F0 devoluciones y liquidación», aprobada vía coordinador; respeta D-049)
- **Decisión (F0 devoluciones y liquidación):** correcciones sin cambiar todavía el destino del inventario (F1):
  1. **Devolución de ruta guarda (H1):** sin elección de dinero, el renglón va con acción `reposicion` (default de la columna; no genera nota de crédito ni dinero). En línea se guarda en **una transacción** (`registrar_devolucion`: encabezado + renglones + devuelto de la carga; idempotente por id). La cola offline repara renglones viejos con acción vacía y no reintenta para siempre los de cantidad ≤ 0.
  2. **Una sola fórmula de efectivo esperado (H6, H8):** `fn_liquidacion_esperado` = cobros en efectivo − gastos − dinero devuelto por devoluciones (sin las ya reembolsadas con gasto) − reembolsos de cancelación/corrección **sin turno de caja** de un cobro en efectivo (D-032), del usuario del vendedor en el periodo. La usan el teléfono, el detalle, el alta y la lista del escritorio; sin conexión el teléfono usa su espejo `calcularEfectivoEsperado` (reembolsos = 0 hasta sincronizar). Ejemplo verificado: cobro 80, gasto 50, devuelto 7.75 → 22.25.
  3. **Permisos de liquidación (H9):** el vendedor solo crea la suya y pendiente, y mientras esté pendiente solo cambia notas; aprobar, rechazar, reabrir, cambiar montos/estado/fechas o borrar exige `logistica.descargas` (editar/eliminar; dueño, super admin y usuario sin rol: acceso, como la app). Igual para el conteo de la liquidación. Devoluciones que ya movieron inventario no se borran ni cambian cantidad/producto/acción/monto (D-006); exentos `service_role` y `app.borrando_empresa` (D-046).
  4. **Cantidad > 0** en `devolucion_lineas` (CHECK; 0 filas inválidas en la base de prueba) y en el front.
  5. **Ticket de ruta a crédito (H10):** el abono a cuentas anteriores ya no se resta también de esta venta; «Total pagado» = lo pagado de esta venta ($0.00 en crédito, D-048). Saldo ant 1000, venta 500, abono 300 → 1200.
  6. **H16:** la carga y la «Liquidación enviada» son las del vendedor logueado, no las de cualquiera de la empresa. **H20:** liquidar con $0 en efectivo pide confirmación en vez de bloquear.
- **Fuera de F0:** H2 «Al almacén» sigue sumando al camión (se quita en F1, D-049); destino por renglón y precio de lista (F1); cancelación formal de devoluciones (F2); congelar desglose al aprobar (F3).
- **Implementación:** migración `20261121000000_f0_devoluciones_liquidacion.sql`; `src/lib/liquidacion.ts`, `src/lib/devolucionGuardado.ts`, `src/lib/ticketSaldoRuta.ts`; pruebas `liquidacionEsperado`, `ticketSaldoRuta`, `devolucionGuardado`.

## D-051
- **Fecha:** 2026-11-21 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Ningún documento/reporte por captura de pantalla; todo generado por código; un solo ticket»; alcance aprobado vía coordinador)
- **Decisión:** ningún documento ni reporte se genera tomando captura de la pantalla (`html-to-image`/`toPng`) ni imprimiendo la pantalla (`window.print()`). Todo se genera por código a partir de los datos:
  1. **Ticket compartido/descargado = PDF por código** (`src/lib/ticketPdf.ts`, jsPDF): dibuja el MISMO modelo único (`construirModeloTicket` → `maquetarTicket`, D-048) con Courier real, logo con `addImage` si está encendido, alto dinámico (se parte en hojas solo si pasa de ~5 m). Ancho del diseñador: **80 mm = 48 columnas** o **58 mm = 32 columnas**, igual que el ESC/POS. **Sin `ticket_ancho` en el objeto empresa = 58 mm** (dueño, 2026-11-21): un solo helper `ticketAnchoEmpresa()` en `ticketPdf.ts` para PDF, impresión HTML, ESC/POS, cobros, POS, ruta, entregas, liquidación y Configuración (antes unos usaban 80 y otros 58). La columna `empresas.ticket_ancho` es NOT NULL con default '80' en BD, así que las empresas existentes conservan lo que tienen. Respeta todos los campos de `ticket_campos` (`campoOn`/`campoTexto`).
  2. **Compartir** (WhatsApp por la app, Web Share en ruta/POS/entrega) = **archivo PDF**; si el teléfono no puede compartir archivos, se descarga. WhatsApp desde el sistema envía el PDF como documento (`sendDocumentWhatsApp`, ruta de Storage con `empresa_id`); si falla, manda el mismo ticket como texto (`ticketATexto`).
  3. **Impresión térmica (ESC/POS)** e **impresión HTML por iframe** se quedan, siempre del mismo modelo.
  4. **Ticket de liquidación de ruta** (`liquidacionTicketHtml.ts`): se arma como documento de ticket (`construirDocumentoLiquidacion`) con el encabezado de empresa del diseñador (`construirEncabezadoTicket`) y los mismos renglones/anchos; sale en PDF por código (`generarLiquidacionTicketPdf`) o HTML del mismo motor. Firmas «Vendedor / Supervisor».
  5. **Reportes «Imprimir»** = PDF por código abierto en el visor del navegador (si el navegador bloquea la ventana, se descarga), con el mismo contenido y filtros de la pantalla: Reportes (pestañas con tabla: `generarPdfExport`, ahora con filtros y resumen general; pestañas con datos propios —promociones, cuentas por cobrar, saldo a la fecha, stock a la fecha, no visitados— registran su PDF con `useRegistrarPdfReporte`, que también arregla su botón PDF que no hacía nada), Reporte de comisiones, Reporte diario de ruta (el mismo `generarReporteDiarioPdf` de Descargar), Reportes de logística y Orden de carga (`src/lib/reportePdf.ts` + `src/lib/logisticaReportesPdf.ts`, estándar B/N).
- **Consecuencias:** `html-to-image` ya no se importa en `src` (el paquete sigue en `package.json`: quitarlo requiere `CONFIRMO`). El texto que se compartía armado a mano (con «Total pagado» = total en contado, contrario a D-048) se eliminó. El PDF de venta del bot de WhatsApp (`supabase/functions/wa-bot-webhook/ventaPdf.ts`) ya es por código y es una nota carta, no un ticket: **no se cambió** (unificarlo exige empaquetar el modelo para Deno, más consultas en el webhook y desplegar con `CONFIRMO`).
- **Implementación:** `src/lib/ticketPdf.ts`, `src/lib/pdfAcciones.ts`, `src/lib/reportePdf.ts`, `src/lib/logisticaReportesPdf.ts`, `src/hooks/useRegistrarPdfReporte.ts`; `ticketLayout` (`DocumentoTicket`, firmas con etiquetas), `ticketModelo` (`construirEncabezadoTicket`), `ticketHtml` (`documentoTicketHTML`); pruebas `src/test/ticketPdf.test.ts` y `src/test/reportePdf.test.ts`.

## D-052
- **Fecha:** 2026-11-21 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («no quiero que muevas datos de lo histórico, lo histórico se queda como está»)
- **Decisión:** en la recarga del corte (D-018) no se corrige ni se mueve ningún dato histórico de Lovable: devoluciones con cantidad ≤ 0 y liquidaciones duplicadas se quedan (CHECK NOT VALID / índice único sin crear), no se recalculan pedidos (B1) ni inventario de canceladas con devoluciones (B2), y no se ajustan las entregas con producto repetido (C3). Refuerza D-023.
- **Sí se aplica:** backfills A1–A3 de `post-carga.sql`, que no cambian montos, cantidades ni inventario; solo marcan estado ya ocurrido para que el sistema nuevo no lo re-aplique.
- **Detalle:** `docs/migracion-corte.md`.

## D-053
- **Fecha:** 2026-11-22 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («openpay elimina todo lo que exista, no se usa para nada» · `CONFIRMO borrar openpay`)
- **Decisión:** se quita Openpay del sistema: edge functions `openpay` y `openpay-public`, pestaña «Cobros» del Super Admin (`AdminCobrosTab`) y el pago con tarjeta Openpay de `/pagar/:token` (queda solo el link corto de factura Stripe `/pagar/in_...`). No se cargan `OPENPAY_*` ni su webhook en el proyecto nuevo.
- **BD:** se borra la tabla `payment_links` (0 filas en destino, sin dependencias; migración `20261122010000_quitar_openpay.sql`); `recargar-datos.sh` omite sus datos del backup de Lovable.
- **Funciones publicadas:** `openpay` y `openpay-public` en `amybkerwkybffllaxpnz` reemplazadas 2026-11-23 por una versión que solo responde 410 (no hay forma de borrarlas desde el entorno de desarrollo). Borrado definitivo opcional: Supabase → Edge Functions → la función → Delete.

## D-054
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («ya no usamos evolution para nada, todo será con zernio» · «hagámoslo desde cero, ya no usamos el token, ahora crean su cuenta directo»)
- **Decisión:** en el corte no se cargan `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `WHATSAPI_GLOBAL_TOKEN`, `WHATSAPP_OTP_TOKEN` ni `ADMIN_WHATSAPP_TOKEN`. WhatsApp se rehace con Zernio (cada empresa conecta su propia cuenta) como **módulo nuevo** (requiere diseño y `APROBADO R<n>`).
- **Impacto mientras no exista Zernio:** sin bot, bienvenida, mensajes programados, campañas, avisos de cobro por WhatsApp ni «Reenviar OTP» de Registros incompletos. El registro de cuentas NO depende de WhatsApp (`SignupPage.tsx`: `isVerified` no se usa).
- **Pendiente:** quitar el código de Evolution/WhatsAPI cuando se construya Zernio.

## D-055
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («elimina cualquier relación a Lovable… las fotos luego las subimos, activa mientras todo lo demás ya porque mañana operan con ella» · `CONFIRMO activar producción`)
- **Decisión:** RutApp opera desde 2026-11-23 en Supabase `amybkerwkybffllaxpnz` + Cloudflare (`rutapp.mx`). Se quitó el aviso de mantenimiento, se encendieron 11 crons, se borró el código de Lovable (sesión del editor `previewAuthStorage`, revisiones de hosts de Lovable, `lovable-tagger` en vite, funciones de correo de Lovable `handle-email-events` y `preview-transactional-email`, publicadas desactivadas con 410).
- **Pendiente:** Vault (`vault.sh`) y crons `create-invoice-reminder-daily` y `billing-align-bridge-aug2026-daily`; encender webhook nuevo de Stripe y apagar el de Lovable; archivos de Storage (5,793 URLs de fotos aún apuntan a `pkdwemunxxpafpmiqxiq`); quitar `lovable-tagger` de package.json junto con resincronizar `package-lock.json` (ya estaba desfasado: faltan drizzle-kit/drizzle-orm); rotar contraseña de la BD.

## D-056
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («C, cobrar proporcional al mes y si dan de baja ya no se cobra en el próximo mes pero no devolvemos»)
- **Decisión:** lo cobrado en Stripe sigue a los usuarios activos (estado `activo` y sin archivar; nunca menos del mínimo del plan). **Alta** (crear, reactivar o subir cantidad) → se cobra de inmediato la parte proporcional del periodo (`proration_behavior: always_invoice`). **Baja** (archivar o bajar cantidad) → sin devolución ni saldo a favor (`none`); la cantidad menor se cobra desde la siguiente renovación.
- **Dónde:** `manage-subscription` (`sync_active_users`, `update_quantity`, vista previa) y `billing-cycle` parte 5 (corrección diaria). Prueba `src/test/cobroUsuariosStripe.test.ts`.
- **Casos borde:** archivar y reactivar al mismo usuario dentro del mismo periodo vuelve a cobrar la parte proporcional. Si el cobro del alta falla, el usuario queda creado y Stripe reintenta la factura (solo «subir cantidad» manual bloquea si no se paga). Cambio de plan (`change_plan`) no se tocó.

## D-057
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («los cobros tienen que hacerse a las 9 am CDMX… corre en la fecha que les toca» · «A, todo tiene que ser a horario CDMX»)
- **Decisión:** todo cobro corre a las **09:00 America/Mexico_City (15:00 UTC; sin horario de verano)** en la fecha que le toca a cada cliente, sin importar la hora en que se suscribió.
- **Hecho:** crons `billing-cycle-daily`, `daily-billing-cron` y `create-invoice-reminder-daily` a `0 15 * * *`. Suscripciones nuevas de Stripe anclan al 1° a las 15:00 UTC (`stripe-webhook`, `select-plan`, `billing-realign-to-month-start`).
- **Hecho 2026-11-23 (CONFIRMO mover cobros 9am):** 31 suscripciones existentes movidas a las 09:00 CDMX (las 8 que estaban a medianoche UTC → día UTC: 1/12 y GLOBAL TRADE 4/12), verificado releyendo Stripe (31 «ya_esta_9am»); omitidas 7 past_due, 2 canceladas en Stripe (Distribuciones Renee, DSMART: activas en RutApp sin cobro, pendiente revisar) y 1 que cancela al final. stripe-webhook conserva `active` para trialing de suscripciones pagadas. Antes: Stripe solo permite fijar la hora con `trial_end` + `proration_behavior: none`: la suscripción queda «trialing» hasta esa hora y el webhook la marcaría `trial` en RutApp → antes hay que hacer que el webhook conserve `active` en esos casos.
- **Escalonado 2026-11-23 (`CONFIRMO escalonar crons`):** dentro de las 9 CDMX: `daily-billing-cron` 15:00, `billing-cycle-daily` 15:05, `create-invoice-reminder-daily` 15:10 UTC (evita doble factura local y que se pisen los estados). Script `scripts/migracion/crons.sql` al día.
- **No se tocó:** `billing-reanchor-to-cdmx-8am` (herramienta manual que mueve al día 1 a las 08:00; contradice esta decisión, no usarla) y `billing-align-bridge-aug2026` (puente histórico de agosto 2026).

## D-058
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Respaldar y purgar» · `CONFIRMO fase 3`)
- **Decisión:** la purga diaria del GPS (`purge_old_gps_history`, 03:00 UTC, 30 días por `recorded_at`) vuelve a correr; antes de habilitarla se respaldó todo lo anterior a 29 días en `vendedor_ubicaciones_historial_archivo` (221,000 filas; solo service_role). El archivo NO se purga y no recibe copias nuevas: es un respaldo único del histórico 17-abr → 25-oct-2026.
- **Fase 3 publicada:** idempotencia en las llamadas de Stripe que cobran (`_shared/stripeIdempotency.ts`, catálogo en `docs/04-FLUJOS-DE-NEGOCIO.md` § 10.1), `wa_clientes_saldos` con `p_empresa`, listas sin «Todos» (máx. 500; exportar Clientes/Productos trae todo lo filtrado). `billing-cycle`, `admin-billing`, `select-plan`, `create-trial-checkout` y `wa-scheduler-alertas-semanal` pasan a `supabase/config.toml` (se publican al subir a main).
- **Verificado:** `docs/sql/2026-11-23_verificar_fase3.sql` en producción 6/6 (todo se deshizo).

## D-059
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («se estaban marcando entregas automáticamente y no debe de ser así, tienen que picarle y ahí dice cobrar o no»)
- **Decisión:** una entrega solo pasa a «Entregado» cuando el repartidor toca «Marcar entregado» (o la acción masiva explícita de Demanda). Se quitó: (1) el marcado automático al abrir el detalle de una entrega pagada/no crédito (`RutaEntregaDetalle.tsx`) y (2) el marcado al cobrar un pedido o una cuenta pendiente hasta dejarla en cero (`useVentaDetalle.ts`).
- **Si no se pudo cobrar al entregar:** la entrega ya entregada con saldo muestra «Cobrar» en el detalle y en su renglón de la lista (abre el cobro del pedido).
- **Al tocar:** el botón espera a que cargue el saldo; con saldo pendiente pregunta «¿Vas a cobrar?» (Entregar y cobrar / Solo entregar); sin saldo entrega directo. Pruebas: `src/test/rutaEntregaPreguntaCobro.test.ts`.
- **Contado (2026-11-23, «si el pedido tiene de contado que en la entrega les exija cobrarlo, no se puede entregar sin cobrar»):** si `condicion_pago = 'contado'` y falta por cobrar, «Marcar entregado» solo ofrece «Cobrar y entregar»: abre el cobro del pedido y la entrega se marca al completar el cobro (lo que falte del pedido, sin pasar de lo que va en esta entrega). Cobro parcial → la entrega sigue pendiente y avisa cuánto falta. Crédito y «por definir» siguen preguntando «¿Vas a cobrar?».

## D-060
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (orden de trabajo «ventas y utilidad solo lo realmente vendido»)
- **Decisión:** Ventas y utilidad del Dashboard y de Reportes → Utilidad cuentan SOLO lo realmente vendido: `tipo='venta_directa'` con status confirmado/entregado/facturado, por `fecha`; `tipo='pedido'` con status entregado/facturado, por fecha de entrega (`fecha_entrega`; si es null, `fecha`). Un pedido levantado en octubre y entregado en noviembre cuenta en noviembre. Nunca borradores, cancelados ni pedidos sin entregar; siempre `es_saldo_inicial=false` y por empresa.
- **Por qué:** medido en producción (mes en curso, todas las empresas) se contaban como ventas $967k de pedidos confirmados sin entregar y $108k de borradores.
- **Dónde vive la regla:** front `src/lib/ventasRealizadas.ts` (dos consultas paginadas unidas sin repetidos + regla en memoria); BD migración `20261123050000_dashboard_utilidad_entregado.sql` (`dashboard_costo_ventas`, `dashboard_top_productos`, `dashboard_evolucion_mensual`). Si cambia en un lado, cambia en el otro. Pruebas: `src/test/ventasRealizadasD060.test.ts`.
- **Dashboard:** tarjetas Ventas, Ticket, Utilidad, comparativo con periodo anterior, ventas por día/vendedor/cliente, cobertura, drop size, % devoluciones s/venta, Meta del mes, Cartera (semanas), Comparativo 12 meses, mes vs mes por vendedor, «hoy» del Asesor IA, Rankings y Evolución. 🧭 Criterio: la tarjeta «Gastos» muestra «Utilidad neta» = utilidad bruta (ventas − costo de lo vendido) − gastos; ya no resta compras (comprar mercancía no es costo de lo vendido). «Margen» de la Meta del mes = ventas − costo de lo vendido (antes ventas − compras).
- **Reportes:** solo la utilidad (Resumen: costo/utilidad bruta/neta; pestaña Utilidad; su exportación por producto) usa la base D-060, respetando vendedor y tipo, no el filtro de status. Los listados de ventas del reporte no cambian (pueden incluir borradores).
- **Fuera (pendiente):** pestaña Equipo (`useDashboardEquipo`), avance de Metas (`useMetasVenta`), clientes en riesgo, Inteligencia de clientes (RPC) y el PDF programado de Reportes generales (edge function `_shared/reportes-generales-data.ts`) siguen con la base anterior. Observado: `ventas.fecha_entrega` no siempre es la fecha real de entrega (ver 00-estado).

## D-061
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Según uso de Entregas»; orden de trabajo aprobada)
- **Problema:** con D-060 las empresas que NO usan Entregas quedaban sin ventas (sus pedidos se quedan en «confirmado» aunque ya se surtieron y cobraron). Medido en producción: GLOBAL TRADE LOGISTICS (HNL) octubre 2026 = 1,290 pedidos confirmados y pagados por 2.74M, 0 entregados; el Dashboard mostraba 95k.
- **Decisión:** si la empresa NO usa Entregas, el pedido confirmado (también entregado/facturado) cuenta como venta por `fecha` del pedido; si SÍ usa Entregas, se queda la regla D-060 (entregado/facturado por fecha de entrega). Ventas directas sin cambio.
- **🧭 Implementación:** ajuste explícito por empresa `empresas.pedidos_cuentan_al_confirmar boolean NOT NULL DEFAULT false`, editable en Configuración → Visibilidad («Los pedidos cuentan como venta al confirmarse (no uso Entregas)»; misma pantalla y permiso `configuracion.general` que el resto de la configuración). La migración lo inicializa en true para las empresas con pedidos en los últimos 90 días y cero entregas «hecho» en los últimos 90 días (medido 2026-11-23: 18 empresas, entre ellas GLOBAL TRADE LOGISTICS, CARIOKA SAC, Botanas Don Nacho, Hielo Villanueva, RubiPets, Dofa, Super Dulces, Mi Empresa Demo y Distribuciones Renee; Tampico, Richard, GAMA, MG, DIFASUR, Dulces Jersey, Reginata, Multi, Dylan quedan en false).
- **Dónde vive la regla:** front `src/lib/ventasRealizadas.ts` (`pedidosAlConfirmar`) leído con `src/hooks/useAjusteVentasRealizadas.ts` (consulta aparte, no en el select de AuthContext, para no romper la carga de la empresa si el front sale antes que la migración; sin columna → regla D-060); BD migración `20261123060000_pedidos_cuentan_al_confirmar.sql` (mismas tres funciones de D-060, misma firma, permisos y autorización). Pruebas: `src/test/ventasRealizadasD061.test.ts`.
- **Revertir:** reaplicar las funciones de `20261123050000` y/o `UPDATE empresas SET pedidos_cuentan_al_confirmar = false`; quitar la columna requiere `CONFIRMO`.

## D-062
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (orden de trabajo: «solo pon el botón de convertir pedido en venta directa y ahí descuente y ellos que hagan lo que quieran»)
- **Decisión:** un pedido en borrador o confirmado, sin entregas activas, se puede convertir en venta directa con entrega inmediata desde el almacén que se elija; el stock se descuenta en ese momento (sin validar existencia) y, si queda saldo, se abre el cobro. Se conserva folio, fecha, productos, precios y cobros. Sin acción masiva; no se convierten datos existentes.
- **Dónde vive:** RPC `fn_convertir_pedido_a_venta` (migración `20261123070000_d062_convertir_pedido_a_venta.sql`, permiso `ventas·editar`, empresa con `fn_assert_empresa`, inventario con `fn_sync_venta_inventario`, saldo con `fn_recalc_venta_saldo`, historial `convertido_a_venta_directa`); front `src/lib/convertirPedido.ts`, `src/components/venta/ConvertirPedidoDialog.tsx`, botón en `src/pages/VentaForm/index.tsx` y `src/pages/ruta/RutaVentaDetalle/DetalleView.tsx`. Detalle en `docs/04-FLUJOS-DE-NEGOCIO.md` § 4.
- **Pruebas:** `src/test/convertirPedidoD062.test.ts`; `docs/sql/2026-11-23_verificar_d062.sql` 7/7 en Postgres local con todas las migraciones (descuenta una vez, repetir no duplica, con entrega falla, borrador con entrega cancelada sí, almacén y usuario de otra empresa fallan, sin permiso falla).
- **Aplicada 2026-11-23** (`CONFIRMO publicar convertir pedido`), verificada en prod 7/7. Pendiente: regenerar `types.ts`. ❓ La venta convertida conserva la `fecha` del pedido: con D-060 cuenta en Ventas/Utilidad en la fecha en que se levantó el pedido, no en la de la conversión (decisión del dueño si debe ser la de hoy).

- **Fecha al convertir (2026-11-23, decisión del dueño «Fecha del pedido»):** la venta convertida conserva la fecha del pedido; cuenta en Ventas/Utilidad y en el kardex con esa fecha.

## D-063
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (orden de trabajo «Editar venta: fecha de entrega y almacén editables»)
- **Decisión:** en «Editar venta» (web, venta/pedido confirmado o entregado, RPC `editar_venta`) se editan la **fecha de entrega** (pedidos sin entrega inmediata; también con entregas) y el **almacén** (sin entregas activas; almacén activo de la misma empresa; lotes elegidos a mano con existencia en el nuevo). Al cambiar el almacén el stock ya aplicado vuelve al almacén anterior y sale del nuevo. El tipo sigue bloqueado (para eso D-062).
- **Hallazgo:** `fn_sync_venta_inventario` compara lo deseado contra lo aplicado por producto/lote **sin almacén**: cambiar `ventas.almacen_id` solo (aunque dispara el trigger) no movía stock (Postgres local con las funciones de prod: almacén viejo 7, nuevo 10 tras cambiar). No se cambió `fn_sync_venta_inventario` (función central; el respaldo por almacén del vendedor movería ventas viejas al re-sincronizar): la reversa vive en `editar_venta` y solo corre cuando el usuario cambia el almacén.
- **Fecha de entrega con entregas:** solo cambia `ventas.fecha_entrega`; las entregas (`entregas.fecha`, una por entrega, pueden ser varias) no se mueven. Con D-060 un pedido entregado cuenta en Ventas/Utilidad por esa fecha.
- **Dónde vive:** migración `20261123080000_d063_editar_venta_almacen_fecha_entrega.sql` (parte de la función vigente en prod, md5 5fb01bb8…, igual al repo); front `src/lib/editarVentaEncabezado.ts`, `src/pages/VentaForm/VentaFormFields.tsx` (almacén con aviso «Se regresará el stock al almacén anterior y saldrá del nuevo» o motivo de bloqueo; fecha de entrega editable), `useVentaForm.ts` (`p_header` con `almacen_id`/`fecha_entrega`; lo ya tomado no cuenta como disponible en otro almacén), `index.tsx`; historial `almacen_cambiado` / `fecha_entrega_cambiada`. Detalle en `docs/04-FLUJOS-DE-NEGOCIO.md` § 4.
- **Pruebas:** `src/test/editarVentaD063.test.ts`; `docs/sql/2026-11-23_verificar_d063.sql` 12/12 en Postgres local con todas las migraciones (con la función anterior 2/12).
- **Revertir:** reaplicar el `CREATE OR REPLACE` de `20261119220000_editar_venta_encabezado.sql` y revertir el commit del front.
- **Pendiente:** aplicar en producción (subir a `main` aplica la migración; requiere `CONFIRMO`) y correr `docs/sql/2026-11-23_verificar_d063.sql`.

## D-064
- **Fecha:** 2026-11-23 · **Autor:** Diego León (dueño) · **Estado:** APROBADO (orden de trabajo «Fase 4: monitoreo y pruebas», decisión «Interno + correo»)
- **Decisión:** los errores de la app y la salud de los celulares se guardan en Supabase y se ven en el Super Admin (Plataforma → **Salud**); las alertas llegan por correo con Resend (mismo envío que las demás funciones: `_shared/app-email.ts` + `RESEND_API_KEY`). **No** se agrega Sentry nuevo: el código Sentry existente queda igual (si algún día se pone `VITE_SENTRY_DSN`, sigue funcionando en paralelo).
- **Errores (`app_errores`):** `captureAppError` (`src/lib/observability.ts`) además llama a la RPC `registrar_error_app` (import dinámico de `src/lib/telemetriaRuntime.ts`; solo producción y fuera de iframe; si falla, `console.warn`). Sin datos personales: mensaje sin correos/teléfonos/tokens (en el teléfono y otra vez en la BD), ruta sin consulta ni ids, detalle solo con llaves permitidas (tabla, operación, fn, código…; de las listas solo el número), empresa y usuario los pone el servidor. Freno: mismo error 1/min y máx. 10/min en el teléfono; 20/min y 300/h por usuario en la BD; detalle ≤ 4 KB. Errores de red no se registran. Se reportan: dead-letters de la cola, fallas de la subida automática, abonos rechazados, errores de descarga de `offlineSync` (no los tiempos agotados) y el error global de pantalla. Solo el super admin los lee (RLS); purga diaria a 30 días.
- **Salud de dispositivos (`dispositivos_sync`):** una fila por usuario + instalación (`uniline_device_id`): versión, plataforma (android/ios/…), pendientes, fallidas (dead-letter), último sync correcto (cola vacía tras una pasada), último error, `updated_at`. RPC `registrar_salud_dispositivo` al abrir la app y tras cada pasada de la cola (freno 1/min con envío final para que no quede un «pendiente» ya subido; el servidor ignora reportes a < 10 s). RLS: super admin todo; Administrador o dueño ven los de su empresa (sin pantalla para ellos todavía). Sin reportar 90 días → se purga.
- **Panel:** pestaña «Salud» (`src/components/admin/AdminSaludTab.tsx`): errores agrupados (origen, mensaje, empresa, veces, usuarios, última vez, versión; 24 h / 7 días), celulares con pendientes o fallidas (atorado = pendientes sin subir ≥ N h), crons (`cron.job` + `cron.job_run_details`: última corrida, fallas, último error; errores HTTP de `pg_net` ≥ 400; los «Timeout of 5000 ms» de pg_net se cuentan aparte porque no son fallas) y destinatarios/umbrales de alertas (`alertas_config`, una fila; se editan con `admin_guardar_alertas_config`, sin valores en el repo). Lecturas por RPC solo super admin / servidor: `admin_salud_errores`, `admin_salud_dispositivos`, `admin_salud_crons`.
- **Alertas:** edge function `alertas-salud` (en `config.toml`, `verify_jwt = false`; valida `x-cron-secret`/service_role/super admin con `isPrivilegedCaller`), cron `alertas-salud-horaria` a las `17 * * * *` con `x-cron-secret` leído de Vault (`CRON_SECRET`). Revisa la última hora: crons fallidos, HTTP con error, celulares con fallidas o con pendientes ≥ `horas_pendientes` (6) y picos de errores ≥ `umbral_errores_hora` (20). Manda UN correo resumen por destinatario (plantilla `alertas-salud`) solo si hay algo nuevo: cada hallazgo tiene una clave en `alertas_enviadas` (cron = corrida; celular = fallidas o episodio de pendientes; errores = hora) y se reclama antes de enviar; si nadie recibe el correo, se sueltan. `POST {"simular": true}` (super admin) devuelve los hallazgos sin enviar.
- **Cursor de sync por empresa:** `cacheTimestamps` guarda `empresaId`; `cursorDeEmpresa` (`src/lib/offlineSync.ts`) descarta el cursor de otra empresa (baja completa) y lo vuelve a estampar. Las entradas viejas sin empresa se aceptan (la purga por cambio de empresa ya las borraba). `SYNC_EPOCH` y la purga, sin cambio.
- **Dónde vive:** migración `20261123090000_d064_observabilidad.sql`; front `src/lib/telemetriaInterna.ts`, `telemetriaRuntime.ts`, `saludDispositivo.ts`, `saludPanel.ts`, `syncQueue.ts` (`estadoSaludCola`, `reportarSaludDispositivo`, `LS_ULTIMO_SYNC_OK`), `offlineSync.ts`, `App.tsx` (`SaludDispositivoMount`), `SuperAdminPage.tsx`; funciones `supabase/functions/alertas-salud/index.ts`, `_shared/alertasSalud.ts`, plantilla `_shared/transactional-email-templates/alertas-salud.tsx`.
- **Pruebas:** `src/test/observabilidadD064.test.ts` (sin PII, freno, envío que falla no rompe, throttle con envío final, hallazgos y dedupe, migración estática, Sentry intacto), `saludColaD064.test.ts` y `cursorSyncPorEmpresaD064.test.ts` (IndexedDB simulada; la prueba falla si se quita el chequeo de empresa). `docs/sql/2026-11-23_verificar_fase4.sql` 11/11 en Postgres 16 local con todas las migraciones (migración reaplicable). `deno check` de `alertas-salud` OK.
- **Revertir:** quitar los crons (`select cron.unschedule('alertas-salud-horaria'); select cron.unschedule('observabilidad-purga-diaria');`), revertir el commit del front (la app deja de llamar las RPC) y quitar `[functions.alertas-salud]` de `config.toml`. Borrar tablas/funciones nuevas requiere `CONFIRMO`.
- **Pendiente (fuera de alcance):** e2e offline en CI, suite SQL multiempresa en CI, auto-descartar dead-letters; regenerar `types.ts` tras aplicar; pantalla de salud para Administrador/dueño de la empresa (la RLS ya lo permite); errores antes de iniciar sesión no se registran (la RPC exige sesión).

## D-065 — Reenvío idempotente de pagos y fallidos sin reintento continuo
- **Fecha:** 2026-11-24 · **Estado:** aprobada por el dueño («sí, aplica que descarte solos los reintentos rechazados»); publicación pendiente de `CONFIRMO`.
- **Problema (evidencia):** las validaciones BEFORE INSERT de `cobro_aplicaciones` (`fn_validate_cobro_aplicacion_no_excede_saldo`, `fn_validate_cobro_no_sobreaplicado`) contaban la propia fila ya guardada; el reenvío idempotente del celular (`upsert … ignoreDuplicates`) fallaba con «excede el saldo pendiente» (reproducido en prod: VTA-3129). Además, `processSyncQueue` reintentaba los fallidos en cada pasada (~30 s): ≈3,800 errores/día en Postgres.
- **Decisión:** (1) si ya existe una aplicación con el mismo id, las validaciones no aplican (el ON CONFLICT la ignora y el celular la quita de su cola). Un pago NUEVO que excede sigue rechazado. (2) Un fallido se reintenta solo cada 30 min o con «Reintentar». No se borra nada a ciegas: lo que no está en el servidor sigue en Pendientes.
- **Archivos:** `supabase/migrations/20261124010000_d065_reenvio_cobro_aplicacion_idempotente.sql`, `src/lib/syncQueue.ts`, `src/test/syncQueueFase2.test.ts`, `docs/sql/2026-11-24_verificar_d065.sql`.

## D-066 — La app instalada se actualiza sola (sin esperar «Actualizar»)
- **Fecha:** 2026-11-25 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Activar la versión nueva sola»).
- **Problema (evidencia):** tras el corte (D-055), celulares que nunca tocaron «Actualizar» siguieron con la app de antes del corte y guardaron en la base vieja de Lovable: 164 ventas y 177 cobros del 22-nov 6:41 pm al 24-nov (export del dueño). `vite.config.ts` tenía `registerType: "prompt"`, `skipWaiting: false`.
- **Decisión:** `skipWaiting: true` y `clientsClaim: true`: el SW nuevo se activa al descargarse; la siguiente apertura carga la versión nueva y la cola offline (mismo origen) sube a la base nueva.
- **Riesgo aceptado:** si el SW cambia mientras el vendedor está en la app y abre una pantalla aún no cargada, la app puede recargarse (GlobalErrorBoundary maneja chunks viejos) y perder una captura sin guardar.
- **Archivos:** `vite.config.ts`, `src/test/pwaActivacionInmediata.test.ts`.

## D-067 — El saldo de un pedido nace al generar la entrega (reemplaza la parte de saldo de D-034)
- **Fecha:** 2026-11-25 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («En cuanto se genera la entrega ya es una cuenta por cobrar, a menos de que se cancele»; opción «Desde que se genera»; «corrige de aquí en adelante»). **Aplicada 2026-11-25** (`CONFIRMO aplicar D-067 saldo desde la entrega`).
- **Problema (evidencia):** con D-034 solo contaban entregas «hecho». Un pedido de contado en ruta (Multi PED-0251, $65, entrega ENT-0218 cargada) tenía saldo $0: en la app el botón «Cobrar» solo mostraba otras cuentas, el cobro del pedido salía en $0 (`useVentaDetalle.ts:251`) y no se exigía cobrar al entregar (`RutaEntregaDetalle.tsx:239`).
- **Decisión:** en pedidos «a lo entregado», `fn_venta_cobrable` cuenta las cantidades de toda entrega que no esté `cancelado` ni `no_entregado` (borrador lleva 0 hasta surtirse). El estado del pedido (Entregado/Confirmado) sigue contando solo entregas «hecho». Al borrar una entrega o renglón se recalcula el pedido.
- **Alcance:** «de aquí en adelante» (dueño): sin recálculo masivo; cada pedido toma la regla en el siguiente cambio de su entrega o cobro.
- **Impacto si se recalculara todo (ensayo deshecho, NO se aplica):** Tampico 90 pedidos $108.28 → $58,487.02 (87 en ruta), MG 69 $11,498 → $12,083.89, Multi 6 $0 → $497; Richard, Dylan, Renee, Reginata y Demo sin cambio. Entregas viejas sin validar (cargado desde sep/oct en Dylan, Reginata, Renee, Richard) ya cuentan como deuda.
- **Archivos:** `supabase/migrations/20261125010000_d067_saldo_desde_entrega.sql`, `docs/sql/2026-11-25_verificar_d067.sql`.

## D-068 — El apartado de un pedido descuenta lo que ya va en entregas
- **Fecha:** 2026-11-26 · **Autor:** Diego León (dueño) · **Estado:** APROBADO («Corregir y liberarlo»). **Aplicada 2026-11-26** (`CONFIRMO aplicar D-068 apartado`).
- **Problema (evidencia):** `fn_sync_apartado_linea` recreaba el apartado por la cantidad completa del renglón al editar un pedido ya surtido/entregado. Tampico PED-11679 (entregado el 23-nov 21:11 con ENT-11902, editado 23:08) volvió a apartar 90 pzas, entre ellas BOMBON GIGANTE C30 (el dueño lo atribuía a PED-11236, que no aparta nada). También PED-12610 (37), PED-12669 (37), PED-12621 (2) y Multi PED-0161 entregado (2).
- **Decisión:** se aparta solo `cantidad del renglón − lo que ya va en entregas vigentes` (no canceladas ni no entregadas; mismo criterio que `trg_entrega_lineas_consume_apartado`). Se liberan las 170 pzas retenidas de más. No se tocan existencias, ventas ni entregas.
- **Ensayo en producción (deshecho):** cambian solo esos 5 pedidos (47 renglones); el apartado del bombón queda en 0.
- **Archivos:** `supabase/migrations/20261126010000_d068_apartado_descuenta_entregas.sql`.

## D-069 — Pedido «cerrado a lo entregado» queda Entregado
- **Fecha:** 2026-11-27 · **Estado:** propuesto por auditoría a pedido del dueño; publicación pendiente de `CONFIRMO`.
- **Problema (evidencia):** `cerrar_pedido_parcial` pone `cerrado_at` y recorta renglones a lo entregado pero no cambia el estado; desde D-034 `fn_sync_status_pedido` se salta los cerrados, así que quedan en Confirmado. Tampico PED-11679, PED-12610, PED-12621 y PED-12669 (cerrados 23–25 nov) seguían «Confirmado» y no contaban como entregados en reportes/dashboard (D-060).
- **Decisión:** al cerrar, Confirmado → Entregado; al reabrir, el estado vuelve a salir de las entregas (`fn_sync_status_pedido`). Se corrigen los 4 pedidos existentes.
- **Inventario:** no se mueve. Los pedidos con entregas no mueven stock por estado (`fn_sync_venta_inventario` sale antes); ensayo en producción (deshecho): 0 filas de stock cambiadas, saldos iguales.
- **Archivos:** `supabase/migrations/20261127010000_d069_pedido_cerrado_entregado.sql`.
