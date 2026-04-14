

## Problem

When the user pays more than the current sale amount, the excess is returned as **change** instead of being automatically applied to pending accounts. In the screenshots, the user paid $18,500 for a $20.88 sale, expecting $18,000 to go to SAL-0001 — but got $18,479.12 as change because the pending account had `montoAplicar = 0`.

## Solution

Auto-distribute excess payment across pending accounts using FIFO logic when the total payment exceeds the current sale amount.

## Changes

### 1. `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts`

**Add auto-distribution logic**: When `totalPagosLineas` exceeds `totals.total` (current sale) and there are pending accounts with `montoAplicar = 0`, automatically distribute the surplus FIFO across `cuentasPendientes`.

Add a `useEffect` that watches `pagos` (payment lines total) and auto-assigns excess to pending accounts:

- Calculate `surplus = totalPagosLineas - totals.total` (only when `condicionPago === 'contado'`)
- If surplus > 0 and there are unassigned cuentas pendientes, distribute FIFO:
  - For each pending account (sorted by date), assign `min(surplus_remaining, cuenta.saldo_pendiente)`
  - Update `cuentasPendientes` with the new `montoAplicar` values
- Recalculate `totalACobrar` and `cambio` accordingly

**Update `cambio` calculation** (line 343): Change so that cambio = `max(0, totalPagosLineas - totalACobrar)` — this already works correctly since `totalACobrar` includes `totalAplicarCuentas`. The auto-distribution effect will increase `totalAplicarCuentas`, which increases `totalACobrar`, which reduces `cambio`.

### 2. Also fix `ventasPendientes` filter (line 153)

Currently filters only `condicion_pago === 'credito'`. Saldo inicial records have `condicion_pago = 'credito'` so they're already included, but we should also include any sale with `saldo_pendiente > 0` regardless of `condicion_pago` to catch edge cases. Change filter to remove the `condicion_pago === 'credito'` restriction and just use `saldo_pendiente > 0`.

## Behavior

- User adds payment of $18,500
- System sees current sale = $20.88, surplus = $18,479.12
- Auto-fills SAL-0001 with min($18,479.12, $18,000) = $18,000
- Remaining surplus = $479.12 → shown as change
- User can still manually adjust amounts before saving

