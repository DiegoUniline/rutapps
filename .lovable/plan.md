## Bug confirmado

En `apply_entrega_cargado_inventory()` el bloque de reversión se dispara cuando una entrega pasa de `cargado` a **cualquier otro estado**, incluyendo `hecho`. Esto:

1. Borra el movimiento `entrega_cargado` (+N a la ruta) del kardex.
2. Resta N del stock del almacén de la ruta.

Inmediatamente después, `apply_entrega_hecho_inventory()` aplica el descuento normal de la entrega (-N de la ruta). Resultado neto: la ruta queda en **-N** y el kardex sólo muestra la salida `entrega_hecho`, exactamente como Coca-Cola 600ml (-50) en Ruta Andrey.

`cargado → hecho` no es una reversión, es la continuación natural del flujo. La carga ya está consumida por la entrega, no debe deshacerse.

## Plan de corrección

### 1. Arreglar el trigger `apply_entrega_cargado_inventory`
- La condición de reversión debe excluir la transición a `hecho`.
- Sólo revertir cuando `NEW.status` sea un estado "hacia atrás" (`pendiente`, `borrador`, `cancelado`, `no_entregado`, etc.), no cuando avanza a `hecho`.
- Cambio mínimo: `IF OLD.status='cargado' AND NEW.status NOT IN ('cargado','hecho') THEN ...`.

### 2. Reparar datos históricos afectados por el bug
Detectar entregas con status `hecho` donde:
- Existen líneas con `cantidad_entregada > 0`.
- **No existe** movimiento `entrega_cargado` para esa entrega (fue borrado por la reversión bug).
- **Sí existe** movimiento `entrega_hecho` (salida desde la ruta).

Para cada caso:
- Insertar el movimiento `entrega_cargado` faltante (+cantidad a la ruta, salida del almacén origen) con nota "Reparación: carga restaurada".
- Ajustar `stock_almacen`:
  - Sumar la cantidad al almacén de la ruta (corrige el negativo).
  - Restar la cantidad del almacén origen (corrige la doble alta que dejó la reversión bug).
- Hacer esto **por entrega/producto** para no tocar casos sanos.

### 3. Verificación específica
Confirmar para Distribuidora MG:
- Coca-Cola 600ml en Ruta Andrey: stock = 0, kardex = 0 (con líneas `entrega_cargado +50` y `entrega_hecho -50`).
- Recorrer el resto de productos de la empresa para asegurar que el descuadre Stock vs Kardex que vimos antes desaparece (o se reduce sólo a casos no relacionados con este bug).

### 4. Salvaguarda futura
Agregar también una protección: si al pasar a `hecho` no existe el movimiento `entrega_cargado` previo y la entrega tiene `vendedor_destino_id` distinto del `almacen_origen`, generar el `entrega_cargado` de respaldo dentro de `apply_entrega_hecho_inventory` para que el kardex de la ruta siempre tenga el par entrada+salida.

## Detalles técnicos

- Todo va en **una migración SQL** (CREATE OR REPLACE FUNCTION + script de reparación de datos en el mismo archivo, ejecutado una sola vez vía bloque `DO $$ ... $$`).
- No se toca código de frontend: el inventario sigue siendo autoridad de la BD.
- La reparación es idempotente: filtra por entregas que cumplen el patrón exacto del bug.
