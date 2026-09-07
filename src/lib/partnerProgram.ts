export const PARTNER_TERMS_VERSION = '2026-09-07';

export const PARTNER_LEVELS_PUBLIC = [
  { emoji: '🥉', nombre: 'Starter', pct: 10, min: 0, max: 4, color: '#CD7F32', bono: 0, popular: false },
  { emoji: '🥈', nombre: 'Growth', pct: 15, min: 5, max: 14, color: '#9CA3AF', bono: 0, popular: false },
  { emoji: '🥇', nombre: 'Pro', pct: 20, min: 15, max: 29, color: '#FCD34D', bono: 500, popular: false },
  { emoji: '💎', nombre: 'Elite', pct: 25, min: 30, max: 59, color: '#06B6D4', bono: 1_500, popular: true },
  { emoji: '👑', nombre: 'Legend', pct: 30, min: 60, max: null, color: '#A855F7', bono: 5_000, popular: false },
] as const;

export type PartnerAuditSeverity = 'critical' | 'warning' | 'ok';

export type PartnerAuditFinding = {
  id: string;
  severity: Exclude<PartnerAuditSeverity, 'ok'>;
  title: string;
  detail: string;
};

export type PartnerCommissionAuditRow = {
  id: string;
  factura_id?: string | null;
  pago_id?: string | null;
  tipo?: string | null;
  nivel_id?: string | null;
  partner_pct: number | string;
  cupon_pct: number | string;
  monto_factura: number | string;
  monto_comision: number | string;
  status: string;
  factura_estado?: string | null;
};

export type PartnerCouponAuditRow = {
  id: string;
  codigo: string;
  descuento_pct: number | string;
  activo: boolean;
};

export type PartnerPaymentAuditRow = {
  id: string;
  monto: number | string;
};

export type PartnerLevelAuditRow = {
  id: string;
  nombre: string;
  orden: number;
  bono_mxn: number | string | null;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function expectedPartnerCommission(
  invoiceAmount: number,
  partnerPct: number,
  couponPct: number,
): number {
  return roundMoney(invoiceAmount * Math.max(partnerPct - couponPct, 0) / 100);
}

export function auditPartnerProgram(input: {
  currentCommissionPct: number;
  currentLevelOrder: number;
  termsAcceptedAt?: string | null;
  contractSignedAt?: string | null;
  coupons: PartnerCouponAuditRow[];
  commissions: PartnerCommissionAuditRow[];
  payments: PartnerPaymentAuditRow[];
  levels: PartnerLevelAuditRow[];
}): PartnerAuditFinding[] {
  const findings: PartnerAuditFinding[] = [];
  const seenInvoices = new Set<string>();

  if (!input.termsAcceptedAt) {
    findings.push({
      id: 'terms-missing',
      severity: 'warning',
      title: 'Términos sin evidencia de aceptación',
      detail: 'Este partner es anterior al consentimiento versionado o fue creado manualmente. Regulariza el expediente antes del siguiente pago.',
    });
  }
  if (!input.contractSignedAt) {
    findings.push({
      id: 'contract-missing',
      severity: 'warning',
      title: 'Contrato comercial pendiente',
      detail: 'La aceptación digital acredita las reglas operativas, pero conviene integrar el contrato comercial firmado antes de realizar pagos relevantes.',
    });
  }

  for (const coupon of input.coupons) {
    const pct = Number(coupon.descuento_pct || 0);
    if (coupon.activo && pct > input.currentCommissionPct) {
      findings.push({
        id: `coupon-cap-${coupon.id}`,
        severity: 'critical',
        title: `Cupón ${coupon.codigo} excede la comisión`,
        detail: `Ofrece ${pct}% y el partner sólo tiene ${input.currentCommissionPct}% vigente. Debe quedar inactivo antes de otro registro o cobro.`,
      });
    }
  }

  for (const commission of input.commissions) {
    if (commission.tipo === 'bono_nivel') continue;
    const partnerPct = Number(commission.partner_pct || 0);
    const couponPct = Number(commission.cupon_pct || 0);
    const amount = Number(commission.monto_factura || 0);
    const actual = Number(commission.monto_comision || 0);
    const expected = expectedPartnerCommission(amount, partnerPct, couponPct);

    if (couponPct > partnerPct) {
      findings.push({
        id: `commission-coupon-${commission.id}`,
        severity: 'critical',
        title: 'Comisión con cupón fuera de regla',
        detail: `La comisión ${commission.id} guardó ${couponPct}% de cupón contra ${partnerPct}% del partner.`,
      });
    }
    if (Math.abs(expected - actual) > 0.01) {
      findings.push({
        id: `commission-formula-${commission.id}`,
        severity: 'critical',
        title: 'Monto de comisión inconsistente',
        detail: `Se guardaron $${actual.toFixed(2)} y la fórmula da $${expected.toFixed(2)}.`,
      });
    }
    if (commission.factura_id) {
      if (seenInvoices.has(commission.factura_id)) {
        findings.push({
          id: `duplicate-invoice-${commission.id}`,
          severity: 'critical',
          title: 'Factura comisionada más de una vez',
          detail: `La factura ${commission.factura_id} aparece duplicada en los movimientos del partner.`,
        });
      }
      seenInvoices.add(commission.factura_id);
    }
    if (commission.status !== 'anulada' && commission.factura_estado && commission.factura_estado !== 'pagada') {
      findings.push({
        id: `invoice-state-${commission.id}`,
        severity: 'critical',
        title: 'Comisión ligada a factura no pagada',
        detail: `La factura está en estado “${commission.factura_estado}” y la comisión sigue “${commission.status}”.`,
      });
    }
  }

  const paidByPayment = new Map<string, number>();
  for (const commission of input.commissions) {
    if (commission.status === 'pagada' && commission.pago_id) {
      paidByPayment.set(
        commission.pago_id,
        roundMoney((paidByPayment.get(commission.pago_id) || 0) + Number(commission.monto_comision || 0)),
      );
    }
  }
  for (const payment of input.payments) {
    const linked = paidByPayment.get(payment.id) || 0;
    const paid = Number(payment.monto || 0);
    if (Math.abs(linked - paid) > 0.01) {
      findings.push({
        id: `payment-${payment.id}`,
        severity: 'critical',
        title: 'Pago sin conciliación exacta',
        detail: `El pago registra $${paid.toFixed(2)} y sus comisiones asociadas suman $${linked.toFixed(2)}.`,
      });
    }
  }

  const earnedBonusLevelIds = new Set(
    input.commissions.filter(row => row.tipo === 'bono_nivel' && row.nivel_id).map(row => row.nivel_id as string),
  );
  for (const level of input.levels) {
    const bonus = Number(level.bono_mxn || 0);
    if (bonus > 0 && level.orden <= input.currentLevelOrder && !earnedBonusLevelIds.has(level.id)) {
      findings.push({
        id: `missing-bonus-${level.id}`,
        severity: 'critical',
        title: `Bono ${level.nombre} no generado`,
        detail: `Alcanzó el nivel, pero falta el bono único de $${bonus.toFixed(2)}.`,
      });
    }
  }

  return findings;
}
