

## Plan: Unificar el Precio Final en todo el sistema

### Problema actual
Hay **dos cálculos independientes** del precio final:
1. **Vista Precios** (`TarifaFormPage.tsx`): calcula `precio_final` con lógica inline
2. **priceResolver.ts**: calcula `displayPrice` con lógica similar pero que puede divergir

Cuando POS, Venta Desktop o Venta Móvil resuelven el precio, usan `priceResolver` — pero si hay diferencia matemática mínima (ej. orden de redondeos intermedios), el precio mostrado no coincide con Vista Precios.

### Solución
Hacer que **todos los módulos usen una sola fuente de verdad**: `resolveProductPricing()` de `priceResolver.ts`. Vista Precios también debe usar esta función en vez de calcular por su cuenta.

### Cambios

**1. `src/pages/TarifaFormPage.tsx` — Vista Precios usa `priceResolver`**
- Eliminar la lógica inline de cálculo (líneas ~246-298)
- Importar `resolveProductPricing` y `toDisplayPrice` de `priceResolver.ts`
- Para cada producto con regla, llamar `resolveProductPricing(rules, producto)` y usar su resultado (`displayPrice` = Precio Final, `unitPrice` = Neto)
- Seguir calculando los campos de presentación extra (costo c/imp, ganancia, margen) a partir de los valores devueltos por el resolver
- Resultado: Vista Precios y POS/Venta comparten exactamente la misma matemática

**2. Verificar `src/lib/priceResolver.ts` — `displayPrice` = Precio Final correcto**
- Confirmar que `displayPrice` sigue el flujo: Regla → Neto (si con_impuestos, extraer) → +Impuestos → Redondeo
- Si hay discrepancia con la lógica actual de Vista Precios, ajustar `priceResolver` como fuente de verdad

**3. Tests — Actualizar `src/test/priceResolver.test.ts`**
- Validar que `displayPrice` para reglas `sin_impuestos` y `con_impuestos` coincida con los valores que Vista Precios mostraba antes (ej. costo $22, +25%, redondeo cercano → $32)

### Resultado esperado
- Lo que Vista Precios muestra como "Precio Final" es **exactamente** lo que POS, Venta Desktop y Venta Móvil usan
- Un solo punto de cálculo: `priceResolver.ts`
- Sin duplicación de lógica

### Archivos a modificar
- `src/pages/TarifaFormPage.tsx` (Vista Precios usa priceResolver)
- `src/lib/priceResolver.ts` (verificar/ajustar si necesario)
- `src/test/priceResolver.test.ts` (validar consistencia)

