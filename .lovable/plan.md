
## Problema

La empresa **Garza** tiene una suscripción con `status='cancelled'`, `acceso_bloqueado=true` y `stripe_subscription_id` previo. Al intentar contratar el **Plan Individual** desde "Mi Suscripción":

1. El precio del Individual ($450) es menor que el precio del plan que tenía registrado (Equipo $900). 
2. `calcUpdateCharge()` calcula `diff = nuevo - actual < 0` → marca `isDowngrade = true` → muestra el toast **"Cambio programado para el siguiente periodo"** y pone `amount = 0`, sin generar factura.
3. Aunque pasara, `handlePayWithCard()` detecta que `subData.stripe_subscription_id` existe e intenta `change_plan` / `update_quantity` sobre una suscripción de Stripe ya cancelada (en lugar de iniciar checkout nuevo vía `select-plan` / `create-checkout`).

Para una empresa **sin cobertura vigente** (cancelada, suspendida, past_due, acceso bloqueado o periodo vencido), no existe un "plan actual" contra el cual comparar: cualquier contratación debe tratarse como **alta nueva** y debe **generar factura completa**.

## Cambios

### `src/pages/MiSuscripcionPage.tsx`

1. **Calcular un flag `isInactiveSubscription`** justo después de leer `subData`:
   - `true` si `subData.status` ∈ `['cancelled','cancelada','suspended','past_due']`, o `acceso_bloqueado === true`, o no hay cobertura futura (`current_period_end`/`fecha_vencimiento` ya pasados y no es manual).
2. **En `calcUpdateCharge()`**: si `isInactiveSubscription`, tratar el escenario como contratación nueva:
   - Ignorar `currentPlan` para el cálculo (no comparar diferencia).
   - Nunca marcar `isDowngrade`.
   - `chargeAmount = newTotalPeriodo` (cobro completo del periodo).
   - Detalle: `fmtBreakdown()` + nota "Contratación nueva — se generará factura".
3. **En `addUpdateToCart()`**: cuando `isInactiveSubscription`, mostrar toast "Plan agregado al pedido" (no "Cambio programado…").
4. **En `handlePayWithCard()` rama `updateItem`**: cuando `isInactiveSubscription`, **forzar la ruta de alta nueva** (`select-plan` → `create-checkout`) aunque exista `stripe_subscription_id`. La suscripción vieja queda como histórica; la nueva genera factura.
5. **Etiqueta de botón / título** del panel de cambios: si `isInactiveSubscription`, mostrar "Contratar plan" en lugar de "Actualizar plan".

### Backend — verificar `select-plan` / `create-trial-checkout`

Confirmar (solo lectura, sin cambios salvo que falte) que `select-plan` permite re-contratar cuando ya existe una fila en `subscriptions` con status cancelado/suspendido: debe **reusar** la fila (`update`), limpiar `acceso_bloqueado`, asociar nuevo `stripe_subscription_id` tras pago, y generar la factura del periodo. Si actualmente bloquea por "ya tiene suscripción", relajar esa condición cuando el estado sea inactivo.

## Resultado esperado

- Garza (y cualquier empresa cancelada/suspendida) ve el plan Individual con cobro completo de **$450 MXN** en el carrito.
- Al pagar, se redirige al checkout de Stripe, se genera la factura correspondiente y la suscripción se reactiva con el nuevo plan.
- Empresas con suscripción **activa** mantienen el comportamiento actual (downgrade programado, prorrateo de upgrade, etc.).

## Fuera de alcance

- No se tocan reglas de mínimos por plan (ya están bien: 1 / 3 / 5).
- No se modifica la lógica de daily-billing ni de facturación recurrente.
