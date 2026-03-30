

# Plan: Respetar "Vender sin stock" en todos los flujos de venta

## Problema

El campo `vender_sin_stock` del producto solo se respeta en el **Punto de Venta (POS)**. En la **venta móvil de ruta** se ignora completamente: productos con esta bandera activada no aparecen en el catálogo si no tienen stock, y no se pueden agregar más allá del stock disponible.

## Lugares a corregir

### 1. Venta móvil — `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts`

**3 cambios:**

- **`productosDisponibles` (línea ~156):** Actualmente filtra productos sin stock. Agregar excepción: si `p.vender_sin_stock === true`, incluirlo siempre aunque tenga stock 0.

- **`getMaxQty` (línea ~173):** Actualmente retorna el stock real. Si el producto tiene `vender_sin_stock`, retornar `Infinity`.

- **`addToCart` (línea ~185):** El mensaje "Sin stock a bordo" se muestra cuando `maxQty < 1`. Con el cambio en `getMaxQty`, esto se resuelve automáticamente.

### 2. Entregas — `src/hooks/useEntregas.ts` y `src/pages/EntregaListPage.tsx`

- Al surtir entregas, la validación de stock debe omitirse para productos con `vender_sin_stock`. Se necesita consultar el campo del producto antes de bloquear.

### 3. Traspasos — `src/pages/TraspasoFormPage.tsx`

- La validación de stock en origen debe respetar `vender_sin_stock` (si el producto lo permite, no bloquear el traspaso).

## Detalle técnico

El campo `vender_sin_stock` ya se incluye en la query de productos offline (`offlineSync.ts`), así que los datos ya están disponibles en el flujo móvil sin cambios adicionales.

Cambio principal en `useRutaVenta.ts`:
```text
productosDisponibles:
  - Agregar: || p.vender_sin_stock al filtro de cada rama

getMaxQty:
  - Agregar al inicio: 
    const prod = productos?.find(p => p.id === productoId);
    if (prod?.vender_sin_stock) return Infinity;
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts` | Respetar `vender_sin_stock` en filtro de disponibles, `getMaxQty`, y mensajes de error |
| `src/hooks/useEntregas.ts` | Omitir validación de stock si producto tiene `vender_sin_stock` |
| `src/pages/EntregaListPage.tsx` | Ídem |
| `src/pages/TraspasoFormPage.tsx` | Ídem en validación de stock origen |

