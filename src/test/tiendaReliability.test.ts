import { beforeEach, describe, expect, it } from "vitest";
import {
  checkoutFingerprint,
  clearPendingCheckout,
  getOrCreateCheckoutRequestId,
  isRetryableHttpStatus,
  isTiendaTokenUsable,
  pendingCheckoutStorageKey,
  shouldRenewTiendaToken,
  tokenExpiresAt,
} from "@/tienda/tiendaReliability";

function fakeToken(exp: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp })}.signature`;
}

describe("confiabilidad de la tienda en línea", () => {
  beforeEach(() => localStorage.clear());

  it("reconoce una sesión vigente y lee su vencimiento", () => {
    const token = fakeToken(2_000_000);
    expect(tokenExpiresAt(token)).toBe(2_000_000);
    expect(isTiendaTokenUsable(token, 1_000_000)).toBe(true);
  });

  it("rechaza sesiones vencidas, próximas a vencer o malformadas", () => {
    expect(isTiendaTokenUsable(fakeToken(1_000_000), 1_000_000)).toBe(false);
    expect(isTiendaTokenUsable(fakeToken(1_000_020), 1_000_000)).toBe(false);
    expect(isTiendaTokenUsable("token-invalido", 1_000_000)).toBe(false);
  });

  it("renueva solamente cuando faltan siete días o menos", () => {
    const now = 1_000_000;
    expect(shouldRenewTiendaToken(fakeToken(now + 6 * 86_400), now)).toBe(true);
    expect(shouldRenewTiendaToken(fakeToken(now + 8 * 86_400), now)).toBe(false);
  });

  it("genera la misma huella aunque cambie el orden visual de los renglones", () => {
    const a = checkoutFingerprint([
      { producto_id: "b", presentacion_id: null, cantidad: 2 },
      { producto_id: "a", presentacion_id: "p", cantidad: 1 },
    ], " entregar atrás ", "2026-09-10");
    const b = checkoutFingerprint([
      { producto_id: "a", presentacion_id: "p", cantidad: 1 },
      { producto_id: "b", presentacion_id: null, cantidad: 2 },
    ], "entregar atrás", "2026-09-10");
    expect(a).toBe(b);
  });

  it("reutiliza el request id al reintentar exactamente el mismo pedido", () => {
    const fingerprint = checkoutFingerprint([{ producto_id: "a", cantidad: 2 }], "", null);
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const first = getOrCreateCheckoutRequestId(localStorage, "demo", fingerprint, () => ids.shift()!);
    const second = getOrCreateCheckoutRequestId(localStorage, "demo", fingerprint, () => ids.shift()!);
    expect(second).toBe(first);
    expect(ids).toHaveLength(1);
  });

  it("crea otro request id cuando cambia el contenido del pedido", () => {
    const first = getOrCreateCheckoutRequestId(localStorage, "demo", "pedido-1", () => "id-1");
    const second = getOrCreateCheckoutRequestId(localStorage, "demo", "pedido-2", () => "id-2");
    expect(first).toBe("id-1");
    expect(second).toBe("id-2");
  });

  it("elimina la llave pendiente solamente después del éxito", () => {
    getOrCreateCheckoutRequestId(localStorage, "demo", "pedido", () => "id-1");
    expect(localStorage.getItem(pendingCheckoutStorageKey("demo"))).not.toBeNull();
    clearPendingCheckout(localStorage, "demo");
    expect(localStorage.getItem(pendingCheckoutStorageKey("demo"))).toBeNull();
  });

  it("solo reintenta fallas temporales del servidor o la red", () => {
    expect([408, 425, 429, 500, 502, 503, 504].every(isRetryableHttpStatus)).toBe(true);
    expect([400, 401, 403, 404, 409, 422].some(isRetryableHttpStatus)).toBe(false);
  });
});
