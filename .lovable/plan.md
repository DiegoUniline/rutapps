# Unificar ticket impreso de "Nueva venta" con el de "Detalle de venta"

## Problema

El ticket impreso desde `/ruta/ventas/nueva` (al terminar una venta) no coincide con el impreso desde `/ruta/ventas/:id` (detalle). Ambas rutas ya usan `printTicket(td)` de `src/lib/printTicketUtil.ts`, así que el HTML/ESC-POS base es el mismo. Las diferencias vienen de **cómo se arma el `TicketData`** y del **ancho por defecto**.

## Diferencias detectadas

| Campo | Detalle (`useVentaDetalle.getTicketData`) | Nueva venta (`RutaNuevaVenta.handlePrintTicket`) |
|---|---|---|
| `ticketAncho` default | `empresa.ticket_ancho ?? '58'` | `empresa.ticket_ancho ?? '80'` |
| `fecha` | `fmtDate(venta.fecha)` (DD/MM/YYYY) | `ticketInfo.fecha` crudo |
| `descuento` | `venta.descuento_total ?? 0` | ausente |
| `devoluciones` | array completo desde BD | ausente en `printTicket` (sí está en pantalla) |
| `saldoNuevo` | `saldoAnterior + saldoPendiente` cuando > 0, si no `undefined` | fórmula distinta que suma condicional |
| `pagos[].referencia` | incluido | ausente |
| líneas | `descuento_pct` desde `descuento_porcentaje` | siempre `0` |

## Cambios (solo `src/pages/ruta/RutaNuevaVenta/index.tsx`)

Modificar únicamente `handlePrintTicket` (la vista `TicketVenta` en pantalla no se toca):

1. Cambiar el default de `ticketAncho` de `'80'` a `'58'` para el ticket impreso (mantener `'80'` solo si `empresa.ticket_ancho` así lo indica).
2. Formatear `fecha` con `fmtDate(...)` igual que detalle.
3. Añadir `descuento: h.totals.descuentoDevolucion ?? 0` y `devoluciones` mapeando `h.devoluciones` con la misma forma que detalle.
4. Recalcular `saldoNuevo` con la misma regla: `(saldoAnterior + saldoRestanteDeEstaVenta) > 0 ? esa suma : undefined`.
5. Añadir `referencia` a cada `pago`.
6. En las líneas, mantener el resto pero dejarlas listas para incluir `descuento_pct` si en el futuro se agrega (por ahora sigue en 0, aquí no hay descuentos por línea manuales).

Nada más se toca: ni la UI de `TicketVenta` en pantalla, ni la lógica de guardado, ni los cálculos de totales, ni los otros pasos del wizard.

## Cómo verificar

1. Terminar una venta desde `/ruta/ventas/nueva` → botón "Imprimir" → el ticket impreso/PDF debe tener el mismo layout, ancho y bloques (Saldo Anterior/Nuevo, devoluciones, pagos con referencia, descuento) que el que sale desde `/ruta/ventas/:id` → "Imprimir".
2. La pantalla verde de éxito (`TicketVenta`) sigue viéndose igual — no se modifica.
