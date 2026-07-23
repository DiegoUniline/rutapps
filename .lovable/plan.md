## Diagnóstico confirmado

Al seleccionar **Lista General $68.00** la línea se queda en $5,000 / $5,800. Dos causas verificadas leyendo el código:

1. `changeLineListaPrecio` en `src/pages/VentaForm/useVentaForm.ts` re-resuelve el precio con `tarifaRules` (reglas de la tarifa global del formulario). Si la lista elegida pertenece a otra tarifa o esas reglas no están en ese query, `resolveProductPricing` cae al fallback y usa `producto.precio_principal = $5,000` → $5,800 con IVA. El snapshot correcto que ya calculó `ListaPrecioPicker` se descarta.
2. El `useEffect` de reprecificación (líneas 354–389) itera todas las líneas y vuelve a resolver con `form.lista_precio_id` + `tarifaRules` globales, pisando la lista específica que el usuario acaba de fijar en la línea.

## Cambios (alcance mínimo)

### 1. `src/components/venta/ListaPrecioPicker.tsx`
- Ampliar la firma de `onSelectLista` para enviar el snapshot completo ya calculado (`unitPrice`, `displayPrice`, `rawUnitPrice`, `rawDisplayPrice`, `basePrecio`, `redondeo`, `tarifaId`, `listaPrecioNombre`). Los valores ya se computan hoy dentro de `options` vía `resolveProductPricing` + `buildSalePricingSnapshot`; solo hay que exponerlos.
- Guardar en cada `ListaOption` también `rawUnitPrice`, `rawDisplayPrice`, `basePrecio`, `redondeo` provenientes del snapshot y de la regla resuelta.

### 2. `src/pages/VentaForm/useVentaForm.ts` — `changeLineListaPrecio`
- Cambiar firma a `changeLineListaPrecio(idx, selectedPricing)` recibiendo el snapshot completo del picker.
- Reemplazo atómico, sin fallback al valor anterior de la línea:
  - `lista_precio_id = selectedPricing.listaPrecioId`
  - `precio_unitario = selectedPricing.unitPrice`
  - `display_unit_price = selectedPricing.displayPrice`
  - `precio_unitario_sin_redondeo = selectedPricing.rawUnitPrice`
  - `precio_display_sin_redondeo = selectedPricing.rawDisplayPrice`
  - `base_precio = selectedPricing.basePrecio`
  - `redondeo = selectedPricing.redondeo`
  - `precio_manual = false`
  - Si el objeto línea ya tiene `tarifa_id`, asignarlo también (no crear campo nuevo).
- Eliminar la re-resolución con `tarifaRules` globales.

### 3. `src/pages/VentaForm/useVentaForm.ts` — efecto de reprecificación (l. 354–389)
- Antes de reprecificar cada línea:
  - Si `l.lista_precio_id` está definido, **no** aplicar `form.lista_precio_id` ni sobrescribir su snapshot con `tarifaRules` globales.
  - Si no se puede resolver esa lista (reglas no cargadas para su tarifa), conservar la línea tal cual y emitir `console.warn('[line-price-list-unresolved]', { listaPrecioId, tarifaId })`. Nunca degradar a `precio_principal`.
- Solo las líneas sin `lista_precio_id` propia se reprecifican con la lista/tarifa global.

### 4. Callbacks Desktop/Mobile
- `src/pages/VentaForm/VentaLineaDesktop.tsx` y `VentaLineaMobile.tsx`: pasar el snapshot completo recibido del picker a `onChangeLineListaPrecio`. Sin cambios adicionales de UI.

## Fuera de alcance (no se toca)

`priceResolver.ts`, `salePricing.ts`, motor fiscal (IVA/IEPS), descuentos, redondeos, esquema DB, migraciones, ventas históricas, diseño.

## Verificación

- `tsgo --noEmit` en 0.
- En `/ventas/nuevo` con el producto de la captura:
  - Dueños → $5,800 · Lista General → **$68.00** · Lista Mayoreo → $45.94 · Lista General → **$68.00**.
  - Desde Lista General: IVA → $68.00; Sin impuestos → $59.00; IVA → $68.00.
- Subtotal $58.62, IVA $9.38, Total $68.00 en el escenario final.
- Ningún estado intermedio muestra $5,000/$5,800 tras elegir una lista.