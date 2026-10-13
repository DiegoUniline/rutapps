/**
 * Cliente del agente local "Rutapp Impresora" (impresión por cable/USB en escritorio).
 * El agente escucha en 127.0.0.1:17777 y envía bytes ESC/POS en RAW a la impresora elegida.
 */

export const AGENT_URL = 'http://127.0.0.1:17777';
export const AGENT_DOWNLOAD_WIN = '/descargas/RutappImpresora.exe';
export const AGENT_DOWNLOAD_MAC = '/descargas/RutappImpresora-mac.zip';

export interface AgentStatus {
  ok: boolean;
  version: string;
  printer: string;
  ancho: '58' | '80';
}

let cache: { at: number; status: AgentStatus | null } | null = null;
const CACHE_MS = 15_000;

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Macintosh|Mac OS X/i.test(navigator.userAgent || '');
}

export function isDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')) return false;
  // iPadOS se reporta como Macintosh
  return !(isMac() && navigator.maxTouchPoints > 1);
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENT_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const json = await res.json();
    if (!res.ok || json?.ok === false) throw new Error(json?.error || `Error ${res.status}`);
    return json as T;
  } finally {
    clearTimeout(t);
  }
}

/** Estado del agente, o null si no está instalado/corriendo. */
export async function getAgentStatus(force = false): Promise<AgentStatus | null> {
  if (!isDesktop()) return null;
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;
  let status: AgentStatus | null = null;
  try {
    status = await call<AgentStatus>('/status', undefined, 800);
  } catch {
    status = null;
  }
  cache = { at: Date.now(), status };
  return status;
}

export async function getAgentPrinters() {
  return call<{ printers: string[]; default: string }>('/printers');
}

export async function saveAgentConfig(printer: string, ancho: '58' | '80') {
  const r = await call<{ printer: string; ancho: '58' | '80' }>('/config', { method: 'POST', body: JSON.stringify({ printer, ancho }) });
  cache = null;
  return r;
}

export async function printAgentTest(printer: string, ancho: '58' | '80') {
  return call<{ printer: string }>('/test', { method: 'POST', body: JSON.stringify({ printer, ancho }) }, 15_000);
}

export async function printAgentBytes(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return call<{ printer: string }>('/print', { method: 'POST', body: JSON.stringify({ data: btoa(bin) }) }, 20_000);
}

const MARGEN_KEY = 'rutapp_agent_margen_izq';
/** Margen izquierdo (en columnas) guardado en esta computadora, para impresoras que cortan la orilla. */
export function getAgentMargen(): number {
  const n = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(MARGEN_KEY) : 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(6, Math.floor(n))) : 0;
}
export function setAgentMargen(n: number) {
  localStorage.setItem(MARGEN_KEY, String(Math.max(0, Math.min(6, Math.floor(n)))));
}

/** Ticket de prueba generado aquí (respeta el margen izquierdo guardado). */
export async function printAgentTestConMargen(printer: string, ancho: '58' | '80', margenCols: number) {
  const base = ancho === '58' ? 32 : 48;
  const cols = base - margenCols;
  const dots = margenCols * 12;
  const width = (ancho === '58' ? 384 : 576) - dots;
  const line = '-'.repeat(cols) + '\n';
  const num = Array.from({ length: cols }, (_, i) => String(i % 10)).join('');
  const txt = (s: string) => Array.from(new TextEncoder().encode(s));
  const b: number[] = [0x1B, 0x40];
  if (dots > 0) b.push(0x1D, 0x4C, dots & 0xFF, dots >> 8, 0x1D, 0x57, width & 0xFF, width >> 8);
  b.push(0x1B, 0x61, 0x01, ...txt('RUTAPP\nPrueba de impresion\n' + line), 0x1B, 0x61, 0x00);
  b.push(...txt(`Impresora: ${printer.replace(/[^\x20-\x7E]/g, '')}\nAncho: ${ancho} mm (${cols} col)\nMargen izq: ${margenCols} col\n` + line + num + '\n' + line));
  b.push(0x1B, 0x61, 0x01, ...txt('Si ves esto, todo funciona\n\n\n\n'), 0x1D, 0x56, 0x42, 0x00);
  return printAgentBytes(new Uint8Array(b));
}
