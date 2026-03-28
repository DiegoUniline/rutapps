

## Plan: Mostrar promo debajo de cada producto afectado

### Cambio conceptual
Actualmente las promociones se muestran en una sección separada al final. El cambio es moverlas **debajo de cada línea de producto afectada**, tanto en el ticket HTML (impresión/WhatsApp), el ticket visual (TicketVenta.tsx), y el PDF (pedidoPdf.ts).

### Estructura de datos
`TicketPromo` ya tiene `descripcion` y `descuento`, pero necesita `producto_id` para vincularla a la línea correcta. Se agregará `producto_id?: string` a `TicketPromo` y `TicketLinea` (para hacer match).

### Archivos a modificar

**1. `src/lib/ticketHtml.ts`**
- Agregar `producto_id` a `TicketLinea` y `TicketPromo`
- En el loop de líneas, después de la línea de detalle (`c/u + IVA`), buscar promos que coincidan por `producto_id` y agregar una línea tipo `  *3x2 -$15.00`
- Eliminar la sección separada "PROMOCIONES" al final
- Mantener línea de "Ahorro total" después de los totales si hay promos

**2. `src/components/ruta/TicketVenta.tsx`**
- Agregar `producto_id` a la interfaz de `lineas` y `promociones`
- Dentro del map de productos, filtrar `promociones` por `producto_id` y mostrar debajo del precio unitario: `🏷️ 3x2 -$15.00` en texto primary pequeño
- Eliminar la sección separada de "Promociones"
- Agregar línea de ahorro total en la zona de totales

**3. `src/lib/pedidoPdf.ts`**
- Agregar `producto_id` a las interfaces de líneas y promos
- En la tabla de productos, después de cada fila que tenga promo, insertar una sub-fila con la descripción de la promo y el descuento (texto verde, sin código)
- Eliminar la sección separada "Promociones aplicadas"
- Mantener el ahorro total en el bloque de totales

**4. `src/lib/printTicketUtil.ts`**
- Pasar `producto_id` en el mapeo de `buildTicketDataFromVenta` tanto en líneas como en promociones

**5. `src/pages/PuntoVentaPage.tsx`**
- Asegurar que al construir `promoDetails` para el ticket se incluya `producto_id`

**6. `src/pages/VentaForm/index.tsx` y `VentaPdfHandler.ts`**
- Pasar `producto_id` en los datos de promociones al generar PDF y tickets

### Ejemplo visual en ticket HTML (monospace)
```text
3x Coca Cola 600ml        $45.00
  $15.00c/u
  *3x2              -$15.00
1x Pepsi 600ml            $12.00
  $12.00c/u
--------------------------------
Subtotal                  $57.00
Ahorro promos            -$15.00
TOTAL                     $42.00
```

### Ejemplo visual en ticket React
Debajo de cada producto con promo:
```
3x Coca Cola 600ml         $45.00
  $15.00 c/u
  🏷️ 3x2                  -$15.00
```

