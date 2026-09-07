import { describe, expect, it } from 'vitest';
import { auditPartnerProgram, expectedPartnerCommission } from '@/lib/partnerProgram';

describe('reglas del programa de partners', () => {
  it('calcula la comisión neta después del cupón', () => {
    expect(expectedPartnerCommission(1_000, 20, 5)).toBe(150);
    expect(expectedPartnerCommission(999.99, 15, 15)).toBe(0);
  });

  it('detecta cupón mayor al porcentaje vigente', () => {
    const findings = auditPartnerProgram({
      currentCommissionPct: 15,
      currentLevelOrder: 2,
      termsAcceptedAt: '2026-09-07T00:00:00Z',
      contractSignedAt: '2026-09-07',
      coupons: [{ id: 'c1', codigo: 'VENTA20', descuento_pct: 20, activo: true }],
      commissions: [], payments: [], levels: [],
    });
    expect(findings.some(item => item.id === 'coupon-cap-c1')).toBe(true);
  });

  it('detecta monto incorrecto y una factura duplicada', () => {
    const base = {
      factura_id: 'f1', pago_id: null, tipo: 'recurrente', nivel_id: null,
      partner_pct: 20, cupon_pct: 5, monto_factura: 1_000,
      status: 'pendiente', factura_estado: 'pagada',
    };
    const findings = auditPartnerProgram({
      currentCommissionPct: 20, currentLevelOrder: 3, termsAcceptedAt: 'ok', contractSignedAt: 'ok',
      coupons: [], payments: [], levels: [],
      commissions: [
        { ...base, id: 'a', monto_comision: 100 },
        { ...base, id: 'b', monto_comision: 150 },
      ],
    });
    expect(findings.some(item => item.id === 'commission-formula-a')).toBe(true);
    expect(findings.some(item => item.id === 'duplicate-invoice-b')).toBe(true);
  });

  it('concilia pagos contra movimientos asociados', () => {
    const findings = auditPartnerProgram({
      currentCommissionPct: 20, currentLevelOrder: 3, termsAcceptedAt: 'ok', contractSignedAt: 'ok',
      coupons: [], levels: [],
      payments: [{ id: 'p1', monto: 200 }],
      commissions: [{
        id: 'c1', factura_id: 'f1', pago_id: 'p1', tipo: 'recurrente', nivel_id: null,
        partner_pct: 20, cupon_pct: 0, monto_factura: 1_000, monto_comision: 200,
        status: 'pagada', factura_estado: 'pagada',
      }],
    });
    expect(findings).toEqual([]);
  });

  it('detecta bono alcanzado pero ausente', () => {
    const findings = auditPartnerProgram({
      currentCommissionPct: 20, currentLevelOrder: 3, termsAcceptedAt: 'ok', contractSignedAt: 'ok',
      coupons: [], commissions: [], payments: [],
      levels: [{ id: 'pro', nombre: 'Pro', orden: 3, bono_mxn: 500 }],
    });
    expect(findings.some(item => item.id === 'missing-bonus-pro')).toBe(true);
  });
});
