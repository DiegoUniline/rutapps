

## Plan: Mejorar modal de cobro en POS

### Problemas actuales
1. No se ve el descuento por producto en el cart (las promos se muestran separadas del producto)
2. Modal de pago es angosto y los métodos van verticales
3. Falta botón "Monto exacto" en efectivo
4. Falta botón rápido "Exacto" en transferencia/tarjeta para auto-llenar el restante

### Cambios en `src/pages/PuntoVentaPage.tsx`

**1. Descuento visible por producto en el carrito**
- En cada línea del cart, cruzar con `promoResults` por `producto_id`
- Si hay promo aplicada, mostrar debajo del precio una etiqueta con el descuento: ej. "🏷️ 3x2 -$15.00" en texto primary/small
- El total de línea se mantiene sin descuento (el descuento se aplica global), pero el usuario ve qué productos tienen promo

**2. Modal más ancho + métodos horizontales**
- Cambiar `max-w-lg` → `max-w-2xl` en el modal de pago
- Poner los 3 métodos (Efectivo, Transferencia, Tarjeta) en un `grid grid-cols-3 gap-3` horizontal en lugar de apilados verticalmente
- Cada método: icono + label + input de monto + referencia (si aplica) + botones rápidos

**3. Botón "Exacto" en efectivo**
- Agregar un botón "Exacto" a los `quickAmounts` del efectivo que pone el total exacto pendiente

**4. Botón "Exacto" en transferencia y tarjeta**
- Agregar un botón "Monto exacto" debajo del input de transferencia y tarjeta
- Al hacer clic, calcula el restante (total - lo ya ingresado en otros métodos) y lo pone automáticamente

### Detalle técnico

```text
┌──────────────────────────────────────────────────────┐
│  Cobrar                                    X         │
│  Público general · 3 artículos        $44.64         │
│  ────────────────────────────────────────────         │
│  [  Contado  ] [  Crédito  ]                         │
│  ────────────────────────────────────────────         │
│  ┌─ Efectivo ──┐ ┌─ Transfer. ─┐ ┌─ Tarjeta ──┐     │
│  │ $ [44.64]   │ │ $ [0.00]    │ │ $ [0.00]   │     │
│  │ $44 $50 $100│ │ [Exacto]    │ │ [Exacto]   │     │
│  │ [Exacto]    │ │ Ref: ____   │ │ Ref: ____  │     │
│  └─────────────┘ └─────────────┘ └────────────┘     │
│  Cambio: $5.36                                       │
│  ═══════════════════════════════════════════          │
│  [        ✓ Confirmar $44.64              ]          │
└──────────────────────────────────────────────────────┘
```

### Archivos a modificar
- `src/pages/PuntoVentaPage.tsx` — único archivo

