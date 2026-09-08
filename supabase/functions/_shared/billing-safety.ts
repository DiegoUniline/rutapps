export type BillingMetadata = Record<string, string | undefined> | null | undefined;
export type BillingInvoiceOrigin = "manual" | "automatic" | "reminder" | "unknown";

export interface BillingInvoiceOriginInput {
  source?: string | null;
  billingReason?: string | null;
  stripeSubscriptionId?: string | null;
}

const SUBSCRIPTION_TYPES = new Set(["subscription_renewal", "subscription_cycle"]);

export function classifyBillingInvoiceOrigin({
  source,
  billingReason,
  stripeSubscriptionId,
}: BillingInvoiceOriginInput): BillingInvoiceOrigin {
  const normalizedSource = String(source || "").trim().toLowerCase();
  const normalizedReason = String(billingReason || "").trim().toLowerCase();

  if (normalizedSource === "create-invoice-reminder") return "reminder";
  if (normalizedSource.startsWith("admin_")) return "manual";
  if (normalizedReason === "manual") return "manual";
  if (
    stripeSubscriptionId ||
    normalizedReason === "subscription_cycle" ||
    normalizedReason === "subscription_create" ||
    normalizedReason === "subscription_update"
  ) return "automatic";

  return "unknown";
}

export function invoiceAffectsSubscription(
  metadata: BillingMetadata,
  stripeSubscriptionId?: string | null,
): boolean {
  if (metadata?.tipo === "additional_charge" || metadata?.affects_subscription === "0") {
    return false;
  }

  // A genuine Stripe subscription invoice is authoritative even when it was
  // produced before RutApp started adding explicit metadata.
  if (stripeSubscriptionId) return true;

  // Standalone/manual invoices must opt in explicitly. This prevents a generic
  // invoice with a one-day Stripe line period from shortening a subscription.
  return metadata?.affects_subscription === "1" &&
    SUBSCRIPTION_TYPES.has(metadata?.tipo || "");
}

export function normalizeDatePart(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.split("T")[0];
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function periodsOverlap(
  firstStart: unknown,
  firstEnd: unknown,
  secondStart: unknown,
  secondEnd: unknown,
): boolean {
  const aStart = normalizeDatePart(firstStart);
  const aEnd = normalizeDatePart(firstEnd);
  const bStart = normalizeDatePart(secondStart);
  const bEnd = normalizeDatePart(secondEnd);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;

  // Period ends are treated as exclusive. Adjacent periods such as
  // 01-sep→01-oct and 01-oct→01-nov do not conflict.
  return aStart < bEnd && bStart < aEnd;
}

export function invoiceMetadataPeriod(metadata: BillingMetadata): { inicio: string; fin: string } | null {
  const inicio = normalizeDatePart(metadata?.periodo_inicio);
  const fin = normalizeDatePart(metadata?.periodo_fin);
  return inicio && fin ? { inicio, fin } : null;
}
