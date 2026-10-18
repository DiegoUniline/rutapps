export interface CheckoutCartLine {
  producto_id: string;
  presentacion_id?: string | null;
  cantidad: number;
}

interface PendingCheckout {
  requestId: string;
  fingerprint: string;
  createdAt: string;
}

const SESSION_RENEW_WINDOW_SECONDS = 7 * 24 * 60 * 60;

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

export function tokenExpiresAt(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isTiendaTokenUsable(token: string | null, nowSeconds = Date.now() / 1000): token is string {
  if (!token) return false;
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt > nowSeconds + 30;
}

export function shouldRenewTiendaToken(token: string, nowSeconds = Date.now() / 1000): boolean {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt <= nowSeconds + SESSION_RENEW_WINDOW_SECONDS;
}

export function checkoutFingerprint(
  lines: CheckoutCartLine[],
  notas: string,
  fechaEntrega: string | null,
): string {
  const normalizedLines = lines
    .map((line) => ({
      producto_id: line.producto_id,
      presentacion_id: line.presentacion_id ?? null,
      cantidad: Number(line.cantidad),
    }))
    .sort((a, b) =>
      `${a.producto_id}:${a.presentacion_id ?? ""}`.localeCompare(`${b.producto_id}:${b.presentacion_id ?? ""}`),
    );

  return JSON.stringify({
    lines: normalizedLines,
    notas: notas.trim(),
    fecha_entrega: fechaEntrega || null,
  });
}

export function pendingCheckoutStorageKey(slug: string): string {
  return `tienda_checkout_pending_${slug}`;
}

export function getOrCreateCheckoutRequestId(
  storage: Pick<Storage, "getItem" | "setItem">,
  slug: string,
  fingerprint: string,
  createId: () => string = () => crypto.randomUUID(),
): string {
  const key = pendingCheckoutStorageKey(slug);
  try {
    const pending = JSON.parse(storage.getItem(key) ?? "null") as PendingCheckout | null;
    if (pending?.requestId && pending.fingerprint === fingerprint) return pending.requestId;
  } catch {
    // Un registro local dañado no debe impedir que el cliente envíe el pedido.
  }

  const requestId = createId();
  storage.setItem(key, JSON.stringify({ requestId, fingerprint, createdAt: new Date().toISOString() }));
  return requestId;
}

export function clearPendingCheckout(storage: Pick<Storage, "removeItem">, slug: string): void {
  storage.removeItem(pendingCheckoutStorageKey(slug));
}

export function isRetryableHttpStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}
