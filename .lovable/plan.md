## Problema

Al borrar productos, el error ahora viene de `movimientos_inventario_producto_id_fkey`. Es el mismo patrón que arreglamos antes para `ajustes_inventario`: la FK bloquea el delete porque hay movimientos históricos del producto.

## Solución

Migración que ajuste la FK de `movimientos_inventario.producto_id` para preservar historial pero permitir borrar el producto:

1. `ALTER TABLE movimientos_inventario ALTER COLUMN producto_id DROP NOT NULL`
2. `ALTER TABLE movimientos_inventario DROP CONSTRAINT movimientos_inventario_producto_id_fkey`
3. Recrear con `ON DELETE SET NULL` referenciando `productos(id)`

Revisar también otras FKs hacia `productos` que puedan dispararse al borrar (ej. `venta_lineas`, `compra_lineas`, `entrega_lineas`, `stock_almacen`, `stock_camion`, `conteo_lineas`, `merma_lineas`, `devolucion_lineas`, `producto_presentaciones`, `producto_equivalencias`, `producto_proveedores`, `tarifa_lineas`, `lista_precios_lineas`, `traspaso_lineas`, `promocion_aplicada`, `carga_lineas`, `descarga_ruta_lineas`, `cliente_pedido_sugerido`, `auditoria_lineas`, `cfdi_lineas`).

**Estrategia recomendada:**
- Tablas de **historial/movimiento** (movimientos_inventario, ajustes_inventario, venta_lineas, compra_lineas, entrega_lineas, devolucion_lineas, merma_lineas, conteo_lineas, traspaso_lineas, carga_lineas, descarga_ruta_lineas, cfdi_lineas, auditoria_lineas, promocion_aplicada): `ON DELETE SET NULL` (preservar historia con snapshot que ya existe en esas tablas).
- Tablas de **catálogo/stock vivo** (stock_almacen, stock_camion, producto_presentaciones, producto_equivalencias, producto_proveedores, tarifa_lineas, lista_precios_lineas, cliente_pedido_sugerido): `ON DELETE CASCADE` (no tiene sentido conservarlas sin producto).

## Confirmación

¿Quieres que aplique solo el fix puntual de `movimientos_inventario` (rápido, posiblemente otro error después), o el barrido completo de todas las FKs hacia `productos` para que el borrar productos inactivos quede totalmente desbloqueado de una vez?
