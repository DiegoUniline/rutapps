/**
 * Medidor REAL de consumo de datos (megas) por fecha.
 *
 * - Envuelve `fetch` una sola vez y suma los bytes reales de cada respuesta
 *   (usa `content-length` cuando viene; si no, mide el cuerpo).
 * - Acumula por fecha local, origen (`ruta` / `escritorio`) y recurso
 *   (tabla REST, bucket de Storage, función, auth…).
 * - Persiste primero en localStorage (funciona sin conexión) y sube un único
 *   registro por día/usuario/origen a `consumo_datos` cada pocos minutos.
 *
 * No cambia ninguna lógica de negocio: solo mide.
 */
import { supabase } from '@/lib/supabase';

const STORE_KEY = 'uniline_data_usage_v1';
const DEVICE_KEY = 'uniline_device_id';
const RETENTION_DAYS = 90;
const FLUSH_INTERVAL_MS = 2 * 60 * 1000;

export type UsageOrigen = 'ruta' | 'escritorio';

export interface UsageBucket {
  down: number;
  up: number;
  req: number;
  recursos: Record<string, number>;
}

type UsageStore = Record<string, Partial<Record<UsageOrigen, UsageBucket>>>;

let identity: { empresaId?: string; userId?: string } = {};
let installed = false;
let dirty = false;

export function setDataUsageIdentity(empresaId?: string, userId?: string) {
  identity = { empresaId, userId };
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readStore(): UsageStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as UsageStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: UsageStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* cuota llena: se ignora */ }
}

function pruneStore(store: UsageStore): UsageStore {
  const limit = new Date();
  limit.setDate(limit.getDate() - RETENTION_DAYS);
  const limitKey = todayKey(limit);
  const out: UsageStore = {};
  for (const [fecha, val] of Object.entries(store)) {
    if (fecha >= limitKey) out[fecha] = val;
  }
  return out;
}

function currentOrigen(): UsageOrigen {
  try {
    return window.location.pathname.startsWith('/ruta') ? 'ruta' : 'escritorio';
  } catch {
    return 'escritorio';
  }
}

/** Nombre legible del recurso a partir de la URL. */
export function classifyUrl(url: string): string | null {
  try {
    const u = new URL(url, window.location.origin);
    const path = u.pathname;
    if (path.includes('/rest/v1/rpc/')) return `rpc: ${path.split('/rest/v1/rpc/')[1]}`;
    if (path.includes('/rest/v1/')) return path.split('/rest/v1/')[1]?.split('/')[0] || 'rest';
    if (path.includes('/storage/v1/')) {
      const parts = path.split('/storage/v1/')[1]?.split('/') || [];
      const bucket = parts.includes('public') ? parts[parts.indexOf('public') + 1] : parts[1];
      return `imágenes: ${bucket || 'storage'}`;
    }
    if (path.includes('/functions/v1/')) return `función: ${path.split('/functions/v1/')[1]?.split('/')[0]}`;
    if (path.includes('/auth/v1/')) return 'sesión';
    if (path.includes('/realtime/v1')) return 'tiempo real';
    if (u.origin === window.location.origin) return 'app (archivos)';
    return null;
  } catch {
    return null;
  }
}

export function recordUsage(recurso: string, downBytes: number, upBytes: number) {
  if (!downBytes && !upBytes) return;
  const store = readStore();
  const fecha = todayKey();
  const origen = currentOrigen();
  const day = (store[fecha] ||= {});
  const bucket = (day[origen] ||= { down: 0, up: 0, req: 0, recursos: {} });
  bucket.down += Math.max(0, downBytes);
  bucket.up += Math.max(0, upBytes);
  bucket.req += 1;
  bucket.recursos[recurso] = (bucket.recursos[recurso] || 0) + Math.max(0, downBytes) + Math.max(0, upBytes);
  writeStore(store);
  dirty = true;
}

function requestBytes(body: BodyInit | null | undefined): number {
  if (!body) return 0;
  try {
    if (typeof body === 'string') return new Blob([body]).size;
    if (body instanceof Blob) return body.size;
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
  } catch { /* ignore */ }
  return 0;
}

/** Instala el medidor. Idempotente. */
export function installDataUsageMeter() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const recurso = classifyUrl(url);
    const up = requestBytes(init?.body as BodyInit | undefined);

    const res = await originalFetch(input as any, init);
    if (!recurso) return res;

    try {
      const len = res.headers.get('content-length');
      if (len) {
        recordUsage(recurso, Number(len) || 0, up);
      } else if (res.body) {
        // Sin content-length (respuesta en chunks): se mide una copia del cuerpo
        // en segundo plano, sin bloquear al que llamó.
        const copy = res.clone();
        copy.arrayBuffer()
          .then(buf => recordUsage(recurso, buf.byteLength, up))
          .catch(() => recordUsage(recurso, 0, up));
      } else {
        recordUsage(recurso, 0, up);
      }
    } catch { /* medir nunca debe romper una petición */ }

    return res;
  };

  // Imágenes y recursos que no pasan por fetch (<img>, <script>): se miden con
  // la API de rendimiento cuando el servidor lo permite (transferSize > 0).
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (entry.initiatorType !== 'img' && entry.initiatorType !== 'css') continue;
        const bytes = entry.transferSize || entry.encodedBodySize || 0;
        if (!bytes) continue;
        const recurso = classifyUrl(entry.name) || 'imágenes';
        recordUsage(recurso, bytes, 0);
      }
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch { /* navegador sin soporte */ }

  setInterval(() => { void flushDataUsage(); }, FLUSH_INTERVAL_MS);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushDataUsage();
  });
  window.addEventListener('pagehide', () => { void flushDataUsage(); });
}

/** Sube el acumulado del día al servidor (merge por dispositivo). */
export async function flushDataUsage(): Promise<void> {
  if (!dirty) return;
  const { empresaId, userId } = identity;
  if (!empresaId || !userId) return;
  if (!navigator.onLine) return;

  const store = pruneStore(readStore());
  writeStore(store);
  const fecha = todayKey();
  const day = store[fecha];
  if (!day) { dirty = false; return; }

  const deviceId = getDeviceId();

  for (const origen of Object.keys(day) as UsageOrigen[]) {
    const bucket = day[origen];
    if (!bucket) continue;
    try {
      const { data: existing } = await supabase
        .from('consumo_datos')
        .select('id, desglose')
        .eq('empresa_id', empresaId)
        .eq('user_id', userId)
        .eq('fecha', fecha)
        .eq('origen', origen)
        .maybeSingle();

      const desglose: any = (existing?.desglose as any) || {};
      const dispositivos: Record<string, { down: number; up: number; req: number }> = desglose.dispositivos || {};
      dispositivos[deviceId] = { down: bucket.down, up: bucket.up, req: bucket.req };

      const recursos: Record<string, number> = { ...(desglose.recursos || {}) };
      // El desglose por recurso de ESTE dispositivo se guarda aparte para poder
      // recomponer sin duplicar al mezclar varios dispositivos.
      const porDispositivo: Record<string, Record<string, number>> = desglose.recursos_por_dispositivo || {};
      porDispositivo[deviceId] = bucket.recursos;
      for (const key of Object.keys(recursos)) delete recursos[key];
      for (const mapa of Object.values(porDispositivo)) {
        for (const [k, v] of Object.entries(mapa)) recursos[k] = (recursos[k] || 0) + v;
      }

      const totals = Object.values(dispositivos).reduce(
        (acc, d) => ({ down: acc.down + d.down, up: acc.up + d.up, req: acc.req + d.req }),
        { down: 0, up: 0, req: 0 },
      );

      const payload = {
        empresa_id: empresaId,
        user_id: userId,
        fecha,
        origen,
        bytes_descarga: Math.round(totals.down),
        bytes_subida: Math.round(totals.up),
        peticiones: totals.req,
        desglose: { dispositivos, recursos, recursos_por_dispositivo: porDispositivo },
      };

      if (existing?.id) {
        await supabase.from('consumo_datos').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('consumo_datos').insert(payload);
      }
    } catch {
      return; // se reintenta en el siguiente flush
    }
  }

  dirty = false;
}

export interface UsageDaySummary {
  fecha: string;
  down: number;
  up: number;
  req: number;
  recursos: Record<string, number>;
}

/** Consumo local (este dispositivo) de los últimos N días, más reciente primero. */
export function getLocalUsage(days = 30, origen?: UsageOrigen): UsageDaySummary[] {
  const store = readStore();
  const out: UsageDaySummary[] = [];
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceKey = todayKey(since);

  for (const [fecha, byOrigen] of Object.entries(store)) {
    if (fecha < sinceKey) continue;
    const buckets = origen ? [byOrigen[origen]] : Object.values(byOrigen);
    const agg: UsageDaySummary = { fecha, down: 0, up: 0, req: 0, recursos: {} };
    for (const b of buckets) {
      if (!b) continue;
      agg.down += b.down; agg.up += b.up; agg.req += b.req;
      for (const [k, v] of Object.entries(b.recursos)) agg.recursos[k] = (agg.recursos[k] || 0) + v;
    }
    if (agg.req > 0) out.push(agg);
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
