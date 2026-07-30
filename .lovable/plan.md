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

## Alcance del barrido (datos reales, últimos 2 días, todas las empresas)

- **Distribuidora Tampico (Lic. 43129204)**: 118 ventas con promo de producto gratis,
  **38 con descuento faltante**, **$1,719.50** sin descontar.
- **Dulces Jersey (Lic. 66546670)**: 1 venta con promo, sin faltante.
- Ninguna otra empresa tiene promos activas de "producto gratis" con regalo distinto.

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

### 2. Pruebas antes de publicar
- Test unitario nuevo con el escenario exacto de PED-1894: 3 disparadores, regalo x3 a
  $6.30 → descuento $18.90, total $777.00.
- Casos borde: regalo con menos unidades en carrito que las ganadas (se topa),
  promo acumulable, regalo igual al disparador (comportamiento actual intacto).
- Verificación manual en Distribuidora Tampico con un pedido de prueba antes de liberar.

### 3. Ventas ya emitidas
No se tocan automáticamente. Cuando el motor esté verificado, entrego la lista de las
38 ventas de Tampico con el faltante exacto por folio para que decidas si se corrigen
(total y saldo) o se dejan como están.

## Notas técnicas
- Archivo único de cambio: `src/hooks/usePromociones.ts` (función `evaluatePromociones`).
- El set `appliedNonAcumulable` pasa a registrar solo disparadores; el control del regalo
  se hace con un mapa `promoId|productoRegalo → unidades ya otorgadas`.
- No se modifica base de datos, ni RPC, ni triggers, ni banderas de licencia.
