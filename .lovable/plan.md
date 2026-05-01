## Diagnóstico

Oscar (Inversiones Salgado, customer `cus_UN4lcSwdjlMTOv`) tiene **dos facturas** de $900 en Stripe:

| Factura | Status | Origen | Acción |
|---------|--------|--------|--------|
| `in_1TSK71CUpJnsv7ilp4O4rHzl` | **paid** ✅ | `subscription_create` (checkout corregido) | Dejar como está |
| `in_1TSIgVCUpJnsv7ilfG6h94vm` (CCO56QMX-0004) | **open** ⚠️ | `manual` (intento previo fallido) | **Anular (void)** |
| 3 facturas más en `draft` ($0) | draft | manual | **Eliminar (delete)** |

La factura "pendiente" que ve Oscar es la huérfana del primer intento (cuando aún se creaba `stripe.invoices.create` manual). La suscripción real (`sub_1TSK75...`) está correcta en `trialing` con su pago de $900 ya cobrado.

## Acciones

1. **Anular factura huérfana en Stripe**
   - `stripe.invoices.voidInvoice("in_1TSIgVCUpJnsv7ilfG6h94vm")` → status pasa a `void`, desaparece del listado de Oscar como pendiente.

2. **Eliminar 3 facturas en `draft` ($0)** que quedaron del intento fallido:
   - `in_1TSIgHCUpJnsv7ilu6nZYHKg`
   - `in_1TSIgFCUpJnsv7ilStwnRYd6`
   - `in_1TSIgDCUpJnsv7ilW5lyC4oF`

3. **Verificar `subscriptions` en BD**: confirmar que `fecha_vencimiento` se actualizó vía webhook (logs muestran `Access granted via checkout` para empresa `dad7a4a0...`, validar que sea Oscar).

4. **Prevención a futuro**: el código actual de `create-checkout` ya NO crea facturas manuales (usa `line_items` one-shot via `stripe.prices.create`). El problema era exclusivo del intento fallido previo. No requiere cambios de código.

## Resultado esperado

- Oscar deja de ver la factura "pendiente" CCO56QMX-0004 en `list-invoices`.
- Solo queda visible la factura pagada de $900.
- Suscripción sigue activa en trial hasta el 1° de junio, cuando Stripe genera la factura mensual normal.
