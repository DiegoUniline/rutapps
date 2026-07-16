/**
 * Helpers to build payloads from NumericInput values.
 *
 * NumericInput emits `null` while the field is empty. Business rules decide
 * whether that empty value should be persisted as `null` or coerced to `0`.
 */

export interface ToPayloadOptions {
  /** If true, an empty (null/undefined) value becomes 0 in the payload. */
  defaultZero?: boolean;
}

/**
 * Convert a NumericInput value into a payload-safe number.
 * - null / undefined / "" → null (or 0 when defaultZero)
 * - NaN → null (or 0 when defaultZero)
 * - real number → number
 */
export function toPayloadNumber(
  value: number | null | undefined | string,
  { defaultZero = false }: ToPayloadOptions = {},
): number | null {
  if (value === null || value === undefined || value === '') {
    return defaultZero ? 0 : null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return defaultZero ? 0 : null;
  return n;
}

/**
 * Same as toPayloadNumber but always returns a number (for business fields
 * that must be numeric, e.g. quantity in stock adjustments).
 */
export function toRequiredNumber(
  value: number | null | undefined | string,
  fallback = 0,
): number {
  const v = toPayloadNumber(value, { defaultZero: false });
  return v === null ? fallback : v;
}
