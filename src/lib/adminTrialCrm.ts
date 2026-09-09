export const TRIAL_CRM_STAGES = [
  'sin_contactar', 'por_contactar', 'contactado', 'interesado', 'seguimiento',
  'no_localizado', 'no_interesado', 'descartado', 'convertido',
] as const;

export type TrialCrmStage = typeof TRIAL_CRM_STAGES[number];

export const TRIAL_CRM_LOST_STAGES: readonly TrialCrmStage[] = ['no_interesado', 'descartado'];
export const TRIAL_CRM_ACTIVE_STAGES = TRIAL_CRM_STAGES.filter(
  stage => !TRIAL_CRM_LOST_STAGES.includes(stage) && stage !== 'convertido',
);

export const TRIAL_CRM_STAGE_INFO: Record<TrialCrmStage, {
  label: string;
  color: string;
  badgeClass: string;
}> = {
  sin_contactar: { label: 'Sin contactar', color: '#64748b', badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/25' },
  por_contactar: { label: 'Por contactar', color: '#3b82f6', badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/25' },
  contactado: { label: 'Contactado', color: '#06b6d4', badgeClass: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/25' },
  interesado: { label: 'Interesado', color: '#8b5cf6', badgeClass: 'bg-violet-500/10 text-violet-700 border-violet-500/25' },
  seguimiento: { label: 'En seguimiento', color: '#f59e0b', badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/25' },
  no_localizado: { label: 'No localizado', color: '#f97316', badgeClass: 'bg-orange-500/10 text-orange-700 border-orange-500/25' },
  no_interesado: { label: 'No interesado', color: '#ef4444', badgeClass: 'bg-red-500/10 text-red-700 border-red-500/25' },
  descartado: { label: 'Descartado', color: '#71717a', badgeClass: 'bg-zinc-500/10 text-zinc-700 border-zinc-500/25' },
  convertido: { label: 'Convertido', color: '#10b981', badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
};

export type TrialSetupLevel = 'sin_configurar' | 'exploro' | 'casi_listo';

export const TRIAL_SETUP_INFO: Record<TrialSetupLevel, { label: string; badgeClass: string }> = {
  sin_configurar: { label: 'No configuró nada', badgeClass: 'bg-red-500/10 text-red-700 border-red-500/25' },
  exploro: { label: 'Exploró el sistema', badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/25' },
  casi_listo: { label: 'Casi listo', badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
};

export function isTrialCrmStage(value: unknown): value is TrialCrmStage {
  return typeof value === 'string' && TRIAL_CRM_STAGES.includes(value as TrialCrmStage);
}

export function isLostTrialCrmStage(stage: TrialCrmStage): boolean {
  return TRIAL_CRM_LOST_STAGES.includes(stage);
}

export function canDeleteTrialLead(input: {
  stage: TrialCrmStage;
  deletionEligible: boolean;
  validSales: number;
  paidInvoices: number;
  stripeSubscriptionId?: string | null;
}): boolean {
  return input.deletionEligible
    && input.validSales === 0
    && input.paidInvoices === 0
    && !input.stripeSubscriptionId
    && ['no_interesado', 'descartado'].includes(input.stage);
}

export function canOfferTrialLead(input: {
  validSales: number;
  paidInvoices: number;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
}): boolean {
  return input.validSales === 0
    && input.paidInvoices === 0
    && !input.stripeSubscriptionId
    && !['active', 'past_due', 'pendiente_pago'].includes(input.subscriptionStatus ?? '');
}

export function trialLeadPriority(input: {
  setupLevel: TrialSetupLevel;
  ageDays: number;
  followUpAt?: string | null;
  now?: Date;
}): 'urgente' | 'alta' | 'normal' {
  const now = input.now ?? new Date();
  if (input.followUpAt && new Date(input.followUpAt).getTime() < now.getTime()) return 'urgente';
  if (input.setupLevel === 'casi_listo' || (input.setupLevel === 'exploro' && input.ageDays <= 30)) return 'alta';
  return 'normal';
}

export function normalizeWhatsappPhone(phone?: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `52${digits}`;
  return digits;
}
