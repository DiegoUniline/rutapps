import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatCurrency } from "@/lib/currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date string (yyyy-mm-dd or ISO) to dd/MM/yyyy */
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Format a date string to dd/MM/yyyy HH:mm */
export function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/** Format a date string to dd/MM/yyyy in short form: dd MMM yyyy */
export function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format number as currency using empresa's currency (defaults to MXN) */
export function fmtCurrency(value: number | null | undefined, currencyCode?: string | null): string {
  return formatCurrency(value, currencyCode);
}

/** Round a monetary value to 2 decimals, avoiding floating point artifacts */
export function roundMoney(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Format a number with thousand separators (no fixed decimals for integers) */
export function fmtNum(value: number | null | undefined): string {
  if (value == null) return '0';
  const n = Number(value);
  if (Number.isInteger(n)) return n.toLocaleString('es-MX');
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Get today's date string (yyyy-mm-dd) in a given IANA timezone.
 * Falls back to 'America/Mexico_City' if the timezone is invalid.
 */
export function todayInTimezone(tz?: string | null): string {
  const zone = tz || 'America/Mexico_City';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}

/** Minutos de desfase (UTC+X) que tiene `tz` en el instante `date`. */
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value])) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return (asUTC - date.getTime()) / 60000;
}

/**
 * Instante UTC (ISO) del inicio/fin de un día 'yyyy-mm-dd' en una zona horaria.
 * Sirve para filtrar columnas timestamptz por "día local de la empresa".
 */
export function zonedDayRangeISO(ymd: string, tz?: string | null, endYmd?: string): { start: string; end: string } {
  const zone = tz || 'America/Mexico_City';
  const toInstant = (ymdStr: string, endOfDay: boolean): Date => {
    const [y, m, d] = ymdStr.split('-').map(Number);
    const naive = Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
    let guess = new Date(naive);
    for (let i = 0; i < 2; i++) {
      const off = tzOffsetMinutes(guess, zone);
      guess = new Date(naive - off * 60000);
    }
    return guess;
  };
  try {
    return { start: toInstant(ymd, false).toISOString(), end: toInstant(endYmd ?? ymd, true).toISOString() };
  } catch {
    return { start: `${ymd}T00:00:00Z`, end: `${endYmd ?? ymd}T23:59:59Z` };
  }
}

/**
 * Suma días a una fecha 'yyyy-mm-dd' sin drift por zona horaria.
 * (Evita el bug de mezclar setDate local con toISOString UTC.)
 */
export function addDaysToDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Module-level timezone set by AuthContext when empresa loads */
let _empresaTimezone: string = 'America/Mexico_City';

/** Called by AuthContext to keep todayLocal() in sync with the empresa's timezone */
export function setGlobalTimezone(tz: string | null | undefined) {
  _empresaTimezone = tz || 'America/Mexico_City';
}

/**
 * Today's date (yyyy-mm-dd) using the empresa's configured timezone.
 * Falls back to America/Mexico_City if not yet set.
 */
export function todayLocal(): string {
  return todayInTimezone(_empresaTimezone);
}

/** Monday of the current week (yyyy-mm-dd) in the empresa's timezone */
export function weekStartLocal(): string {
  const today = todayLocal();
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 Sun..6 Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
  dt.setUTCDate(dt.getUTCDate() + diff);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Sunday of the current week (yyyy-mm-dd) in the empresa's timezone */
export function weekEndLocal(): string {
  const start = weekStartLocal();
  const [y, m, d] = start.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 6);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Format a date string to "d 'de' MMMM yyyy" in Mexico timezone (avoids UTC offset shifting the day) */
export function fmtDateLongMx(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const dateOnly = dateStr.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12))
    : new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
