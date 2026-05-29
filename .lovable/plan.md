# Corrección: productos no surtidos en vista móvil de Entrega

## Problema

En `RutaEntregaDetalle.tsx`:
- La sección **Productos** muestra todas las `entrega_lineas`, incluidas las que tienen `cantidad_entregada = 0` (no surtidas por falta de stock).
- El **total mostrado y el botón "Cobrar"** usan `venta.total` (total original del pedido), por lo que cobran también el producto no surtido.

El backend y la lógica de inventario son correctos; solo la UI móvil quedó desfasada.

## Cambios (solo frontend, `src/pages/ruta/RutaEntregaDetalle.tsx`)

1. **Filtrar líneas no surtidas en el render de Productos**
   - Definir `lineasSurtidas = lineas.filter(l => (l.cantidad_entregada ?? 0) > 0)`.
   - Reemplazar el `.map` actual (línea 470) y el contador `({lineas.length})` (línea 467) para usar `lineasSurtidas`.
   - Si hay líneas no surtidas, mostrar debajo una nota discreta tipo: *"X producto(s) sin surtir no se incluyen en esta entrega"* (estilo `text-muted-foreground text-[11px]`).

2. **Recalcular el total real entregado**
   - Nuevo `entregaTotal` calculado sumando, por cada línea surtida, `precio_unitario × cantidad_entregada` cruzando con `ventaLineas` por `producto_id` (fallback a `precio_principal` cuando no haya venta).
   - Para impuestos (IVA/IEPS): prorratear desde `venta` proporcionalmente al `entregaTotal` vs `venta.total`, o sumar `iva_monto`/`ieps_monto` de cada `venta_linea` ponderado por `cantidad_entregada / cantidad_pedida`. Usar la segunda opción para precisión por línea.

3. **Usar `entregaTotal` en lugar de `ventaTotal` en la UI**
   - Header con el total grande (línea 434).
   - Bloque "Totales" (línea 504) y subtotales/impuestos prorrateados.
   - Botón "Cobrar" cuando aplique al monto de esta entrega.
   - `getTicketData()` (líneas 256-278): filtrar `ventaLineas` a las que están surtidas en la entrega y ajustar `subtotal/iva/ieps/total` al `entregaTotal` para que el ticket impreso refleje sólo lo cargado.

4. **Saldo de la venta**
   - `ventaSaldo` se sigue calculando desde la venta (el saldo real del pedido lo recalcula el trigger de pagos). No se toca aquí; sólo se ajusta lo que se muestra/cobra para esta entrega específica.

## Fuera de alcance

- No se modifica el backend ni el trigger de entrega (ya corregido en la migración previa).
- No se toca la vista de escritorio (`VentaEntregasTab.tsx`) — el usuario reportó únicamente la vista móvil.
- No se modifican `venta.total` ni `venta.saldo_pendiente`; eso ya es responsabilidad de los triggers cuando aplique.

## Verificación

- Entrega ENT-0795 (Distribuidora MG): la línea con `cantidad_entregada=0` debe desaparecer de "Productos" y el total mostrado/cobrado debe bajar al monto real entregado.
- Entrega con todas las líneas surtidas: comportamiento idéntico al actual.
