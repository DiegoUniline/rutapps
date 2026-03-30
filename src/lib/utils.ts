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
