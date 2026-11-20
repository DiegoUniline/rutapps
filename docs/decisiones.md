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
