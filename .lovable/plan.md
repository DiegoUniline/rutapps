# PED-2080: por qué no se descontó la promo (y cómo evitarlo)

## Diagnóstico confirmado

PED-2080 (Distribuidora Tampico, Lic. 43129204, pedido de hoy, status confirmado, total $1,009.97).

Líneas del pedido:
- ALCOHOL ETILICO 36 × $11.53
- VASO CLINICO C12 1 × $75.00
- VUALA CHOCOLATE 5 × $104.00

Promos que aplican a estos productos:
1. **ALCOHOL-PRECIO ESPECIAL POR CAJA** (precio especial $11.527 con 36+) — **SÍ se aplicó**: hay registro en `promocion_aplicada` por $53.03 y la línea ya quedó a $11.53 (de $13.00). Esta funcionó bien.
2. **VUALA SORP+PAS** (por cada 1 VUALA CHOCOLATE/otros, 1 **VUALA PASTELITO** gratis) — **no se aplicó**.

Causa: el motor de promociones sólo puede descontar un "producto gratis" **si ese producto está capturado como línea del pedido**. En PED-2080 **VUALA PASTELITO no está en el pedido**, así que no hay nada que descontar. No es un error de cálculo ni de la corrección anterior: es captura incompleta del vendedor.

Además existe otra promo del mismo grupo, **CAJA VUALA+16PAST** (10+ disparadores → 16 pastelitos), que tampoco alcanzaba con 5 unidades.

## Por qué no lo avisó el sistema

Ya existe la función `getPendingProductoGratis`, que detecta exactamente este caso (disparador presente, regalo ausente) y el componente `PromoPendingAlert`. Pero hoy **sólo está conectada en el Punto de Venta** (`src/pages/PuntoVentaPage.tsx`). No está en:
- Ruta móvil (venta/pedido del vendedor)
- Formulario de venta/pedido de escritorio

PED-2080 se capturó fuera del POS, por eso nadie vio el aviso.

## Propuesta

### 1. Mostrar el aviso donde falta (mismo componente, sin lógica nueva)
- Ruta móvil: mostrar `PromoPendingAlert` en la pantalla de productos/carrito, con el texto "Agrega N × VUALA PASTELITO para aplicar VUALA SORP+PAS".
- Formulario de venta/pedido de escritorio: mismo aviso arriba de las líneas.

### 2. Botón "Agregar producto gratis"
En el aviso, un botón que agregue la línea del producto de regalo con la cantidad faltante, usando el mismo flujo de alta de línea que ya existe (precio de lista normal; el descuento lo calcula el motor como siempre). Sujeto a las reglas de stock/almacén vigentes.

### 3. Sin tocar el motor ni datos históricos
No se cambia `evaluatePromociones`, ni precios, ni impuestos, ni prorrateo. PED-2080 no se corrige por SQL: el cliente no se llevó los pastelitos, así que el total actual es correcto. Si el cliente sí se los llevó, la vía es editar el pedido y agregar la línea.

## Notas técnicas
- Reusar `getPendingProductoGratis` y `PromoPendingAlert` tal cual.
- Puntos de montaje: `src/pages/VentaForm/` (paso de productos) y el flujo de venta en ruta (`useRutaVenta` + su pantalla de carrito).
- El aviso se recalcula con el mismo `cartForPromo` que ya se arma para evaluar promos, así que no hay queries adicionales.
