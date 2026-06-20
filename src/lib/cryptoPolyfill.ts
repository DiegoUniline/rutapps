// Polyfill crypto.randomUUID for environments that lack it:
// - iOS Safari < 15.4
// - Android WebView on older devices
// - Insecure contexts (http://) where crypto.randomUUID is unavailable even on modern browsers
// Loaded as a side-effect from main.tsx BEFORE the React tree mounts.

function uuidv4Fallback(): string {
  // Prefer crypto.getRandomValues when present, else Math.random.
  const bytes = new Uint8Array(16);
  const g: any = (typeof globalThis !== 'undefined' ? globalThis : window) as any;
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Per RFC 4122 §4.4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h: string[] = [];
  for (let i = 0; i < 256; i++) h.push((i + 0x100).toString(16).slice(1));
  return (
    h[bytes[0]] + h[bytes[1]] + h[bytes[2]] + h[bytes[3]] + '-' +
    h[bytes[4]] + h[bytes[5]] + '-' +
    h[bytes[6]] + h[bytes[7]] + '-' +
    h[bytes[8]] + h[bytes[9]] + '-' +
    h[bytes[10]] + h[bytes[11]] + h[bytes[12]] + h[bytes[13]] + h[bytes[14]] + h[bytes[15]]
  );
}

(function installCryptoRandomUUIDPolyfill() {
  try {
    const g: any = (typeof globalThis !== 'undefined' ? globalThis : window) as any;
    if (!g.crypto) {
      try { g.crypto = {}; } catch { /* read-only in some envs */ }
    }
    if (g.crypto && typeof g.crypto.randomUUID !== 'function') {
      try {
        g.crypto.randomUUID = uuidv4Fallback;
      } catch {
        // Some browsers freeze the crypto object — fall back to redefining via descriptor.
        try {
          Object.defineProperty(g.crypto, 'randomUUID', {
            value: uuidv4Fallback,
            configurable: true,
            writable: true,
          });
        } catch {
          /* give up silently; consumers that hit this path will still throw,
             but at least we tried without breaking the rest of the app. */
        }
      }
    }
  } catch {
    /* never let the polyfill itself crash app startup */
  }
})();

export {};
