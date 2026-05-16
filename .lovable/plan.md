## Qué encontré

El problema sí está en el flujo de inventario de entregas:

- En la entrega `ENT-0001`, el producto `Agua natural 1L.` tuvo:
  - Entrada de conteo físico: `+100` a `Almacén Principal`.
  - Surtido de entrega: `-100` desde `Almacén Principal`.
  - Entrega al cliente: `-100` desde `Ruta Andrey`.
- Falta el movimiento intermedio correcto de carga a ruta:
  - Debió aparecer `+100` en `Ruta Andrey` al cargar la entrega.
- Por eso hoy queda mal:
  - `Almacén Principal`: stock real `100`, pero Kardex `0`.
  - `Ruta Andrey`: stock real `-100`, Kardex `-100`.
  - Lo esperado después de surtir, cargar y entregar era stock `0` y Kardex `0`.

## Causa raíz

La función de base de datos `apply_entrega_cargado_inventory()` sí debería crear la entrada a la ruta cuando la entrega pasa a `cargado`, pero el cambio a `cargado` ocurrió antes de la versión corregida del trigger o no generó el movimiento `entrega_cargado` para esa entrega.

Luego, cuando marqué la entrega como `hecho`, el trigger `apply_entrega_hecho_inventory()` descontó correctamente de `Ruta Andrey`, pero como nunca existió la entrada previa a esa ruta, la ruta quedó en negativo.

Además, el arreglo anterior que marca pedido/entrega como entregado arregló el estado, pero no reparó este caso histórico de carga faltante.

## Plan de corrección

1. Reparar los datos de `ENT-0001`
   - Insertar los movimientos faltantes `entrega_cargado` para sus líneas:
     - `+100` Agua natural 1L. a `Ruta Andrey`.
     - `+100` Coca-Cola 2L a `Ruta Andrey`.
   - Ajustar `stock_almacen` para que:
     - `Almacén Principal` baje de `100` a `0` para esos productos.
     - `Ruta Andrey` suba de `-100` a `0` para esos productos.
   - Confirmar con consulta que stock real y Kardex coincidan en ambos almacenes.

2. Blindar el trigger de carga para que no vuelva a pasar
   - Reescribir `apply_entrega_cargado_inventory()` para que sea idempotente por producto y entrega.
   - Si ya existe la salida de surtido `referencia_tipo='entrega'`, no volverá a descontar del origen, pero sí garantizará la entrada a la ruta.
   - Si falta el movimiento de carga, podrá crearlo sin duplicar salidas.
   - En reversas, solo revertirá movimientos `entrega_cargado`, no tocará los movimientos antiguos de surtido.

3. Evitar dobles descuentos al marcar entregado
   - Ajustar `apply_entrega_hecho_inventory()` para detectar mejor los casos donde ya existe un descuento previo real desde la ruta y no duplicarlo.
   - Mantener el descuento normal desde la ruta cuando sí hubo carga previa.

4. Agregar reparación automática para entregas ya cargadas o hechas con carga faltante
   - Crear una función de mantenimiento segura que reconstruya únicamente la entrada faltante a ruta cuando:
     - La entrega tiene líneas surtidas.
     - Existe salida de surtido desde origen.
     - No existe entrada `entrega_cargado` a la ruta.
   - Ejecutarla para la empresa demo y revisar si hay más casos iguales.

5. Verificación final
   - Consultar Kardex vs stock real por producto/almacén.
   - Confirmar específicamente que `Agua natural 1L.` quede:
     - `Almacén Principal`: stock `0`, Kardex `0`.
     - `Ruta Andrey`: stock `0`, Kardex `0`.
   - Revisar también `Coca-Cola 2L`, porque aparece en la misma entrega y presenta el mismo patrón.

## Detalles técnicos

- Los cambios estructurales se harán con migración porque son funciones/triggers de base de datos.
- La corrección de datos se hará con operación de datos, no con migración de esquema.
- No se tocará inventario desde frontend: se mantiene la regla de que inventario es autoridad de base de datos.