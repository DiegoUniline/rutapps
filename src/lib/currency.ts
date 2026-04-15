/**
 * Multi-currency support.
 * Each empresa picks a currency; it propagates to all documents.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
  name: string;
  /** Nombre de la unidad monetaria en plural para "importe con letra" */
  wordPlural: string;
}

export const CURRENCIES: CurrencyConfig[] = [
  // América
  { code: 'MXN', symbol: '$',  locale: 'es-MX', name: 'Peso mexicano', wordPlural: 'PESOS' },
  { code: 'USD', symbol: '$',  locale: 'en-US', name: 'Dólar estadounidense', wordPlural: 'DÓLARES' },
  { code: 'COP', symbol: '$',  locale: 'es-CO', name: 'Peso colombiano', wordPlural: 'PESOS' },
  { code: 'ARS', symbol: '$',  locale: 'es-AR', name: 'Peso argentino', wordPlural: 'PESOS' },
  { code: 'CLP', symbol: '$',  locale: 'es-CL', name: 'Peso chileno', wordPlural: 'PESOS' },
  { code: 'PEN', symbol: 'S/', locale: 'es-PE', name: 'Sol peruano', wordPlural: 'SOLES' },
  { code: 'BOB', symbol: 'Bs', locale: 'es-BO', name: 'Boliviano', wordPlural: 'BOLIVIANOS' },
  { code: 'UYU', symbol: '$U', locale: 'es-UY', name: 'Peso uruguayo', wordPlural: 'PESOS' },
  { code: 'PYG', symbol: '₲',  locale: 'es-PY', name: 'Guaraní paraguayo', wordPlural: 'GUARANÍES' },
  { code: 'CRC', symbol: '₡',  locale: 'es-CR', name: 'Colón costarricense', wordPlural: 'COLONES' },
  { code: 'GTQ', symbol: 'Q',  locale: 'es-GT', name: 'Quetzal guatemalteco', wordPlural: 'QUETZALES' },
  { code: 'HNL', symbol: 'L',  locale: 'es-HN', name: 'Lempira hondureño', wordPlural: 'LEMPIRAS' },
  { code: 'NIO', symbol: 'C$', locale: 'es-NI', name: 'Córdoba nicaragüense', wordPlural: 'CÓRDOBAS' },
  { code: 'PAB', symbol: 'B/', locale: 'es-PA', name: 'Balboa panameño', wordPlural: 'BALBOAS' },
  { code: 'DOP', symbol: 'RD$',locale: 'es-DO', name: 'Peso dominicano', wordPlural: 'PESOS' },
  { code: 'VES', symbol: 'Bs', locale: 'es-VE', name: 'Bolívar venezolano', wordPlural: 'BOLÍVARES' },
  // Europa
  { code: 'EUR', symbol: '€',  locale: 'es-ES', name: 'Euro', wordPlural: 'EUROS' },
];

const currencyMap = new Map(CURRENCIES.map(c => [c.code, c]));

export function getCurrencyConfig(code?: string | null): CurrencyConfig {
  return currencyMap.get(code ?? 'MXN') ?? CURRENCIES[0];
}

/**
 * Format a number as currency using the empresa's currency config.
 * @param value  The numeric amount
 * @param code   Currency code (e.g. 'MXN', 'USD'). Defaults to 'MXN'.
 */
export function formatCurrency(value: number | null | undefined, code?: string | null): string {
  if (value == null) value = 0;
  const cfg = getCurrencyConfig(code);
  return cfg.symbol + Number(value).toLocaleString(cfg.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a number with max 2 decimal places for display (no currency symbol).
 * Use this instead of raw .toLocaleString() for monetary values.
 */
export function fmtMoney(value: number | null | undefined): string {
  if (value == null) return '0';
  return Number(value).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Get just the currency symbol for inline use.
 */
export function currencySymbol(code?: string | null): string {
  return getCurrencyConfig(code).symbol;
}
