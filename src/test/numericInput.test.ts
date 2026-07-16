import { describe, it, expect } from 'vitest';
import { toPayloadNumber, toRequiredNumber } from '@/lib/numericInput';

describe('toPayloadNumber', () => {
  it('null/empty → null by default', () => {
    expect(toPayloadNumber(null)).toBeNull();
    expect(toPayloadNumber(undefined)).toBeNull();
    expect(toPayloadNumber('')).toBeNull();
  });
  it('null/empty → 0 with defaultZero', () => {
    expect(toPayloadNumber(null, { defaultZero: true })).toBe(0);
    expect(toPayloadNumber('', { defaultZero: true })).toBe(0);
  });
  it('NaN → null (never NaN)', () => {
    expect(toPayloadNumber('abc' as any)).toBeNull();
    expect(toPayloadNumber(NaN)).toBeNull();
  });
  it('numbers pass through', () => {
    expect(toPayloadNumber(0)).toBe(0);
    expect(toPayloadNumber(1.5)).toBe(1.5);
    expect(toPayloadNumber('2.5')).toBe(2.5);
  });
});

describe('toRequiredNumber', () => {
  it('falls back to 0', () => {
    expect(toRequiredNumber(null)).toBe(0);
    expect(toRequiredNumber('')).toBe(0);
    expect(toRequiredNumber('abc' as any)).toBe(0);
  });
  it('respects real values including 0', () => {
    expect(toRequiredNumber(0)).toBe(0);
    expect(toRequiredNumber(42)).toBe(42);
  });
});
