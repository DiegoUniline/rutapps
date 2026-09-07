export type CommissionPersonType = 'internal' | 'partner';

export interface CommissionPersonLike {
  id: string;
  manager_id: string | null;
  is_active: boolean;
}

export const COMMISSION_CHANNELS = [
  'partner_link',
  'partner_coupon',
  'manual',
  'whatsapp',
  'web',
  'referral',
  'organic',
  'other',
] as const;

export type CommissionChannel = (typeof COMMISSION_CHANNELS)[number];

const CHANNEL_LABELS: Record<CommissionChannel, string> = {
  partner_link: 'Enlace de partner',
  partner_coupon: 'Cupón de partner',
  manual: 'Captura manual',
  whatsapp: 'WhatsApp',
  web: 'Página web',
  referral: 'Recomendación',
  organic: 'Orgánico',
  other: 'Otro',
};

export function commissionChannelLabel(channel: string): string {
  return CHANNEL_LABELS[channel as CommissionChannel] ?? channel;
}

export function directReportCounts<T extends CommissionPersonLike>(people: T[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const person of people) {
    if (!person.manager_id) continue;
    counts.set(person.manager_id, (counts.get(person.manager_id) ?? 0) + 1);
  }
  return counts;
}

export function wouldCreateManagementCycle<T extends CommissionPersonLike>(
  personId: string,
  proposedManagerId: string | null,
  people: T[],
): boolean {
  if (!proposedManagerId) return false;
  if (personId === proposedManagerId) return true;

  const byId = new Map(people.map(person => [person.id, person]));
  const visited = new Set<string>();
  let currentId: string | null = proposedManagerId;

  while (currentId) {
    if (currentId === personId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = byId.get(currentId)?.manager_id ?? null;
  }

  return false;
}

export function activeManagerOptions<T extends CommissionPersonLike>(
  personId: string | null,
  people: T[],
): T[] {
  return people.filter(person => (
    person.is_active
    && person.id !== personId
    && (!personId || !wouldCreateManagementCycle(personId, person.id, people))
  ));
}

export function attributionChanged(
  current: {
    captured_by_id: string | null;
    managed_by_id: string | null;
    channel: string;
    notes: string | null;
  } | null,
  next: {
    captured_by_id: string | null;
    managed_by_id: string | null;
    channel: string;
    notes: string | null;
  },
): boolean {
  if (!current) return true;
  return current.captured_by_id !== next.captured_by_id
    || current.managed_by_id !== next.managed_by_id
    || current.channel !== next.channel
    || (current.notes ?? '') !== (next.notes ?? '');
}
