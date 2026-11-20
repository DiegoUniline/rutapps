// Shared utils for tienda edge functions: PBKDF2 password hash + HMAC JWT

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$100000$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    const salt = b64urlDecode(saltB64);
    const expected = b64urlDecode(hashB64);
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: new Uint8Array(salt).buffer, iterations, hash: "SHA-256" },
        key,
        256,
      ),
    );
    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface TiendaTokenPayload {
  empresa_id: string;
  cliente_id: string;
  tienda_cliente_id: string;
  email: string;
  exp: number; // unix seconds
}

/** Vigencia de cada token de la tienda. La tienda lo renueva sola al abrirse y
 *  tienda-refresh acepta tokens vencidos con firma válida: la sesión solo se
 *  cierra si el cliente la cierra, lo bloquean o se desactiva la tienda. */
export const TTL_SESION_SEGUNDOS = 60 * 60 * 24 * 90;

export const BLOCKED_HASH = "BLOCKED$NO_LOGIN";

export async function signToken(payload: Omit<TiendaTokenPayload, "exp">, secret: string, ttlSeconds = TTL_SESION_SEGUNDOS): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const full: TiendaTokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(full));
  const data = `${h}.${p}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

/** Valida firma y vencimiento. `aceptarVencido` (solo tienda-refresh) valida la
 *  firma pero ignora el vencimiento, para poder renovar una sesión vieja. */
export async function verifyToken(token: string, secret: string, opts: { aceptarVencido?: boolean } = {}): Promise<TiendaTokenPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, new Uint8Array(b64urlDecode(s)).buffer, enc.encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(p))) as TiendaTokenPayload;
    if (!payload?.empresa_id || !payload?.tienda_cliente_id) return null;
    if (!opts.aceptarVencido && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Escapa comodines de LIKE/ILIKE (% _ \\) para comparar texto del usuario de forma exacta. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Correo como lo escribe la gente en el celular: sin espacios, en minúsculas y
 *  con la comilla tipográfica que a veces queda en lugar de "@". */
export function normalizarCorreo(raw: unknown): string {
  let c = String(raw ?? "").toLowerCase().trim().replace(/\s+/g, "");
  if (!c.includes("@")) c = c.replace(/[“”‘’"'`]/g, "@");
  return c;
}

export const correoValido = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

/** ¿El campo correo de la ficha del cliente contiene este correo? Tolera
 *  mayúsculas, espacios y varios correos separados por coma, punto y coma o "/". */
export function correoCoincide(campo: string | null | undefined, correoNormal: string): boolean {
  if (!campo || !correoNormal) return false;
  return String(campo).toLowerCase().split(/[,;/\s]+/).some((c) => c.trim() === correoNormal);
}

/** Contraseña tal cual; si no coincide y trae espacios al inicio/fin (teclado del
 *  celular), se intenta sin ellos. */
export async function verificarPasswordTolerante(password: unknown, hash: string): Promise<boolean> {
  const p = String(password ?? "");
  if (await verifyPassword(p, hash)) return true;
  const recortada = p.trim();
  return recortada !== p && recortada.length > 0 && await verifyPassword(recortada, hash);
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Respuesta única de "la sesión ya no sirve": la tienda intenta renovarla y, si
 *  tienda-refresh también la rechaza, cierra sesión. */
export function sesionVencida() {
  return json({ error: "Sesión expirada", code: "sesion_expirada" }, 401);
}
