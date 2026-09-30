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
