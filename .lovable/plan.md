

## Plan: Agregar promociones al ticket impreso (ESC/POS + verificar HTML)

### Problema raíz
El archivo `src/lib/escpos.ts` (usado para impresión Bluetooth y potencialmente desktop) **no tiene ningún código para mostrar promociones**. El loop de productos (líneas 247-259) solo imprime nombre, precio y detalle c/u, pero nunca busca las promos asociadas ni muestra "Ahorro promos" en totales.

El path HTML (`ticketHtml.ts`) sí tiene el código en línea 148, pero la ruta ESC/POS lo omite completamente.

### Archivos a modificar

**1. `src/lib/escpos.ts`** — Cambio principal
- En el loop de productos (línea 247-259), después de la línea de detalle `c/u`, filtrar `data.promociones` por `producto_id` y agregar sub-líneas con el descuento:
  ```
  *3x2              -$15.00
  ```
- Después del TOTAL (línea 271), agregar línea "Ahorro promos" con el total de descuentos si hay promociones

**2. `src/lib/ticketHtml.ts`** — Solo verificación
- El código ya existe en línea 148, solo confirmar que funciona correctamente (ya está implementado)

### Detalle técnico ESC/POS

Después de la línea de detalle de cada producto:
```typescript
// Per-product promotions
const linePromos = (data.promociones ?? []).filter(p => p.producto_id && p.producto_id === l.producto_id);
for (const lp of linePromos) {
  ln(row(`  *${clean(lp.descripcion)}`, `-${fmt(lp.descuento)}`, W));
}
```

Después del TOTAL:
```typescript
if (data.promociones && data.promociones.length > 0) {
  const totalPromo = data.promociones.reduce((s, p) => s + p.descuento, 0);
  if (totalPromo > 0) {
    ln(row('Ahorro promos', `-${fmt(totalPromo)}`, W));
  }
}
```

