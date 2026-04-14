

## Diagnóstico

El campo `usa_listas_precio` (boolean) existe en la tabla `productos` y se configura en el formulario de producto (toggle "Precio directo" / "Listas de precio"), pero **ningún módulo de resolución de precios lo consulta**. El resolver siempre aplica las reglas de tarifa si existen, ignorando la preferencia del producto.

Esto causa que productos configurados como "Precio directo" (`usa_listas_precio = false`) reciban precios calculados por reglas de tarifa (ej. margen sobre costo = 0% → precio = costo).

## Solución

### 1. Agregar `usa_listas_precio` a `ProductForPricing` (priceResolver.ts)

Agregar el campo opcional al interface y hacer que `resolveProductPricing` y `resolveProductPrice` lo evalúen **antes** de buscar reglas:

```typescript
// Si usa_listas_precio es false → skip reglas, usar precio_principal directo
if (producto.usa_listas_precio === false) {
  // retornar fallback a precio_principal
}
```

### 2. Pasar `usa_listas_precio` en los callers

Tres puntos donde se construye el objeto `ProductForPricing`:

- **`useVentaForm.ts`** — Ventas escritorio (2 lugares donde construye `pf`)
- **`useRutaVenta.ts`** — Venta móvil (función `getPrice` y `handleSave`)
- **`PuntoVentaPage.tsx`** — POS (si aplica)

En cada uno, agregar `usa_listas_precio: prod.usa_listas_precio` al objeto.

### 3. Actualizar edge function `public-catalog`

En `supabase/functions/public-catalog/index.ts`, el resolver duplicado también debe respetar el campo. Agregar la misma lógica de cortocircuito.

### 4. Tests

Agregar casos en `priceResolver.test.ts`:
- Producto con `usa_listas_precio: false` + reglas existentes → debe usar `precio_principal`
- Producto con `usa_listas_precio: true` + reglas → debe aplicar reglas normalmente

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/priceResolver.ts` | Agregar campo al interface, cortocircuito en `resolveProductPricing` |
| `src/pages/VentaForm/useVentaForm.ts` | Pasar `usa_listas_precio` al construir `ProductForPricing` |
| `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts` | Pasar `usa_listas_precio` al construir `ProductForPricing` |
| `src/pages/PuntoVentaPage.tsx` | Pasar `usa_listas_precio` (si no lo hace ya) |
| `src/lib/salePricing.ts` | Sin cambios (opera post-resolución) |
| `supabase/functions/public-catalog/index.ts` | Agregar cortocircuito en `resolvePrice` |
| `src/test/priceResolver.test.ts` | Nuevos test cases |
| `src/test/fixtures/productos.ts` | Agregar `usa_listas_precio` a fixtures |

### Resultado

- Productos con "Precio directo" → siempre usan `precio_principal`, sin importar qué reglas de tarifa existan
- Productos con "Listas de precio" → comportamiento actual sin cambios
- Consistencia total entre Ventas, Venta Móvil y POS

