import { describe, expect, it } from 'vitest';
import { calculateInternalCommission, canReceiveInternalCommission } from '@/lib/internalTeam';

describe('internal team commission safeguards', () => {
  it('calculates percentage modes from the amount actually paid', () => {
    expect(calculateInternalCommission({ mode: 'recurring', paidAmount: 1500, paymentNumber: 4, percent: 10 })).toBe(150);
    expect(calculateInternalCommission({ mode: 'first_payment', paidAmount: 1500, paymentNumber: 2, percent: 10 })).toBe(0);
    expect(calculateInternalCommission({ mode: 'first_n_payments', paidAmount: 900, paymentNumber: 3, paymentLimit: 3, percent: 12 })).toBe(108);
    expect(calculateInternalCommission({ mode: 'first_n_payments', paidAmount: 900, paymentNumber: 4, paymentLimit: 3, percent: 12 })).toBe(0);
  });

  it('only pays a fixed activation amount on the first collected invoice', () => {
    expect(calculateInternalCommission({ mode: 'fixed_activation', paidAmount: 1500, paymentNumber: 1, percent: 0, fixedAmount: 500 })).toBe(500);
    expect(calculateInternalCommission({ mode: 'fixed_activation', paidAmount: 1500, paymentNumber: 2, percent: 0, fixedAmount: 500 })).toBe(0);
  });

  it('never allows the same acquisition to pay partner and internal commission', () => {
    expect(canReceiveInternalCommission({ active: true, isInternal: true, hasPartnerAttribution: true, mode: 'recurring' })).toBe(false);
    expect(canReceiveInternalCommission({ active: true, isInternal: true, hasPartnerAttribution: false, mode: 'recurring' })).toBe(true);
    expect(canReceiveInternalCommission({ active: false, isInternal: true, hasPartnerAttribution: false, mode: 'recurring' })).toBe(false);
  });
});
