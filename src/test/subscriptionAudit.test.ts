import { describe, expect, it } from 'vitest';
import { auditSubscription, type BillingAuditRecord } from '@/lib/subscriptionAudit';

const base: BillingAuditRecord = {
  empresa_id: 'empresa-1',
  empresa_nombre: 'Empresa demo',
  empresa_email: 'demo@example.com',
  empresa_created_at: '2026-08-10T18:00:00.000Z',
  empresa_demo_expires_at: '2026-08-17T18:00:00.000Z',
  is_partner_sandbox: false,
  db_subscription_count: 1,
  db_subscription: {
    id: 'db-sub', created_at: '2026-08-17T18:00:00.000Z', status: 'active', trial_ends_at: '2026-08-17T18:00:00.000Z',
    current_period_start: '2026-09-01', current_period_end: '2026-10-01',
    fecha_vencimiento: null, acceso_bloqueado: false, es_manual: false,
    cancel_at_period_end: false, stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1', stripe_payment_method_id: 'pm_1',
    stripe_sync_error: null, max_usuarios: 3, plan_nombre: 'Mensual',
  },
  stripe_subscription_count: 1,
  stripe_subscription: {
    id: 'sub_1', created_at: '2026-08-17T18:00:00.000Z', customer_id: 'cus_1', status: 'active', trial_end: '2026-08-17T18:00:00.000Z',
    current_period_start: '2026-09-01T14:00:00.000Z', current_period_end: '2026-10-01T14:00:00.000Z',
    cancel_at_period_end: false, quantity: 3, payment_method_id: 'pm_1',
    card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030, funding: 'credit' },
  },
  payments: {
    stripe_paid_count: 1, local_paid_count: 1,
    stripe_paid_without_local_count: 0, local_paid_but_stripe_unpaid_count: 0,
    latest_stripe_invoice: null, latest_stripe_paid_invoice: null,
    latest_local_invoice: null, first_local_invoice: null,
  },
  last_sale: null,
};

describe('auditSubscription', () => {
  it('calcula alta + 7 días y el primer periodo proporcional', () => {
    const result = auditSubscription(base, new Date('2026-09-04T18:00:00Z'));
    expect(result.expected).toEqual({
      signup_date: '2026-08-10',
      trial_end: '2026-08-17',
      real_period_start: '2026-08-17',
      first_prorated_period_end: '2026-08-31',
      first_full_invoice_date: '2026-09-01',
    });
    expect(result.severity).toBe('ok');
  });

  it('detecta una empresa activa después del trial sin ningún pago', () => {
    const result = auditSubscription({
      ...base,
      payments: { ...base.payments, stripe_paid_count: 0, local_paid_count: 0 },
    }, new Date('2026-09-04T18:00:00Z'));
    expect(result.active_without_payment).toBe(true);
    expect(result.findings.map(f => f.code)).toContain('active_without_payment');
    expect(result.severity).toBe('critical');
  });

  it('detecta RutApp activo mientras Stripe está cancelado', () => {
    const result = auditSubscription({
      ...base,
      stripe_subscription: { ...base.stripe_subscription!, status: 'canceled' },
    }, new Date('2026-09-04T18:00:00Z'));
    expect(result.findings.map(f => f.code)).toContain('rutapp_active_stripe_inactive');
  });

  it('detecta una baja local que continúa activa en Stripe', () => {
    const result = auditSubscription({
      ...base,
      db_subscription: { ...base.db_subscription!, status: 'cancelled', acceso_bloqueado: true },
    }, new Date('2026-09-04T18:00:00Z'));
    expect(result.findings.map(f => f.code)).toContain('rutapp_down_stripe_active');
  });

  it('detecta tarjeta y periodos desincronizados', () => {
    const result = auditSubscription({
      ...base,
      db_subscription: {
        ...base.db_subscription!, current_period_end: '2026-10-15', stripe_payment_method_id: 'pm_old',
      },
      stripe_subscription: {
        ...base.stripe_subscription!, current_period_start: '2026-09-15', current_period_end: '2026-10-15',
        payment_method_id: 'pm_new', card: null,
      },
    }, new Date('2026-09-04T18:00:00Z'));
    const codes = result.findings.map(f => f.code);
    expect(codes).toContain('stripe_not_anchored_to_first');
    expect(codes).toContain('missing_card');
    expect(codes).toContain('payment_method_mismatch');
  });

  it('no marca como impago un sandbox de partner', () => {
    const result = auditSubscription({
      ...base,
      is_partner_sandbox: true,
      payments: { ...base.payments, stripe_paid_count: 0, local_paid_count: 0 },
    }, new Date('2026-09-04T18:00:00Z'));
    expect(result.active_without_payment).toBe(false);
    expect(result.findings.map(f => f.code)).not.toContain('active_without_payment');
  });

  it('detecta una tarjeta vencida y un primer periodo mal registrado', () => {
    const result = auditSubscription({
      ...base,
      stripe_subscription: {
        ...base.stripe_subscription!,
        card: { brand: 'visa', last4: '1111', exp_month: 8, exp_year: 2026, funding: 'credit' },
      },
      payments: {
        ...base.payments,
        first_local_invoice: {
          id: 'invoice-1', number: 'RUT-1', status: 'paid', amount: 300,
          paid_at: '2026-08-20', created_at: '2026-08-20',
          period_start: '2026-08-20', period_end: '2026-09-20', es_prorrateo: false,
        },
      },
    }, new Date('2026-09-04T18:00:00Z'));
    const codes = result.findings.map(f => f.code);
    expect(codes).toContain('expired_card');
    expect(codes).toContain('first_prorated_period_mismatch');
  });
});
