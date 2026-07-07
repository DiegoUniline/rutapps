import { RUTA_DIAS, normalizeRutaDia } from './rutaDays';

/**
 * Returns the next date (YYYY-MM-DD) that matches any of the client's
 * `dia_visita` weekdays. If the client has no configured days, returns tomorrow.
 * `from` defaults to today; the search always starts from the next day.
 */
export function nextVisitDate(dias?: string[] | null, from: Date = new Date()): string {
  const set = new Set((dias ?? []).map(normalizeRutaDia).filter(Boolean));
  const base = new Date(from);
  base.setHours(12, 0, 0, 0);

  for (let i = 1; i <= 14; i++) {
    const cand = new Date(base);
    cand.setDate(base.getDate() + i);
    const dayName = normalizeRutaDia(RUTA_DIAS[cand.getDay()]);
    if (set.size === 0 || set.has(dayName)) {
      return toISODate(cand);
    }
  }
  const fallback = new Date(base);
  fallback.setDate(base.getDate() + 1);
  return toISODate(fallback);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
