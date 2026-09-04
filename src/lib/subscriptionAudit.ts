export type AuditSeverity = 'ok' | 'warning' | 'critical';

export interface BillingAuditFinding {
  code: string;
  severity: Exclude<AuditSeverity, 'ok'>;
  title: string;
  detail: string;
}

export interface BillingAuditRecord {
  empresa_id: string;
  empresa_nombre: string;
  empresa_email: string | null;
  empresa_created_at: string;
  empresa_demo_expires_at: string | null;
  is_partner_sandbox: boolean;
  active_user_count?: number;
  minimum_billable_users?: number;
  expected_billable_users?: number;
  db_subscription_count: number;
  db_subscription: {
    id: string;
    created_at: string | null;
    status: string;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    fecha_vencimiento: string | null;
    acceso_bloqueado: boolean;
    es_manual: boolean;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_payment_method_id: string | null;
    stripe_sync_error: string | null;
    max_usuarios: number;
    plan_nombre: string | null;
  } | null;
  stripe_subscription_count: number;
  stripe_subscription: {
    id: string;
    created_at: string | null;
    customer_id: string | null;
    status: string;
    trial_end: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    quantity: number;
    payment_method_id: string | null;
    card: {
      brand: string;
      last4: string;
      exp_month: number;
      exp_year: number;
      funding: string | null;
    } | null;
  } | null;
  payments: {
    stripe_paid_count: number;
    local_paid_count: number;
    stripe_paid_without_local_count: number;
    local_paid_but_stripe_unpaid_count: number;
    stripe_outstanding_count?: number;
    stripe_outstanding_amount?: number;
    local_manual_outstanding_count?: number;
    local_manual_outstanding_amount?: number;
    latest_stripe_invoice: AuditInvoiceSnapshot | null;
    latest_stripe_paid_invoice: AuditInvoiceSnapshot | null;
    latest_local_invoice: AuditInvoiceSnapshot | null;
    latest_local_paid_invoice?: AuditInvoiceSnapshot | null;
    first_local_invoice: AuditInvoiceSnapshot | null;
  };
  last_sale: {
    id: string;
    folio: string | null;
    created_at: string;
    fecha: string;
    total: number;
    status: string;
  } | null;
}

export interface AuditInvoiceSnapshot {
  id: string;
  number: string | null;
  status: string;
  amount: number;
  amount_due?: number;
  amount_paid?: number;
  amount_remaining?: number;
  paid_at: string | null;
  created_at: string | null;
  period_start?: string | null;
  period_end?: string | null;
  es_prorrateo?: boolean;
  stripe_invoice_id?: string | null;
}

export interface SubscriptionAuditResult extends BillingAuditRecord {
  expected: {
    signup_date: string;
    trial_end: string;
    real_period_start: string;
    first_prorated_period_end: string;
    first_full_invoice_date: string;
  };
  operational_status: 'trial' | 'active' | 'past_due' | 'down' | 'no_subscription';
  severity: AuditSeverity;
  findings: BillingAuditFinding[];
  active_without_payment: boolean;
}

const ACTIVE_STRIPE_STATUSES = new Set(['active', 'trialing']);
const DOWN_DB_STATUSES = new Set(['cancelled', 'canceled', 'cancelada', 'suspended']);

export function auditSubscription(
  record: BillingAuditRecord,
  now: Date = new Date(),
): SubscriptionAuditResult {
  const signupDate = dateOnlyInMexico(record.empresa_created_at);
  const trialEnd = addCalendarDays(signupDate, 7);
  const firstProratedPeriodEnd = endOfCalendarMonth(trialEnd);
  const firstFullInvoiceDate = firstOfNextMonth(trialEnd);
  const db = record.db_subscription;
  const stripe = record.stripe_subscription;
  const findings: BillingAuditFinding[] = [];
  const today = dateOnlyInMexico(now.toISOString());
  const trialAlreadyEnded = compareYmd(today, trialEnd) > 0;
  const sandbox = record.is_partner_sandbox;

  const add = (
    code: string,
    severity: Exclude<AuditSeverity, 'ok'>,
    title: string,
    detail: string,
  ) => findings.push({ code, severity, title, detail });

  if (record.db_subscription_count > 1) {
    add('duplicate_db_subscription', 'critical', 'Suscripciones duplicadas en RutApp',
      `La empresa tiene ${record.db_subscription_count} registros de suscripción.`);
  }

  if (!db) {
    if (!sandbox) {
      add('missing_db_subscription', trialAlreadyEnded ? 'critical' : 'warning',
        'Empresa sin suscripción en RutApp',
        trialAlreadyEnded
          ? 'Ya terminó su periodo de prueba esperado y no existe una suscripción.'
          : 'Está dentro de sus primeros 7 días, pero todavía no existe una suscripción.');
    }
  } else {
    const dbStatus = normalizeStatus(db.status);
    const dbIsActive = dbStatus === 'active';
    const dbIsTrial = dbStatus === 'trial';
    const dbIsDown = DOWN_DB_STATUSES.has(dbStatus);
    const dbTrialEnd = dateOnly(db.trial_ends_at);

    if (dbIsTrial && trialAlreadyEnded) {
      add('expired_trial_still_enabled', 'critical', 'Prueba vencida todavía habilitada',
        `Los 7 días terminaron el ${trialEnd}, pero RutApp continúa en trial.`);
    }

    if (dbTrialEnd && calendarDayDistance(dbTrialEnd, trialEnd) > 1) {
      add('trial_date_mismatch', 'warning', 'Fin de prueba diferente a alta + 7 días',
        `Esperado ${trialEnd}; RutApp tiene ${dbTrialEnd}.`);
    }

    if (dbIsActive && db.acceso_bloqueado) {
      add('active_but_blocked', 'critical', 'Activa pero con acceso bloqueado',
        'El estado de RutApp y el bloqueo de acceso se contradicen.');
    }
    if (dbIsDown && !db.acceso_bloqueado) {
      add('down_but_unblocked', 'critical', 'Baja pero con acceso habilitado',
        'La suscripción está cancelada o suspendida, pero el acceso no está bloqueado.');
    }
    if (db.stripe_sync_error) {
      add('stripe_sync_error', 'critical', 'Última sincronización con Stripe falló', db.stripe_sync_error);
    }

    if (record.stripe_subscription_count > 1) {
      add('duplicate_stripe_subscription', 'critical', 'Suscripciones activas duplicadas en Stripe',
        `Se encontraron ${record.stripe_subscription_count} suscripciones Stripe relacionadas.`);
    }

    if (!db.es_manual) {
      if (!stripe && dbIsActive) {
        add('active_without_stripe', 'critical', 'Activa en RutApp sin suscripción Stripe',
          'Puede existir acceso activo sin que Stripe tenga una suscripción para cobrar.');
      } else if (!stripe && dbIsTrial) {
        add('trial_without_stripe', 'warning', 'Prueba sin suscripción Stripe',
          'No se encontró una suscripción Stripe asociada para continuar el cobro al terminar la prueba.');
      }

      if (stripe) {
        if (Number.isFinite(record.expected_billable_users) && stripe.quantity !== record.expected_billable_users) {
          const chargingExtra = stripe.quantity > record.expected_billable_users;
          add(
            'stripe_seat_count_mismatch',
            chargingExtra ? 'critical' : 'warning',
            chargingExtra ? 'Stripe cobra usuarios de más' : 'Cantidad de usuarios desincronizada',
            `${record.active_user_count} usuario(s) activo(s), mínimo del plan ${record.minimum_billable_users}; Stripe tiene ${stripe.quantity} usuario(s) facturable(s) y debería tener ${record.expected_billable_users}.`,
          );
        }
        if (Number.isFinite(record.expected_billable_users) && db.max_usuarios !== record.expected_billable_users) {
          add('local_seat_count_mismatch', 'warning', 'Cantidad local de usuarios desactualizada',
            `RutApp tiene ${db.max_usuarios}; debería tener ${record.expected_billable_users} según usuarios activos y mínimo del plan.`);
        }
        const stripeActive = ACTIVE_STRIPE_STATUSES.has(normalizeStatus(stripe.status));
        if (dbIsActive && !stripeActive) {
          add('rutapp_active_stripe_inactive', 'critical', 'RutApp activa y Stripe inactivo',
            `Stripe reporta “${stripe.status}”.`);
        }
        if ((dbIsDown || db.acceso_bloqueado) && stripeActive) {
          add('rutapp_down_stripe_active', 'critical', 'RutApp de baja pero Stripe sigue cobrando',
            `Stripe continúa en estado “${stripe.status}”.`);
        }
        if (dbIsTrial && normalizeStatus(stripe.status) === 'active') {
          add('rutapp_trial_stripe_active', 'warning', 'RutApp en prueba y Stripe ya activo',
            'Conviene confirmar que Stripe no haya iniciado el cobro antes de concluir los 7 días.');
        }

        const stripeTrialEnd = dateOnly(stripe.trial_end);
        if (stripeTrialEnd && calendarDayDistance(stripeTrialEnd, trialEnd) > 1) {
          add('stripe_trial_date_mismatch', 'warning', 'Prueba de Stripe no coincide',
            `Esperado ${trialEnd}; Stripe tiene ${stripeTrialEnd}.`);
        }

        const dbPeriodEnd = dateOnly(db.current_period_end ?? db.fecha_vencimiento);
        const stripePeriodEnd = dateOnly(stripe.current_period_end);
        if (dbPeriodEnd && stripePeriodEnd && calendarDayDistance(dbPeriodEnd, stripePeriodEnd) > 1) {
          add('period_end_mismatch', 'critical', 'Vencimiento desincronizado',
            `RutApp vence ${dbPeriodEnd}; Stripe vence ${stripePeriodEnd}.`);
        }

        const stripePeriodStart = dateOnly(stripe.current_period_start);
        if (
          dbIsActive
          && compareYmd(today, firstFullInvoiceDate) >= 0
          && stripePeriodStart
          && dayOfMonth(stripePeriodStart) !== 1
        ) {
          add('stripe_not_anchored_to_first', 'warning', 'Ciclo Stripe no inicia el día 1',
            `El periodo actual de Stripe comenzó el ${stripePeriodStart}.`);
        }

        if (!stripe.card) {
          add('missing_card', dbIsActive ? 'critical' : 'warning', 'Sin tarjeta asociada',
            'Stripe no devolvió una tarjeta predeterminada para realizar el siguiente cobro.');
        } else {
          const expiryMonth = stripe.card.exp_year * 100 + stripe.card.exp_month;
          const [todayYear, todayMonth] = today.split('-').map(Number);
          const currentMonth = todayYear * 100 + todayMonth;
          const nextChargeDate = stripePeriodEnd ?? firstFullInvoiceDate;
          const nextChargeMonth = Number(nextChargeDate.slice(0, 4)) * 100 + Number(nextChargeDate.slice(5, 7));
          if (expiryMonth < currentMonth) {
            add('expired_card', 'critical', 'Tarjeta vencida',
              `La tarjeta •••• ${stripe.card.last4} venció ${String(stripe.card.exp_month).padStart(2, '0')}/${stripe.card.exp_year}.`);
          } else if (expiryMonth < nextChargeMonth) {
            add('card_expires_before_charge', 'warning', 'Tarjeta vence antes del siguiente ciclo',
              `La tarjeta •••• ${stripe.card.last4} puede no estar vigente para el cobro completo.`);
          }
        }
        if (
          db.stripe_payment_method_id
          && stripe.payment_method_id
          && db.stripe_payment_method_id !== stripe.payment_method_id
        ) {
          add('payment_method_mismatch', 'warning', 'Método de pago desincronizado',
            `RutApp y Stripe apuntan a métodos de pago diferentes.`);
        }
      }
    }
  }

  if (record.payments.stripe_paid_without_local_count > 0) {
    add('stripe_payment_not_synced', 'critical', 'Pagos de Stripe sin reflejar en RutApp',
      `${record.payments.stripe_paid_without_local_count} pago(s) no aparecen sincronizados localmente.`);
  }
  if (record.payments.local_paid_but_stripe_unpaid_count > 0) {
    add('local_paid_stripe_unpaid', 'warning', 'Pago local no coincide con Stripe',
      `${record.payments.local_paid_but_stripe_unpaid_count} factura(s) figuran pagadas solo en RutApp.`);
  }

  const firstInvoice = record.payments.first_local_invoice;
  if (trialAlreadyEnded && firstInvoice) {
    const actualStart = dateOnly(firstInvoice.period_start);
    const actualEnd = dateOnly(firstInvoice.period_end);
    const isTrialPeriodInvoice = Boolean(
      actualStart
      && actualEnd
      && compareYmd(actualStart, trialEnd) < 0
      && calendarDayDistance(actualEnd, trialEnd) <= 1
    );
    if (!isTrialPeriodInvoice) {
      const wrongStart = actualStart && calendarDayDistance(actualStart, trialEnd) > 1;
      const wrongEnd = actualEnd && calendarDayDistance(actualEnd, firstProratedPeriodEnd) > 1;
      if (wrongStart || wrongEnd) {
        add('first_prorated_period_mismatch', 'warning', 'Primer periodo no coincide con el prorrateo esperado',
          `Esperado ${trialEnd} → ${firstProratedPeriodEnd}; registrado ${actualStart || 'sin inicio'} → ${actualEnd || 'sin fin'}.`);
      } else if (actualStart && actualEnd && firstInvoice.es_prorrateo !== true) {
        add('first_invoice_not_marked_prorated', 'warning', 'Primera factura no está marcada como prorrateo',
          'Las fechas corresponden al primer periodo parcial, pero la factura no tiene la bandera de prorrateo.');
      }
    }
  }

  const activeWithoutPayment = !sandbox
    && db?.status === 'active'
    && trialAlreadyEnded
    && record.payments.stripe_paid_count === 0
    && record.payments.local_paid_count === 0;
  if (activeWithoutPayment) {
    add('active_without_payment', 'critical', 'Activa sin ningún cobro comprobable',
      `La prueba terminó el ${trialEnd} y no existe factura pagada en Stripe ni en RutApp.`);
  }

  const operationalStatus = getOperationalStatus(db);
  const severity: AuditSeverity = findings.some(f => f.severity === 'critical')
    ? 'critical'
    : findings.length > 0 ? 'warning' : 'ok';

  return {
    ...record,
    expected: {
      signup_date: signupDate,
      trial_end: trialEnd,
      real_period_start: trialEnd,
      first_prorated_period_end: firstProratedPeriodEnd,
      first_full_invoice_date: firstFullInvoiceDate,
    },
    operational_status: operationalStatus,
    severity,
    findings,
    active_without_payment: activeWithoutPayment,
  };
}

function getOperationalStatus(db: BillingAuditRecord['db_subscription']): SubscriptionAuditResult['operational_status'] {
  if (!db) return 'no_subscription';
  const status = normalizeStatus(db.status);
  if (status === 'trial') return 'trial';
  if (status === 'active' && !db.acceso_bloqueado) return 'active';
  if (status === 'past_due' && !db.acceso_bloqueado) return 'past_due';
  return 'down';
}

function normalizeStatus(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function dateOnly(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dateOnlyInMexico(value);
}

function dateOnlyInMexico(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addCalendarDays(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

function endOfCalendarMonth(ymd: string): string {
  const [year, month] = ymd.split('-').map(Number);
  return toYmd(new Date(Date.UTC(year, month, 0)));
}

function firstOfNextMonth(ymd: string): string {
  const [year, month] = ymd.split('-').map(Number);
  return toYmd(new Date(Date.UTC(year, month, 1)));
}

function calendarDayDistance(a: string, b: string): number {
  return Math.abs(parseYmd(a).getTime() - parseYmd(b).getTime()) / 86_400_000;
}

function compareYmd(a: string, b: string): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
