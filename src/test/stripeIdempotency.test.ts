import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  claveIdempotencia,
  esRechazoRepetidoPorIdempotencia,
  fechaCdmx,
  huellaParametros,
  idStripe,
} from '../../supabase/functions/_shared/stripeIdempotency';

// Fase 3 «Inventario y cobros»: un reintento del mismo cobro no cobra dos veces;
// un cambio distinto sí pasa.

const HOY_9AM = new Date('2026-11-23T15:00:00Z'); // 09:00 CDMX (D-057)

describe('fechaCdmx', () => {
  it('usa el día de Ciudad de México (UTC-6, sin horario de verano)', () => {
    expect(fechaCdmx(new Date('2026-11-23T05:59:59Z'))).toBe('2026-11-22');
    expect(fechaCdmx(new Date('2026-11-23T06:00:00Z'))).toBe('2026-11-23');
    expect(fechaCdmx(new Date('2026-07-01T05:30:00Z'))).toBe('2026-06-30');
  });
});

describe('huellaParametros', () => {
  it('no depende del orden de las llaves ni de valores undefined', () => {
    const a = huellaParametros({ items: [{ id: 'si_1', quantity: 6 }], proration_behavior: 'always_invoice', x: undefined });
    const b = huellaParametros({ proration_behavior: 'always_invoice', items: [{ quantity: 6, id: 'si_1' }] });
    expect(a).toBe(b);
  });
  it('cambia si cambia cualquier parámetro', () => {
    const a = huellaParametros({ items: [{ id: 'si_1', quantity: 6 }] });
    const b = huellaParametros({ items: [{ id: 'si_1', quantity: 7 }] });
    expect(a).not.toBe(b);
  });
});

describe('claveIdempotencia', () => {
  const params = { items: [{ id: 'si_1', quantity: 6 }], proration_behavior: 'always_invoice' };

  it('arma la clave con intención, estado de partida, fecha CDMX y huella', () => {
    const k = claveIdempotencia('qty', ['sub_1', '5>6', 'in_1'], { parametros: params, fecha: HOY_9AM });
    expect(k).toMatch(/^rutapp:qty:sub_1:5>6:in_1:2026-11-23:[0-9a-z]+$/);
  });

  it('mismo cambio, mismo día → misma clave (el reintento no cobra dos veces)', () => {
    const k1 = claveIdempotencia('qty', ['sub_1', '5>6', 'in_1'], { parametros: params, fecha: HOY_9AM });
    const k2 = claveIdempotencia('qty', ['sub_1', '5>6', 'in_1'], { parametros: { ...params }, fecha: new Date('2026-11-24T05:00:00Z') });
    expect(k2).toBe(k1); // 23:00 CDMX del mismo día
  });

  it('otra cantidad, otro punto de partida, otra suscripción u otro día → otra clave', () => {
    const base = claveIdempotencia('qty', ['sub_1', '5>6', 'in_1'], { parametros: params, fecha: HOY_9AM });
    expect(claveIdempotencia('qty', ['sub_1', '5>7', 'in_1'], { parametros: params, fecha: HOY_9AM })).not.toBe(base);
    expect(claveIdempotencia('qty', ['sub_2', '5>6', 'in_1'], { parametros: params, fecha: HOY_9AM })).not.toBe(base);
    expect(claveIdempotencia('qty', ['sub_1', '5>6', 'in_1'], { parametros: params, fecha: new Date('2026-11-24T15:00:00Z') })).not.toBe(base);
  });

  it('D-056: archivar y reactivar el mismo día vuelve a cobrar (la última factura cambió)', () => {
    // 5→6 cobra (factura in_A pasa a ser la última) · 6→5 sin cobro · 5→6 otra vez: debe pasar.
    const primeraAlta = claveIdempotencia('qty', ['sub_1', '5>6', 'in_0'], { parametros: params, fecha: HOY_9AM });
    const segundaAlta = claveIdempotencia('qty', ['sub_1', '5>6', 'in_A'], { parametros: params, fecha: HOY_9AM });
    expect(segundaAlta).not.toBe(primeraAlta);
  });

  it('mismos datos de partida pero parámetros distintos → otra clave (Stripe no rechaza por «otros parámetros»)', () => {
    const k1 = claveIdempotencia('qty', ['sub_1', '5>6', 'in_1'], { parametros: params, fecha: HOY_9AM });
    const k2 = claveIdempotencia('qty', ['sub_1', '5>6', 'in_1'], { parametros: { ...params, metadata: { num_usuarios: '6' } }, fecha: HOY_9AM });
    expect(k2).not.toBe(k1);
  });

  it('sin fecha: la intención única (sesión de Stripe) no depende del día', () => {
    const k1 = claveIdempotencia('alta-sub', ['cs_123'], { fecha: null });
    expect(k1).toBe('rutapp:alta-sub:cs_123');
  });

  it('ventana de 10 min: doble clic misma sesión; otra ventana, otra sesión', () => {
    const p = { line_items: [{ price: 'price_1', quantity: 1 }] };
    const a = claveIdempotencia('checkout-timbres', ['emp_1'], { parametros: p, ventanaMinutos: 10, fecha: new Date('2026-11-23T15:01:00Z') });
    const b = claveIdempotencia('checkout-timbres', ['emp_1'], { parametros: p, ventanaMinutos: 10, fecha: new Date('2026-11-23T15:09:59Z') });
    const c = claveIdempotencia('checkout-timbres', ['emp_1'], { parametros: p, ventanaMinutos: 10, fecha: new Date('2026-11-23T15:10:00Z') });
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it('limpia caracteres raros y respeta el máximo de 255 de Stripe', () => {
    const k = claveIdempotencia('qty', ['sub 1/ñ', null, undefined, ''], { fecha: null });
    expect(k).toBe('rutapp:qty:sub_1__:-:-:-');
    const larga = claveIdempotencia('x', ['a'.repeat(400)], { fecha: null });
    expect(larga.length).toBeLessThanOrEqual(255);
    expect(claveIdempotencia('x', ['a'.repeat(400)], { fecha: null })).toBe(larga);
    expect(claveIdempotencia('x', ['a'.repeat(399) + 'b'], { fecha: null })).not.toBe(larga);
  });
});

describe('idStripe', () => {
  it('acepta id en texto u objeto expandido', () => {
    expect(idStripe('in_1')).toBe('in_1');
    expect(idStripe({ id: 'in_2' })).toBe('in_2');
    expect(idStripe(null)).toBeNull();
  });
});

describe('esRechazoRepetidoPorIdempotencia', () => {
  it('solo un rechazo de pago repetido por la clave permite reintentar con clave nueva', () => {
    expect(esRechazoRepetidoPorIdempotencia({ type: 'StripeCardError', statusCode: 402, headers: { 'idempotent-replayed': 'true' } })).toBe(true);
    expect(esRechazoRepetidoPorIdempotencia({ statusCode: 402, headers: { 'Idempotent-Replayed': 'true' } })).toBe(true);
    // Primer rechazo (no repetido): no se reintenta.
    expect(esRechazoRepetidoPorIdempotencia({ type: 'StripeCardError', statusCode: 402, headers: {} })).toBe(false);
    // Error 500 repetido: no se sabe si se aplicó → no se reintenta.
    expect(esRechazoRepetidoPorIdempotencia({ type: 'StripeAPIError', statusCode: 500, headers: { 'idempotent-replayed': 'true' } })).toBe(false);
    expect(esRechazoRepetidoPorIdempotencia(new Error('x'))).toBe(false);
    expect(esRechazoRepetidoPorIdempotencia(null)).toBe(false);
  });
});

// ── Inventario: toda llamada que crea o cambia un cobro lleva idempotencyKey ──

/** Texto de los argumentos de cada llamada `<patron>(...)` en el archivo. */
function llamadas(fuente: string, patron: string): string[] {
  const out: string[] = [];
  let i = fuente.indexOf(patron);
  while (i >= 0) {
    let j = i + patron.length;
    let nivel = 1;
    while (nivel > 0 && j < fuente.length) {
      if (fuente[j] === '(') nivel++;
      else if (fuente[j] === ')') nivel--;
      j++;
    }
    out.push(fuente.slice(i, j));
    i = fuente.indexOf(patron, j);
  }
  return out;
}

const fn = (nombre: string) => readFileSync(`supabase/functions/${nombre}/index.ts`, 'utf8');

describe('inventario de llamadas a Stripe con idempotencyKey', () => {
  it('cambios de cantidad/plan de suscripción (manage-subscription, billing-cycle, admin-billing)', () => {
    for (const nombre of ['manage-subscription', 'billing-cycle', 'admin-billing']) {
      const updates = llamadas(fn(nombre), 'stripe.subscriptions.update(');
      // Solo las que tocan renglones o prorrateo (cancelar/reactivar/cupón no cobran).
      const deCobro = updates.filter((u) => /items|proration_behavior|params/.test(u));
      expect(deCobro.length, nombre).toBeGreaterThan(0);
      for (const u of deCobro) expect(u, `${nombre}: ${u.slice(0, 80)}`).toContain('idempotencyKey');
    }
  });

  it('alta de suscripción en el webhook: clave por sesión y trial_end estable', () => {
    const src = fn('stripe-webhook');
    const [crear] = llamadas(src, 'stripe.subscriptions.create(');
    expect(crear).toContain('claveIdempotencia("alta-sub", [session.id], { fecha: null })');
    expect(src).toContain('const trialEndUnix = event.created + 7 * 86400;');
  });

  it('sesiones de pago (checkout) en todas las funciones que las crean', () => {
    for (const nombre of ['select-plan', 'create-checkout', 'purchase-timbres', 'purchase-route-credits', 'create-trial-checkout']) {
      const sesiones = llamadas(fn(nombre), 'stripe.checkout.sessions.create(');
      expect(sesiones.length, nombre).toBeGreaterThan(0);
      for (const s of sesiones) expect(s, nombre).toContain('ventanaMinutos: 10');
    }
  });

  it('facturas creadas por RutApp (recordatorio, admin, puente agosto)', () => {
    for (const nombre of ['create-invoice-reminder', 'admin-billing', 'billing-align-bridge-aug2026']) {
      const src = fn(nombre);
      for (const patron of ['stripe.invoices.create(', 'stripe.invoiceItems.create(']) {
        for (const c of llamadas(src, patron)) expect(c, `${nombre}: ${c.slice(0, 60)}`).toContain('idempotencyKey');
      }
    }
  });

  it('alta con cargo inmediato: un rechazo repetido por la clave se reintenta con clave nueva', () => {
    const src = fn('manage-subscription');
    expect(src).toContain('if (!esRechazoRepetidoPorIdempotencia(e)) throw e;');
    expect(src).toContain('payment_behavior: "error_if_incomplete"');
  });
});

describe('wa-scheduler-alertas-semanal', () => {
  it('llama wa_clientes_saldos con el parámetro real p_empresa', () => {
    const src = fn('wa-scheduler-alertas-semanal');
    expect(src).toContain('admin.rpc("wa_clientes_saldos", { p_empresa: empresaId');
    expect(src).not.toContain('p_empresa_id: empresaId, p_limit');
  });
});
