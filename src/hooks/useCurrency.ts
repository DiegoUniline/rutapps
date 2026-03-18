import { useAuth } from '@/contexts/AuthContext';
import { getCurrencyConfig, formatCurrency, currencySymbol, type CurrencyConfig } from '@/lib/currency';

/**
 * Hook to get the current empresa's currency configuration.
 * Returns helpers: fmt(value), symbol, code, config.
 */
export function useCurrency() {
  const { empresa } = useAuth();
  const code = empresa?.moneda ?? 'MXN';
  const config: CurrencyConfig = getCurrencyConfig(code);

  return {
    code,
    symbol: config.symbol,
    config,
    /** Format a number using the empresa's currency */
    fmt: (value: number | null | undefined) => formatCurrency(value, code),
    /** Just the symbol, e.g. '$', '€', 'S/' */
    currencySymbol: config.symbol,
  };
}
