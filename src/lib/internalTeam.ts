export const TEAM_ACCESS_LEVELS = ['executive', 'supervisor', 'manager'] as const;
export type TeamAccessLevel = typeof TEAM_ACCESS_LEVELS[number];

export const TEAM_ACCESS_SCOPES = ['own', 'team', 'all'] as const;
export type TeamAccessScope = typeof TEAM_ACCESS_SCOPES[number];

export const INTERNAL_COMMISSION_MODES = [
  'none',
  'first_payment',
  'first_n_payments',
  'recurring',
  'fixed_activation',
] as const;
export type InternalCommissionMode = typeof INTERNAL_COMMISSION_MODES[number];

export const TEAM_LEVEL_LABELS: Record<TeamAccessLevel, string> = {
  executive: 'Ejecutivo',
  supervisor: 'Supervisor',
  manager: 'Gerente comercial',
};

export const TEAM_SCOPE_LABELS: Record<TeamAccessScope, string> = {
  own: 'Solo lo propio',
  team: 'Su equipo',
  all: 'Todo el equipo',
};

export const COMMISSION_MODE_LABELS: Record<InternalCommissionMode, string> = {
  none: 'Sin comisión',
  first_payment: 'Primer pago',
  first_n_payments: 'Primeros pagos',
  recurring: 'Mientras siga activo',
  fixed_activation: 'Monto fijo por activación',
};

export function calculateInternalCommission(input: {
  mode: InternalCommissionMode;
  paidAmount: number;
  paymentNumber: number;
  percent: number;
  paymentLimit?: number | null;
  fixedAmount?: number | null;
}): number {
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);
  const paymentNumber = Math.max(1, Math.trunc(Number(input.paymentNumber) || 1));
  const percent = Math.min(100, Math.max(0, Number(input.percent) || 0));
  const limit = Math.max(1, Math.trunc(Number(input.paymentLimit) || 1));

  if (input.mode === 'none') return 0;
  if (input.mode === 'first_payment' && paymentNumber !== 1) return 0;
  if (input.mode === 'first_n_payments' && paymentNumber > limit) return 0;
  if (input.mode === 'fixed_activation') {
    return paymentNumber === 1 ? Math.round(Math.max(0, Number(input.fixedAmount) || 0) * 100) / 100 : 0;
  }
  return Math.round(paidAmount * percent) / 100;
}

export function canReceiveInternalCommission(input: {
  active: boolean;
  isInternal: boolean;
  hasPartnerAttribution: boolean;
  mode: InternalCommissionMode;
}): boolean {
  return input.active && input.isInternal && !input.hasPartnerAttribution && input.mode !== 'none';
}
