## Resumen
Función opcional por empresa para apartar stock al generar pedidos (vista móvil), con selector de almacén por línea y múltiples almacenes habilitados en Configuración. Con el flag apagado, cero cambios.

## 1. Base de datos (1 migración)

**`empresas`** — nuevas columnas:
- `apartar_stock_pedidos boolean not null default false`
- `apartado_almacenes_ids uuid[] not null default '{}'` — almacenes habilitados para apartar/consultar en pedidos móviles.

**`venta_lineas`** — nueva columna:
- `almacen_id uuid null references almacenes(id)` — almacén del que saldrá esa línea (solo se usa cuando el pedido se generó con el flag ON).

**Nueva tabla `stock_apartado`**
- `id, empresa_id, venta_id, venta_linea_id (unique), producto_id, almacen_id, cantidad, created_at`
- Index `(empresa_id, almacen_id, producto_id)`
- RLS por `empresa_id`, GRANT a authenticated + service_role.

**Función `fn_disponible_almacen(producto_id, almacen_id) → numeric`**
- `stock_almacen.cantidad − COALESCE(SUM(stock_apartado.cantidad), 0)`
- `stable`, `security definer`, scope por `empresa_id` del producto.

**Triggers (DB-authoritative, idempotentes):**
1. **Insert/update `venta_lineas`** en venta con `tipo='pedido'` y empresa con flag ON → upsert en `stock_apartado` con la cantidad y `almacen_id` de la línea. No deduce stock.
2. **Delete `venta_lineas`** o **cancelación** de venta tipo pedido → borra filas correspondientes en `stock_apartado`.
3. **Insert `entrega_lineas`** → consume del `stock_apartado` (decrementa o borra) y deduce de `stock_almacen` del almacén de la línea. Si entrega < apartado, el remanente queda apartado.
4. Conversión pedido→venta_directa o entrega total → al cerrar la venta, libera cualquier `stock_apartado` remanente.

Permite negativos: no hay CHECK que bloquee.

## 2. Frontend — Configuración Empresa

Nueva subsección "Inventario / Pedidos" en `src/pages/configuracion/...`:
- Toggle "Apartar stock al generar pedidos".
- Multi-select de almacenes (visible solo si toggle ON, requerido al guardar).

## 3. Frontend — Vista móvil de Pedido

`src/pages/ruta/RutaNuevaVenta/...` (paso productos cuando `tipo='pedido'` y `empresa.apartar_stock_pedidos`):
- Selector de almacén arriba del listado, opciones = `empresa.apartado_almacenes_ids`, default = primero.
- Badge "Disponible: X" por producto vía `fn_disponible_almacen(producto_id, almacen_actual)`.
- Sin filtrar por stock (sobreventa permitida).
- Cada `CartItem` guarda su `almacen_id`. Cambiar el selector solo afecta nuevas líneas; las ya agregadas conservan su almacén original (editable desde la línea).
- Al guardar, cada `venta_lineas.almacen_id` se persiste; el trigger crea el apartado.

## 4. Lo que NO se toca
- Pantalla de Ventas (desktop y móvil).
- POS, cotizaciones, venta directa, entregas existentes.
- Empresas con flag OFF: cero cambios; los triggers no actúan porque chequean el flag de la empresa.

## 5. Edge cases
- Editar pedido: trigger reescribe el apartado de la línea modificada.
- Entrega parcial: deduce stock real solo de lo entregado; resta del apartado en la misma cantidad.
- Cancelar pedido: borra todos los apartados de esa venta.
- Apagar el flag mientras hay pedidos abiertos: los apartados existentes se respetan hasta entregarse o cancelarse (los triggers siguen funcionando si la línea ya tiene `almacen_id`).

## Detalles técnicos
- Hook nuevo `useDisponiblePorAlmacen(producto_ids, almacen_id)` con React Query, key `['disponible', empresaId, almacenId, ...ids]`, invalida en realtime sobre `stock_apartado` y `stock_almacen`.
- `requireEmpresa` y filtros `empresa_id` en todas las queries nuevas.
- Tipos TS regenerados tras migración; agregar `almacen_id` opcional a `VentaLinea` y `CartItem`.

¿Procedo con la migración primero?
