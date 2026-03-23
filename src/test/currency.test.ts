import { describe, it, expect } from 'vitest';
import { formatCurrency, getCurrencyConfig, currencySymbol } from '@/lib/currency';

describe('getCurrencyConfig', () => {
  it('returns MXN by default', () => {
    expect(getCurrencyConfig().code).toBe('MXN');
    expect(getCurrencyConfig(null).code).toBe('MXN');
    expect(getCurrencyConfig(undefined).code).toBe('MXN');
  });

  it('returns correct config for USD', () => {
    const cfg = getCurrencyConfig('USD');
    expect(cfg.symbol).toBe('$');
    expect(cfg.locale).toBe('en-US');
  });

  it('falls back to MXN for unknown code', () => {
    expect(getCurrencyConfig('XYZ').code).toBe('MXN');
  });
});

describe('formatCurrency', () => {
  it('formats MXN correctly', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('handles null/undefined as 0', () => {
    expect(formatCurrency(null)).toBe('$0.00');
    expect(formatCurrency(undefined)).toBe('$0.00');
  });

  it('uses PEN symbol', () => {
    expect(formatCurrency(100, 'PEN')).toBe('S/100.00');
  });
});

describe('currencySymbol', () => {
  it('returns $ for MXN', () => {
    expect(currencySymbol('MXN')).toBe('$');
  });

  it('returns € for EUR', () => {
    expect(currencySymbol('EUR')).toBe('€');
  });
});
