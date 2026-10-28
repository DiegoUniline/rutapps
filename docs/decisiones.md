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
