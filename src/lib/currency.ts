/**
 * Multi-currency support.
 * Each empresa picks a currency; it propagates to all documents.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
  name: string;
}

export const CURRENCIES: CurrencyConfig[] = [
  // América
  { code: 'MXN', symbol: '$',  locale: 'es-MX', name: 'Peso mexicano' },
  { code: 'USD', symbol: '$',  locale: 'en-US', name: 'Dólar estadounidense' },
  { code: 'COP', symbol: '$',  locale: 'es-CO', name: 'Peso colombiano' },
  { code: 'ARS', symbol: '$',  locale: 'es-AR', name: 'Peso argentino' },
  { code: 'CLP', symbol: '$',  locale: 'es-CL', name: 'Peso chileno' },
  { code: 'PEN', symbol: 'S/', locale: 'es-PE', name: 'Sol peruano' },
  { code: 'BOB', symbol: 'Bs', locale: 'es-BO', name: 'Boliviano' },
  { code: 'UYU', symbol: '$U', locale: 'es-UY', name: 'Peso uruguayo' },
  { code: 'PYG', symbol: '₲',  locale: 'es-PY', name: 'Guaraní paraguayo' },
  { code: 'CRC', symbol: '₡',  locale: 'es-CR', name: 'Colón costarricense' },
  { code: 'GTQ', symbol: 'Q',  locale: 'es-GT', name: 'Quetzal guatemalteco' },
  { code: 'HNL', symbol: 'L',  locale: 'es-HN', name: 'Lempira hondureño' },
  { code: 'NIO', symbol: 'C$', locale: 'es-NI', name: 'Córdoba nicaragüense' },
  { code: 'PAB', symbol: 'B/', locale: 'es-PA', name: 'Balboa panameño' },
  { code: 'DOP', symbol: 'RD$',locale: 'es-DO', name: 'Peso dominicano' },
  { code: 'VES', symbol: 'Bs', locale: 'es-VE', name: 'Bolívar venezolano' },
  // Europa
  { code: 'EUR', symbol: '€',  locale: 'es-ES', name: 'Euro' },
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
  return cfg.symbol + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Get just the currency symbol for inline use.
 */
export function currencySymbol(code?: string | null): string {
  return getCurrencyConfig(code).symbol;
}
