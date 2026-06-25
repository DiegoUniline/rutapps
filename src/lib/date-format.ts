/**
 * Date helpers — timezone America/Cancun fijo (UTC-5, sin DST).
 * Formato display: dd/mm/aaaa. Formato ISO interno: yyyy-mm-dd.
 */

const CANCUN_OFFSET_HOURS = -5;

/** Normaliza a yyyy-mm-dd. Acepta Date, ISO string, dd/mm/aaaa o yyyy-mm-dd. */
export function normalizeDateISO(input: Date | string | null | undefined): string {
  if (!input) return '';
  if (input instanceof Date) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(input).trim();
  if (!s) return '';
  // dd/mm/aaaa
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // yyyy-mm-dd (allow trailing time)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // fallback Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return normalizeDateISO(d);
  return '';
}

/** Formatea a dd/mm/aaaa. */
export function formatDateDMY(input: Date | string | null | undefined): string {
  const iso = normalizeDateISO(input);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Parsea dd/mm/aaaa -> Date local (mediodía para evitar saltos de TZ). */
export function parseDMY(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** ¿está la fecha (cualquier formato) dentro del rango [from, to] inclusive? */
export function isDateInRangeISO(
  date: Date | string | null | undefined,
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): boolean {
  const v = normalizeDateISO(date);
  if (!v) return false;
  const f = normalizeDateISO(from);
  const t = normalizeDateISO(to);
  if (f && v < f) return false;
  if (t && v > t) return false;
  return true;
}

/**
 * Devuelve los timestamps UTC ISO que representan el inicio del día `from`
 * y el fin del día `to` en zona horaria America/Cancun (UTC-5).
 * Útil para .gte()/.lte() en columnas timestamptz.
 */
export function dateRangeCancunTimestamps(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): { gte: string | null; lte: string | null } {
  const offsetMs = CANCUN_OFFSET_HOURS * 60 * 60 * 1000;
  const fromIso = normalizeDateISO(from);
  const toIso = normalizeDateISO(to);
  let gte: string | null = null;
  let lte: string | null = null;
  if (fromIso) {
    // 00:00:00 Cancun = 05:00:00 UTC
    const t = Date.parse(`${fromIso}T00:00:00Z`) - offsetMs;
    gte = new Date(t).toISOString();
  }
  if (toIso) {
    const t = Date.parse(`${toIso}T23:59:59.999Z`) - offsetMs;
    lte = new Date(t).toISOString();
  }
  return { gte, lte };
}
