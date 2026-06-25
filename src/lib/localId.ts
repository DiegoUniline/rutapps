/**
 * Generates a valid UUID v4 for offline records.
 * Server columns are `uuid`, so we MUST emit a real UUID — never a `local-...` string.
 * Because we upsert with the same UUID when syncing, the local id IS the real id.
 *
 * Fallback path is only used in ancient browsers where crypto.randomUUID is missing.
 */
export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  // RFC4122 v4 fallback using getRandomValues
  if (typeof crypto !== 'undefined' && (crypto as any).getRandomValues) {
    const bytes = new Uint8Array(16);
    (crypto as any).getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort: pseudo-random (unsafe, but valid uuid shape)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
