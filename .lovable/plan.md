# Opción A — Entrega Express (1 click)

Reducir el flujo Pedido → Entrega → Surtir → Asignar de ~6 clicks a **2 clicks**.

## UX

En `PedidoPendienteDetailPage` (detalle del pedido pendiente):

- Botón primario **⚡ Surtir y despachar** en el header (reemplaza posición del "Crear entrega" actual; el "Crear entrega" pasa a ser secundario "Surtir parcial…").
- Pre-llena Almacén con el del perfil del usuario, y Repartidor con el vendedor del pedido.
- Un solo click ejecuta toda la cadena y abre la entrega creada con toast: *"Entrega ENT-XXX creada y surtida"*.

Comportamiento:
- Si hay líneas pendientes y un almacén seleccionado → crea entrega, surte TODAS las líneas pendientes al 100%, y asigna repartidor si se eligió.
- Status final: `asignado` (si hay repartidor) o `surtido` (si no).
- El paso de cargar/entregar sigue siendo manual (mueve stock al camión, requiere confirmación física).

## Cambios técnicos

### 1. Nuevo hook `useEntregaExpress` en `src/hooks/useEntregas.ts`

Encadena en una sola mutación:
1. INSERT en `entregas` (status borrador, con almacén y vendedor del pedido)
2. INSERT bulk en `entrega_lineas` (todas las pendientes con `cantidad_pedida = cantidad_pendiente`)
3. RPC `surtir_linea_entrega` por cada línea (descuenta stock atómicamente, ya existe)
4. UPDATE final: `status='asignado'` + `vendedor_ruta_id` si hay repartidor; si no, `status='surtido'`

Invalida queryKeys: `entregas-list`, `entregas-by-pedido`, `entrega`, `ventas`, `productos`, `movimientos`, `stock-almacen`.

Manejo de error: si falla en pasos 3-4, la entrega queda en borrador con líneas — el usuario puede continuar manualmente desde el flujo actual (no se hace rollback porque ya existen líneas surtidas con stock movido).

### 2. `src/pages/PedidoPendienteDetailPage.tsx`

- Importar `useEntregaExpress`.
- Pre-llenar `almacenId` con `profile.almacen_id` y `vendedorRutaId` con `pedido.vendedor_id` en un `useEffect` cuando carga el pedido.
- Reemplazar el botón "Crear entrega" del header por dos:
  - **⚡ Surtir y despachar** (primario, llama `useEntregaExpress`)
  - **Surtir parcial…** (secundario `outline`, llama el flujo actual `useCrearEntrega` que solo crea borrador)
- Tras éxito de express: `navigate(`/logistica/entregas/${result.id}`)` para que el usuario vea el resultado.
- Validar antes de ejecutar: si falta almacén → toast "Selecciona almacén antes de despachar" y hacer scroll al selector.

### 3. (Opcional, mismo cambio) `src/pages/logistica/PedidosPendientesPage.tsx`

Añadir icono ⚡ por fila (solo si el pedido NO tiene entregas activas) que abre un mini-popover con almacén/repartidor pre-llenados y botón "Despachar". Aprovecha el mismo hook.

## Lo que NO cambia

- Modelo de datos (entregas, entrega_lineas, RPCs).
- Lógica de inventario (sigue siendo DB-autoritativa).
- Flujo manual existente sigue disponible como "Surtir parcial".
- Cargar entrega / Validar entrega (siguen como acciones explícitas).

## Resultado

Caso 80% (pedido completo, vendedor conocido, almacén del usuario): **1 click** desde el detalle.
Caso parcial (cantidades distintas, varios almacenes): flujo actual intacto.
