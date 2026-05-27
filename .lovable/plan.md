
# Nuevo flujo de alta con tarjeta obligatoria

## Reglas de negocio

- 7 días de prueba gratis, pero la tarjeta se captura ANTES de entrar.
- Día 8: cobro automático del plan elegido (Mensual / Semestral / Anual). **No reembolsable.**
- Cancelación antes del día 8 → no se cobra nada, cuenta se cierra.
- Cancelación después del cobro → conserva acceso hasta `current_period_end` y luego se desactiva (no se renueva).

## Cambios en el alta (SignupPage)

1. Quitar el texto "Sin tarjeta de crédito".
2. Después de crear la cuenta agregar paso 2: **Selección de plan + captura de tarjeta**.
   - Selector: Mensual / Semestral / Anual (precios desde `subscription_plans`).
   - Casilla obligatoria: *"Acepto que al terminar mis 7 días de prueba se cobrará automáticamente $X a mi tarjeta y que ese primer cargo no es reembolsable."*
   - Botón "Continuar" deshabilitado hasta marcar la casilla.
3. Redirigir a **Stripe Checkout** (`mode: subscription`) con:
   - `payment_method_collection: 'always'`
   - `subscription_data.trial_period_days: 7`
   - `subscription_data.trial_settings.end_behavior.missing_payment_method: 'cancel'`
   - `metadata: { empresa_id, plan_id }`
4. Hasta no completar Checkout (status `trialing` o `active`), el usuario **no entra a la app**. Guard en `AuthContext` redirige a `/completar-registro` si la suscripción está en `pending_payment_method`.

## Cambios en backend (Stripe + DB)

### Migración
- `subscriptions`: agregar
  - `payment_method_id text`
  - `trial_will_charge_at timestamptz` (= `trial_ends_at`, fecha exacta del primer cobro)
  - `cancel_at_period_end boolean default false`
  - `terms_accepted_at timestamptz`
  - Permitir nuevo estado `pending_payment_method`.

### Edge functions
- **`create-checkout`**: aceptar `plan_id`, abrir sesión con trial 7 días, cancelar si no hay método al terminar trial, guardar `terms_accepted_at`.
- **`stripe-webhook`** (extender):
  - `checkout.session.completed` → `status='trialing'`, guarda `stripe_subscription_id`, `trial_will_charge_at`, desbloquea acceso.
  - `customer.subscription.updated` → sincroniza `status`, `current_period_end`, `cancel_at_period_end`.
  - `invoice.paid` → `status='active'`.
  - `customer.subscription.deleted` → `status='canceled'`.
- **`manage-subscription`**: botón "Cancelar" → si está `trialing` ejecuta `subscriptions.cancel()` inmediato (no se cobró nada); si está `active` ejecuta `subscriptions.update(..., { cancel_at_period_end: true })` y mantiene acceso hasta fin del periodo.

## Aviso de fin de prueba

No se agrega nada nuevo. **Reutilizar el aviso existente de "tu periodo de prueba está por terminar"** y ajustar su redacción para los que ya tienen tarjeta activa:

> "Tu prueba termina el DD/MM/YYYY. Ese día se cobrará automáticamente $X a tu tarjeta y comenzará tu mes de servicio. Si no quieres continuar, puedes cancelar desde tu panel antes de esa fecha."

Editar la(s) plantilla(s) de correo/WhatsApp que ya usa el cron `daily-billing` / `billing-notify` para incluir el monto y la fecha de cargo cuando `payment_method_id IS NOT NULL`. Si no hay tarjeta, queda el texto actual.

## Cambios en Dashboard

- Componente nuevo **`TrialCountdownBanner`** visible para `status='trialing'`:
  - "Te quedan **X días** de prueba. Se cobrará **$Y** el **DD/MM/YYYY**."
  - Botón **"Cancelar suscripción"** siempre visible (también en `active`), abre modal de confirmación → llama `manage-subscription`.
- En `MiSuscripcionPage` / `SubscriptionCard`: mostrar fecha exacta del próximo cobro, estado de cancelación programada y permitir reactivar antes del fin del periodo (`cancel_at_period_end=false`).

## Texto legal del checkbox

> "Inicio mis 7 días de prueba gratis. Entiendo que el **DD/MM/YYYY** se cobrará automáticamente **$X MXN** a mi tarjeta por el plan {Mensual/Semestral/Anual} y que **ese primer cargo no es reembolsable**. Puedo cancelar en cualquier momento desde mi panel; si cancelo después del cobro conservo el acceso hasta el final del periodo pagado."

## Migración de cuentas existentes

- Trials actuales sin tarjeta: banner pidiendo capturar tarjeta para continuar al terminar su prueba; no se cortan retroactivamente pero no podrán seguir sin tarjeta al vencer.
- Cuentas `active` actuales: sin cambio.

## Detalles técnicos

- `trial_settings.end_behavior.missing_payment_method = 'cancel'` ya impide entrar sin tarjeta; aun así forzamos captura en Checkout.
- El webhook es la **fuente de verdad** del estado; nunca confiar en el cliente.
- Idempotencia por `event.id` (ya implementada en `stripe-webhook`).

## Archivos a tocar

- `src/pages/SignupPage.tsx`
- `src/pages/CompletarRegistroPage.tsx` (nueva) + ruta en `App.tsx`
- `src/components/TrialCountdownBanner.tsx` (nueva), montada en `DashboardPage.tsx`
- `src/pages/MiSuscripcionPage.tsx`, `src/components/SubscriptionCard.tsx`
- Guard en `AuthContext` para bloquear acceso sin tarjeta
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/manage-subscription/index.ts`
- `supabase/functions/billing-notify/index.ts` (sólo ajustar texto cuando hay tarjeta)
- Nueva migración con las columnas de `subscriptions`
