/**
 * Banderas de funciones (feature flags) por licencia de empresa.
 *
 * El Super Admin decide, desde el Panel Master > "Funciones en pruebas",
 * qué empresas ven cada función nueva:
 *   - alcance = 'nadie'      -> nadie la ve (apagada)
 *   - alcance = 'licencias'  -> solo las licencias listadas
 *   - alcance = 'todos'      -> todas las empresas
 *
 * Este módulo mantiene un caché en memoria para que el código no-React
 * (guardado de ventas, cola offline, etc.) pueda consultar el estado sin
 * hacer una petición extra.
 */

export type FeatureFlagAlcance = 'nadie' | 'licencias' | 'todos';

export interface FeatureFlag {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  notas_prueba: string | null;
  alcance: FeatureFlagAlcance;
  licencias: string[];
  created_at?: string;
  updated_at?: string;
}

const CACHE_KEY = 'feature_flags_cache_v1';

let cache: FeatureFlag[] = [];

try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
  if (raw) cache = JSON.parse(raw);
} catch {
  cache = [];
}

export function setFeatureFlagsCache(flags: FeatureFlag[]) {
  cache = Array.isArray(flags) ? flags : [];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}

export function getFeatureFlagsCache(): FeatureFlag[] {
  return cache;
}

const norm = (v?: string | null) => String(v ?? '').trim();

/** ¿La licencia dada tiene habilitada la función `clave`? */
export function isFeatureEnabled(clave: string, licencia?: string | null): boolean {
  const flag = cache.find((f) => f.clave === clave);
  if (!flag) return false;
  if (flag.alcance === 'todos') return true;
  if (flag.alcance === 'nadie') return false;
  const lic = norm(licencia);
  return !!lic && (flag.licencias || []).map(norm).includes(lic);
}
