import { describe, expect, it } from 'vitest';
import {
  TRIAL_CRM_ACTIVE_STAGES,
  TRIAL_CRM_LOST_STAGES,
  TRIAL_CRM_STAGES,
  TRIAL_CRM_STAGE_INFO,
  canDeleteTrialLead,
  canOfferTrialLead,
  isLostTrialCrmStage,
  normalizeWhatsappPhone,
  trialLeadPriority,
} from '@/lib/adminTrialCrm';

describe('admin trial CRM safeguards', () => {
  it('defines presentation metadata for every commercial stage', () => {
    for (const stage of TRIAL_CRM_STAGES) {
      expect(TRIAL_CRM_STAGE_INFO[stage].label).toBeTruthy();
      expect(TRIAL_CRM_STAGE_INFO[stage].color).toMatch(/^#/);
    }
  });

  it('keeps lost stages outside the active recovery pipeline', () => {
    expect(TRIAL_CRM_LOST_STAGES).toEqual(['no_interesado', 'descartado']);
    expect(TRIAL_CRM_ACTIVE_STAGES).not.toContain('no_interesado');
    expect(TRIAL_CRM_ACTIVE_STAGES).not.toContain('descartado');
    expect(TRIAL_CRM_ACTIVE_STAGES).not.toContain('convertido');
    expect(isLostTrialCrmStage('no_interesado')).toBe(true);
    expect(isLostTrialCrmStage('seguimiento')).toBe(false);
  });

  it('only enables deletion after commercial discard and financial validation', () => {
    const safe = { stage: 'descartado' as const, deletionEligible: true, validSales: 0, paidInvoices: 0, stripeSubscriptionId: null };
    expect(canDeleteTrialLead(safe)).toBe(true);
    expect(canDeleteTrialLead({ ...safe, stage: 'interesado' })).toBe(false);
    expect(canDeleteTrialLead({ ...safe, validSales: 1 })).toBe(false);
    expect(canDeleteTrialLead({ ...safe, paidInvoices: 1 })).toBe(false);
    expect(canDeleteTrialLead({ ...safe, stripeSubscriptionId: 'sub_123' })).toBe(false);
  });

  it('does not offer recovery discounts to paid or Stripe-active accounts', () => {
    expect(canOfferTrialLead({ validSales: 0, paidInvoices: 0, subscriptionStatus: 'trial' })).toBe(true);
    expect(canOfferTrialLead({ validSales: 0, paidInvoices: 1, subscriptionStatus: 'trial' })).toBe(false);
    expect(canOfferTrialLead({ validSales: 0, paidInvoices: 0, subscriptionStatus: 'active' })).toBe(false);
    expect(canOfferTrialLead({ validSales: 0, paidInvoices: 0, stripeSubscriptionId: 'sub_123' })).toBe(false);
  });

  it('prioritizes overdue follow-ups and formats Mexican WhatsApp numbers', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    expect(trialLeadPriority({ setupLevel: 'sin_configurar', ageDays: 90, followUpAt: '2026-09-08T11:00:00Z', now })).toBe('urgente');
    expect(trialLeadPriority({ setupLevel: 'casi_listo', ageDays: 10, now })).toBe('alta');
    expect(normalizeWhatsappPhone('(833) 123-4567')).toBe('528331234567');
  });
});
