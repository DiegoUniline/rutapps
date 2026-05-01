## Análisis de causa raíz

El checkout de Stripe le muestra **$0** a Inversiones Salgado (y a cualquier empresa que reactive fuera del día 1) en lugar del cobro real (~900 MXN o el equivalente en su moneda).

### Por qué pasa

En `supabase/functions/create-checkout/index.ts` la sesión se crea con:

```
mode: "subscription"
line_items: [{ price: price_id, quantity }]      // suscripción mensual ($300 × 3 = $900)
subscription_data: {
  billing_cycle_anchor: <próximo día 1>,         // ancla la suscripción al 1° del mes siguiente
  proration_behavior: "none",                    // NO prorratea
}
```

Combinación venenosa: cuando `billing_cycle_anchor` es futuro y `proration_behavior` es `"none"`, **Stripe NO cobra nada en el primer checkout** por el line_item de la suscripción. La suscripción simplemente queda activa y empieza a cobrar el día del ancla. Por eso el resumen del checkout dice **GTQ/MXN 0.00 vence hoy**.

Para resolverlo, el intento previo añadió un `stripe.invoiceItems.create()` separado por el monto del primer periodo (días de gracia + uso del mes). Eso tampoco funciona en Checkout: un invoice item suelto no se adjunta a la sesión de Checkout — solo aparece en la siguiente factura recurrente. Resultado: el cliente ve $0 ahora y el cargo se intenta el día 1.

Mi último intento usó `subscription_data.add_invoice_items`, pero los logs muestran:

```
Received unknown parameter: subscription_data[add_invoice_items]
```

Stripe Checkout **no soporta** ese campo en `subscription_data` (sí existe en la API directa de `subscriptions.create`, pero no en sesiones de Checkout). Por eso falló el deploy y volvió al estado anterior con $0.

### Qué sí funciona en Stripe Checkout

`line_items` acepta múltiples ítems mezclando un precio recurrente con uno o varios precios **one-shot** (no recurrentes). Stripe los suma en el resumen y los cobra inmediatamente al confirmar el pago. Esa es la única forma compatible con `mode: "subscription"` para cobrar un monto adicional en el checkout inicial.

## Solución

Reescribir la lógica de `create-checkout` para que el primer cobro (mes completo o prorrateo de reactivación) viaje como un **`line_item` one-shot** dentro de la misma sesión, en la moneda correcta del plan, en lugar de como `invoiceItem` o `add_invoice_items`.

### Cambios en `supabase/functions/create-checkout/index.ts`

1. **Validar `monthlyPriceCentavos > 0` antes de continuar.** Si la lectura del Price de Stripe falla, abortar con error 400 en lugar de seguir con `0` y emitir un checkout fantasma. Cero tolerancia al fallback de $300 silencioso.

2. **Obtener moneda del plan desde Stripe** (`stripePrice.currency`) y usarla en todos los precios derivados, en lugar de hardcodear `"mxn"`. Así si el plan es MXN, el cobro adicional también es MXN; si algún día se agrega un plan en otra moneda, no se rompe.

3. **Quitar** la creación de `stripe.invoiceItems.create(...)` y el bloque `add_invoice_items`.

4. **Crear un Price one-shot inline** (no recurrente) por el monto del primer periodo y agregarlo como segundo `line_item` de la sesión:

   ```ts
   const oneShotPrice = await stripe.prices.create({
     currency: planCurrency,            // misma del plan
     unit_amount: firstChargePerUserCentavos,
     product_data: { name: firstChargeDescription },
     // sin "recurring" => one-shot
   });

   line_items: [
     { price: price_id, quantity },          // suscripción recurrente (cobrará el día 1)
     { price: oneShotPrice.id, quantity },   // cargo del primer periodo (se cobra HOY)
   ]
   ```

5. **Mantener** `billing_cycle_anchor: nextFirst` y `proration_behavior: "none"` para que la suscripción recurrente arranque a cobrar el día 1° del mes siguiente sin doble cobro.

6. **Quitar** `currency: "mxn"` y `customer_update` del top-level de la sesión: con dos `line_items` que ya tienen su moneda definida, Stripe la infiere correctamente y `customer_update` no es necesario aquí.

7. **Compatibilidad con descuentos:** los `discounts` actuales aplican porcentaje sobre todos los line_items elegibles, lo que está bien porque el cargo prorrateado también debe llevar el descuento de la empresa/cupón.

### Lógica del monto (sin cambios, solo recordatorio)

- Dentro de gracia (≤3 días vencido): cargo = mes completo (`monthlyPriceCentavos × quantity`).
- Fuera de gracia: cargo = `(3 días gracia + días restantes del mes) × tarifa diaria × quantity`.
- El día 1° del mes siguiente Stripe cobra automáticamente el ciclo recurrente normal.

### Verificación post-deploy

1. Reabrir el checkout desde el panel de suscripción de Inversiones Salgado.
2. Confirmar que el resumen ya **no diga $0** y muestre el monto del primer periodo + nota de "Luego $X/mes a partir del 1°".
3. Revisar logs de `create-checkout` para confirmar que no haya errores de Stripe.
4. Confirmar con un pago de prueba (o esperar al pago real) que la factura inicial cobra el monto esperado y la suscripción queda activa con anchor al día 1.

### Archivos afectados

- `supabase/functions/create-checkout/index.ts` (única edición)
- Redeploy automático del edge function
