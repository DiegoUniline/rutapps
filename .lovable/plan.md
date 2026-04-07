

## Plan: Bloquear "A borrador" en ventas entregadas

### Regla de negocio
Una venta que ya fue entregada (`entregado`, `facturado`) **no puede volver a borrador**. Solo puede **cancelarse**, y la cancelación ya restaura el stock vía el trigger `restore_cancelled_sale_inventory`.

### Cambios

**1. `src/components/venta/VentaFormHeader.tsx` (Desktop)**
- Cambiar la condición del botón "A borrador" de:
  `status !== 'cancelado' && status !== 'borrador'`
  a:
  `status === 'confirmado'`
- Es decir, solo ventas en estado **confirmado** pueden volver a borrador. Entregadas, facturadas, etc. no.

**2. `src/pages/ruta/RutaVentaDetalle/DetalleView.tsx` (Mobile)**
- Línea ~91-92: Cambiar la condición que muestra "A borrador" de:
  `venta.status !== 'cancelado'`
  a:
  `venta.status === 'confirmado'`
- Línea ~185-186: Aplicar la misma restricción al botón inferior "A borrador".

**3. `src/pages/VentaForm/useVentaForm.ts` (Backend guard)**
- En el handler de `newStatus === 'borrador'` (~línea 497), agregar validación:
  ```
  if (['entregado','facturado'].includes(form.status)) {
    toast.error('Una venta entregada no puede volver a borrador, solo cancelar');
    return;
  }
  ```

**4. `src/pages/ruta/RutaVentaDetalle/useVentaDetalle.ts` (Backend guard mobile)**
- Agregar la misma validación en la función `handleVolverBorrador`.

### Resultado
- Ventas en `confirmado` → pueden ir a borrador o cancelarse
- Ventas en `entregado` / `facturado` → solo pueden cancelarse (y el trigger restaura stock)
- Ventas en `borrador` → pueden editarse libremente
- Ventas en `cancelado` → no tienen acciones de estado

