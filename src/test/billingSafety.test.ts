import { describe, expect, it } from 'vitest';
import {
  classifyBillingInvoiceOrigin,
  invoiceAffectsSubscription,
  invoiceMetadataPeriod,
  periodsOverlap,
} from '../../supabase/functions/_shared/billing-safety';

describe('billing safety', () => {
  it('no permite que una factura profesional antigua modifique la vigencia', () => {
    expect(invoiceAffectsSubscription({ empresa_id: 'empresa-1' }, null)).toBe(false);
  });

  it('reconoce una factura recurrente real de Stripe aunque no tenga metadata nueva', () => {
    expect(invoiceAffectsSubscription({}, 'sub_123')).toBe(true);
  });

  it('solo deja que una renovación manual explícita cambie la suscripción', () => {
    expect(invoiceAffectsSubscription({
      tipo: 'subscription_renewal',
      affects_subscription: '1',
    }, null)).toBe(true);
    expect(invoiceAffectsSubscription({
      tipo: 'additional_charge',
      affects_subscription: '0',
    }, null)).toBe(false);
  });

  it('detecta periodos duplicados pero permite periodos consecutivos', () => {
    expect(periodsOverlap('2026-09-01', '2026-10-01', '2026-09-02', '2026-10-02')).toBe(true);
    expect(periodsOverlap('2026-09-01', '2026-10-01', '2026-10-01', '2026-11-01')).toBe(false);
  });

  it('prefiere el periodo mensual explícito sobre el periodo de un día de Stripe', () => {
    expect(invoiceMetadataPeriod({
      periodo_inicio: '2026-09-01',
      periodo_fin: '2026-10-01',
    })).toEqual({ inicio: '2026-09-01', fin: '2026-10-01' });
  });

  it('clasifica facturas manuales históricas usando billing_reason de Stripe', () => {
    expect(classifyBillingInvoiceOrigin({ billingReason: 'manual' })).toBe('manual');
  });

  it('distingue ciclos de Stripe, recordatorios y facturas del Panel Master', () => {
    expect(classifyBillingInvoiceOrigin({
      billingReason: 'subscription_cycle',
      stripeSubscriptionId: 'sub_123',
    })).toBe('automatic');
    expect(classifyBillingInvoiceOrigin({
      source: 'create-invoice-reminder',
      billingReason: 'manual',
    })).toBe('reminder');
    expect(classifyBillingInvoiceOrigin({
      source: 'admin_invoices_tab',
      billingReason: 'manual',
    })).toBe('manual');
  });
});
