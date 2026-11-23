import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// D-056: altas de usuarios se cobran ya (proporcional); bajas sin devolución.
const ms = readFileSync('supabase/functions/manage-subscription/index.ts', 'utf8');
const bc = readFileSync('supabase/functions/billing-cycle/index.ts', 'utf8');

describe('D-056 cobro de usuarios en Stripe', () => {
  it('sync_active_users: alta cobra proporcional, baja sin devolución', () => {
    expect(ms).toContain('proration_behavior: qty > previousStripeUsers ? "always_invoice" : "none"');
  });
  it('update_quantity: bajar no genera saldo a favor (ni en la vista previa)', () => {
    expect(ms).toContain('proration_behavior: isUpgrade ? "always_invoice" : "none"');
    const bloqueCantidad = ms.slice(ms.indexOf('action === "update_quantity"'), ms.indexOf('action === "change_plan"'));
    expect(bloqueCantidad).not.toContain('create_prorations');
  });
  it('corrección diaria (billing-cycle): misma regla en los dos modelos', () => {
    expect(bc).toContain('proration_behavior: desiredExtras > currentExtras ? "always_invoice" : "none"');
    expect(bc).toContain('proration_behavior: qty > currentStripeQty ? "always_invoice" : "none"');
  });
});

// D-057: los cobros de Stripe de suscripciones nuevas se anclan a las 09:00 CDMX (15:00 UTC).
describe('D-057 cobros a las 9:00 am CDMX', () => {
  it('suscripciones nuevas anclan a las 15:00 UTC', () => {
    const wh = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
    const sp = readFileSync('supabase/functions/select-plan/index.ts', 'utf8');
    expect(wh).toContain('-01T15:00:00.000Z`');
    expect(wh).not.toContain('-01T14:00:00.000Z`');
    expect(sp).toContain('now.getUTCMonth() + 1, 1, 15, 0, 0)');
  });
});
