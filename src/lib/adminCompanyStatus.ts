export interface CompanySubscriptionStatus {
  status?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
}

/**
 * Returns the operational status used by Panel Master.
 * A collection status must not hide access while the already-paid period is
 * still current, so past_due/gracia/suspended remain active until it expires.
 */
export function getEffectiveCompanyStatus(
  subscription?: CompanySubscriptionStatus,
  now = new Date(),
): string {
  if (!subscription?.status) return 'sin_sub';

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const trialEnd = subscription.trial_ends_at
    ? new Date(subscription.trial_ends_at)
    : null;

  if (subscription.status === 'trial') {
    if (trialEnd && trialEnd > now) return 'trial';
    if (periodEnd && periodEnd > now) return 'active';
    return 'trial';
  }

  if (
    ['past_due', 'gracia', 'suspended'].includes(subscription.status)
    && periodEnd
    && periodEnd > now
  ) {
    return 'active';
  }

  if (['cancelled', 'canceled'].includes(subscription.status)) return 'cancelada';
  return subscription.status;
}
