## Diagnóstico

Revisé la BD, el webhook de Stripe, `billing-cycle` y `MiSuscripcionPage`. **Los períodos en la base de datos están correctos** — el problema es de presentación y un campo desincronizado.

### Datos reales en BD para esta empresa
```
subscriptions.current_period_start = 2026-05-01   ← desactualizado
subscriptions.current_period_end   = 2026-07-01   ← correcto
fecha_vencimiento                  = 2026-07-01   ← correcto

facturas:
 FAC-00001  2026-03-23 → 2026-03-31  (prorrateo, OK)
 FAC-00002  2026-04-01 → 2026-04-30  (OK)
 FAC-00003  2026-05-01 → 2026-05-31  (OK)
 FAC-00004  2026-06-01 → 2026-06-30  (OK, pagada hoy vía Stripe)
```

### Bug 1 — Off-by-one en "Historial de facturas" (TZ shift)
`MiSuscripcionPage.tsx` línea 1052 hace `new Date('2026-06-01')`. JavaScript lo interpreta como UTC medianoche; en hora de México (-6h) se convierte en **31 may 18:00**, y `date-fns/format` lo imprime como "31 may". Por eso ves:
- FAC-00004: "31 may — 29 jun 26"  (debe ser 1 jun — 30 jun)
- FAC-00003: "30 abr — 30 may"     (debe ser 1 may — 31 may)
- FAC-00002: "31 mar — 29 abr"     (debe ser 1 abr — 30 abr)
- FAC-00001: "22 mar — 30 mar"     (debe ser 23 mar — 31 mar)

Causa: parsear columnas tipo `DATE` con `new Date(string)` aplica zona horaria del navegador.

### Bug 2 — "Último pago: 1 de mayo de 2026"
La tarjeta superior lee `subData.current_period_start`, que sigue en `2026-05-01` porque **ni el webhook de Stripe ni `select-plan` actualizan ese campo cuando renuevan**. Solo se toca `current_period_end`. Cuando se cobró hoy FAC-00004 debió quedar `current_period_start = 2026-06-01`.

Adicionalmente, ese label dice "Último pago" pero realmente muestra el **inicio del período vigente**, no la fecha del último pago. Es confuso aunque estuviera actualizado.

### Bug 3 — "Próximo cobro"
`2026-07-01` es correcto ✅ (sale de `current_period_end` que sí se sincroniza bien).

### Lo que está bien (no tocar)
- Flujo trial 7 días → factura prorrateada → mes completo siguiente: funcionando.
- Cálculo de períodos en `stripe-webhook` (`getInvoicePeriod`) guarda fechas correctas.
- `billing-cycle` se salta empresas con `stripe_subscription_id` para no duplicar facturas (correcto, Stripe emite la suya).

---

## Plan de arreglo

### 1. Parsear fechas DATE sin desplazamiento de zona horaria (frontend)

En `src/pages/MiSuscripcionPage.tsx`, cambiar el renderizado del período del historial (línea ~1052) para construir la fecha como local cuando viene en formato `YYYY-MM-DD`:

```ts
// helper local
const parseDateOnly = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight, sin shift
};
```

Usarlo en el `format(...)` de `periodo_inicio` y `periodo_fin`. Resultado: FAC-00004 mostrará "1 jun — 30 jun 26".

### 2. Sincronizar `current_period_start` en el webhook de Stripe

En `supabase/functions/stripe-webhook/index.ts`, dentro del handler `invoice.paid / invoice.payment_succeeded`:

- Extraer también el inicio del período de la línea de la factura (ya lo hace `getInvoicePeriod`).
- Agregar al `updatePayload` de `subscriptions`:
  ```ts
  current_period_start: periodo.inicio  // '2026-06-01'
  ```

También en `customer.subscription.updated/created`, leer `sub.items.data[0].current_period_start` y guardarlo.

### 3. Arreglar el label "Último pago"

Cambiar el texto y la fuente de datos en `MiSuscripcionPage.tsx` líneas 750-757:
- Mostrar **"Período actual:"** con `current_period_start` → `current_period_end` (más claro y honesto).
- O alternativamente mostrar "Último pago: {fecha_pago de la última factura pagada}" leyendo de `facturas`.

Recomiendo lo primero (más simple y semánticamente correcto).

### 4. Backfill puntual para esta empresa

```sql
UPDATE subscriptions
SET current_period_start = '2026-06-01'
WHERE empresa_id = '66ac277d-c859-4d0e-beeb-f9162e3ade81';
```

Y revisar si hay otras empresas con `current_period_start` desfasado respecto a la última factura pagada y normalizarlas.

### 5. Verificación

- Recargar `/mi-suscripcion` y confirmar que el historial muestra "1 jun — 30 jun 26" y que "Período actual" muestra 1 jun → 1 jul.
- Simular un nuevo `invoice.paid` (próximo 1 de julio) y confirmar que ambos campos se actualizan.

---

## Detalles técnicos (resumen)

| Bug | Archivo | Causa | Fix |
|---|---|---|---|
| Fechas -1 día en historial | `MiSuscripcionPage.tsx:1052` | `new Date('YYYY-MM-DD')` parsea como UTC | parser local |
| "Último pago" desactualizado | `stripe-webhook/index.ts` handler `invoice.paid` | no setea `current_period_start` | agregar al update |
| Label confuso | `MiSuscripcionPage.tsx:753` | dice "Último pago" pero muestra inicio de período | renombrar a "Período actual" |
| Empresa actual desincronizada | BD | webhook nunca lo escribió | UPDATE puntual |

**Lo que NO se cambia**: lógica de prorrateo, generación de facturas mensuales en `billing-cycle`, monto cobrado por Stripe, fechas guardadas en `facturas` (ya son correctas).
