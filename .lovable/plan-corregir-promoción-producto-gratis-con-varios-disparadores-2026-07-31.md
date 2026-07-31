# Corregir promoción "producto gratis" con varios disparadores

## Qué pasó (causa raíz confirmada)

En el evaluador de promociones (`src/hooks/usePromociones.ts`), cuando una promo de tipo
"producto gratis" NO es acumulable y el regalo es un producto **distinto** al disparador:

1. Se recorre cada línea disparadora del carrito.
2. Al procesar la **primera** línea, se marcan como "ya usados" tanto el producto disparador
   como el **producto de regalo**.
3. El filtro de la siguiente vuelta descarta cualquier línea cuyo producto esté marcado…
   y como el regalo quedó marcado, las **demás líneas disparadoras nunca se evalúan**.

Resultado: por más disparadores que traiga el pedido, solo se descuenta **1 regalo**.

Caso PED-1894 (Distribuidora Tampico, promo "VUALA SORP+PAS": 3 productos disparadores,
1 gratis por cada uno, no acumulable):
- Disparadores presentes: VUALA CAJETA, CHOCOLATE, VAINILLA (1 c/u) → deberían ser 3 regalos.
- Regalo en carrito: VUALA PASTELITO x3 a $6.30.
- Descuento aplicado: $6.30 (1 regalo). Correcto: $18.90.
- Total actual $789.60 → total correcto **$777.00** (faltan $12.60).

Segundo detalle: aunque se evaluaran todas las líneas, no existe un contador global de
unidades de regalo ya consumidas, así que podría irse al otro extremo y regalar más
unidades de las que hay en el carrito.

## Alcance del diagnóstico confirmado

- El defecto está confirmado en el motor común y puede afectar cualquier empresa que use
  una promoción de producto gratis con regalo distinto al disparador.
- En Tampico ya se identificaron pedidos de hoy con descuento incompleto, incluido PED-1894.
- Antes de corregir datos se repetirá el barrido para **hoy, usando la zona horaria de cada
  empresa**, sin limitarlo a Tampico ni asumir que la lista actual es definitiva.

## Qué haremos

### 1. Arreglar el motor (sin cambiar nada más)
En `src/hooks/usePromociones.ts`, dentro del caso `producto_gratis`:
- Dejar de marcar el **producto de regalo** como "ya usado" cuando el regalo es distinto
  del disparador (solo se marca el disparador). Así se evalúan todos los disparadores.
- Agregar un contador por promo+producto de regalo con las unidades de regalo ya
  consumidas, y limitar cada nueva aplicación a `unidades_en_carrito - ya_consumidas`.
  Nunca se regala más de lo que el cliente realmente compró de ese producto.
- Consolidar el resultado en un solo `PromoResult` por promo y producto de regalo
  (una sola línea de descuento en el ticket, no tres), con la suma de unidades gratis.

Sin cambios en tipos de promo distintos, ni en precios, ni en impuestos, ni en el
prorrateo por línea (`promoLinea.ts` sigue igual; recibe el descuento ya correcto).

### 2. Pruebas del motor antes de tocar ventas
- Test unitario nuevo con el escenario exacto de PED-1894: 3 disparadores, regalo x3 a
  $6.30 → descuento $18.90, total $777.00.
- Casos borde: regalo con menos unidades en carrito que las ganadas (se topa),
  promo acumulable, regalo igual al disparador (comportamiento actual intacto).
- Verificación manual en Distribuidora Tampico con un pedido de prueba antes de liberar.

### 3. Corregir las ventas afectadas de hoy en todas las empresas
Solo después de comprobar el motor:
- Barrer todas las ventas y pedidos creados hoy, calculando por folio cuántos regalos
  correspondían, cuántos se descontaron y el faltante exacto.
- Corregir en una operación de base de datos controlada únicamente los registros donde
  el descuento esperado sea mayor al aplicado; no tocar ventas correctas ni días anteriores.
- Actualizar el descuento promocional persistido, los montos netos de las líneas afectadas,
  impuestos, total y saldo pendiente de forma consistente, sin crear cobros, movimientos
  de caja, inventario, entregas ni kardex.
- Conservar el monto ya pagado. El saldo quedará como `máximo(total corregido - pagos
  aplicados, 0)`; si los pagos superan el nuevo total, no se inventará un saldo negativo y
  el excedente se reportará aparte para revisión.
- Registrar antes/después por venta en auditoría para que el barrido sea verificable y
  reversible, y entregar el listado final por empresa y folio con total anterior/correcto.

## Notas técnicas
- Cambio de frontend concentrado en `src/hooks/usePromociones.ts` (función
  `evaluatePromociones`) y su prueba unitaria.
- El set `appliedNonAcumulable` pasa a registrar solo disparadores; el control del regalo
  se hace con un mapa `promoId|productoRegalo → unidades ya otorgadas`.
- La reparación de datos se ejecutará después, separada del cambio del motor, con alcance
  por `empresa_id`, validación multi-tenant y auditoría. No se cambiarán reglas de precio,
  inventario, cobros ni promociones configuradas.
