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

/** Format number as currency using empresa's currency (defaults to MXN) */
export function fmtCurrency(value: number | null | undefined, currencyCode?: string | null): string {
  return formatCurrency(value, currencyCode);
}
