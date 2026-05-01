## Política de cobro Rutapp (definitiva)

Aplicar este modelo a TODAS las suscripciones (Stripe y manuales/OpenPay):

| Fecha pago | Periodo cobrado | Monto |
|---|---|---|
| Día 1, 2, 3 o 4 (dentro de gracia) | Mes completo (1 → fin de mes) | Precio mensual completo |
| Día 5 en adelante (fuera de gracia, suspendido) | Días 1-3 (gracia usada) + desde día de pago hasta fin de mes | Prorrateado al precio diario |
| Día 1 del siguiente mes | Se vuelve a generar factura completa, sin importar lo anterior | Precio mensual completo |

Fórmula precio diario = `precio_mensual / días_del_mes`. Cobro tardío = `precio_diario × (3 + días_restantes_desde_hoy_hasta_fin_de_mes)`.

Entre el día 5 y el día que pague: **acceso suspendido** (ya existe). El usuario no usa la app, por eso no se le cobran esos días.

---

## Cambios necesarios

### 1. Arreglar `create-checkout` (cobro al reactivar fuera de gracia)

Hoy: cobra "días de gracia" + Stripe prorratea desde hoy a fin de mes con `proration_behavior: create_prorations` y `billing_cycle_anchor` al 1°. Eso suma de más (caso Salgado: $570 extras).

Cambio: cuando `daysSinceExpiry > GRACE_DAYS`:
- Quitar el `invoiceItem` extra de "3 días de gracia".
- Cambiar a `proration_behavior: "none"` y crear un `invoiceItem` único explícito por:
  `precio_diario × (3 + días_de_hoy_hasta_fin_de_mes)` × cantidad usuarios, con descripción clara: *"Reactivación: 3 días de gracia + uso del DD al fin de mes"*.
- Mantener `billing_cycle_anchor` al próximo 1° → así el siguiente ciclo ya cobra mes completo.
- Cuando esté dentro de gracia (día 1-4): mantener cobro de mes completo, pero también `proration_behavior: "none"` para no duplicar con prorrateo de Stripe. Crear un `invoiceItem` por `precio_completo - prorrateo_de_stripe_cero` = simplemente el mes completo.

Resultado: la primera factura de Stripe será exactamente lo que el usuario debe, sin líneas de proración confusas.

### 2. Arreglar `billing-cycle` (factura mensual del día 1)

Hoy genera siempre el mes completo. Está bien para suscripciones manuales/OpenPay, pero hay que asegurar que:
- Si la suscripción tiene `stripe_subscription_id`, NO crear factura local en `facturas`. Stripe ya emite la factura de renovación vía `invoice.created` y el webhook la sincroniza. Hoy crea ambas y por eso aparece en dos lados.
- Si no hay `stripe_subscription_id` (manual/OpenPay), seguir creando factura local del mes completo.

### 3. Arreglar webhook `stripe-webhook`

Asegurar que cuando llega `invoice.created` / `invoice.finalized` de Stripe:
- Refleja la factura en tabla `facturas` (upsert por `stripe_invoice_id`).
- No duplica con la del job billing-cycle.

### 4. Caso Distribuidora Salgado (acción inmediata)

Editar la factura abierta `in_1TS6IC...`:
- Eliminar la línea de prorrateo extra de $570.
- Dejar solo el cargo del mes completo de mayo = $900 MXN.
- Reenviar al cliente.

### 5. Cupones (ya funcionan, solo verificar)

El sistema de cupones que ya existe (`cupones`, `cupon_usos`, `meses_restantes`) ya aplica correctamente al crear checkout y al generar la factura mensual en `billing-cycle`. Lo único: en el nuevo cálculo prorrateado del punto 1, también aplicar el descuento del cupón al `invoiceItem` único (multiplicar por `1 - descuento/100`).

---

## Resumen de archivos a tocar

- `supabase/functions/create-checkout/index.ts` — reescribir lógica de cobro grace/post-grace con `invoiceItem` único y `proration_behavior: "none"`.
- `supabase/functions/billing-cycle/index.ts` — saltar generación de `facturas` si la sub tiene `stripe_subscription_id` (Stripe ya la emite).
- `supabase/functions/stripe-webhook/index.ts` — verificar upsert correcto en `facturas` desde `invoice.created`.
- Acción manual en Stripe: editar invoice `in_1TS6IC...` de Salgado.

Sin cambios de DB. Sin cambios de UI. Todo es lógica de billing.