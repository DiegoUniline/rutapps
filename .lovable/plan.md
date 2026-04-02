

## Plan: POS debe usar la tarifa de la Lista Principal cuando no hay cliente seleccionado

### Problema
En POS, cuando el usuario está como "Público general" (sin cliente seleccionado), `clienteTarifaId` es `null`. Esto hace que **no se carguen reglas de tarifa** y el producto muestra `precio_principal` en vez del precio calculado por la regla.

La ruta móvil (`useRutaVenta.ts` línea 138) ya tiene un fallback: busca la tarifa de tipo `'general'`. POS no tiene esto.

**Datos reales del producto Coca-Cola 2L:**
- Costo: $22, IVA 16%
- La empresa tiene "Lista General" (`es_principal: true`) con tarifa `dc07e82d`
- Esa tarifa tiene una regla específica para este producto: margen 25% sobre costo, sin_impuestos, redondeo cercano
- Cálculo correcto: $22 × 1.25 = $27.50 → + IVA = $31.90 → redondeo = **$32.00**
- Sin reglas (fallback actual): muestra `precio_principal` = $32 (coincide por casualidad, pero no para otros productos)

### Cambios

**1. `src/pages/PuntoVentaPage.tsx` — Cargar tarifa principal de la empresa como fallback**
- Agregar un query para obtener la `lista_precios` donde `es_principal = true` de la empresa
- Usar su `tarifa_id` como fallback cuando `clienteTarifaId` es `null`
- Cambiar: `const effectiveTarifaId = clienteTarifaId || defaultTarifaId;`
- Esto asegura que POS siempre resuelve precios con reglas, igual que la ruta móvil

**2. Verificar que `useVentaForm.ts` (ventas desktop) también tenga el mismo fallback**
- Si no lo tiene, aplicar la misma lógica

### Resultado
- Con o sin cliente seleccionado, POS usa las reglas de la tarifa principal
- El precio mostrado coincide exactamente con Vista Precios de la tarifa

### Archivos a modificar
- `src/pages/PuntoVentaPage.tsx`
- `src/pages/VentaForm/useVentaForm.ts` (verificar/ajustar)

