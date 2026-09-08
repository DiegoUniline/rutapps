import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_SEGMENTS,
  CUSTOMER_SEGMENT_INFO,
  customerAction,
  isCustomerSegment,
  numericChange,
} from '@/lib/customerIntelligence';

describe('customer intelligence helpers', () => {
  it('defines UI metadata for every database segment', () => {
    expect(CUSTOMER_SEGMENTS).toHaveLength(9);
    for (const segment of CUSTOMER_SEGMENTS) {
      expect(CUSTOMER_SEGMENT_INFO[segment].label).toBeTruthy();
      expect(CUSTOMER_SEGMENT_INFO[segment].description).toBeTruthy();
      expect(CUSTOMER_SEGMENT_INFO[segment].color).toMatch(/^#/);
    }
  });

  it('rejects unknown segment values', () => {
    expect(isCustomerSegment('bajando')).toBe(true);
    expect(isCustomerSegment('inventado')).toBe(false);
    expect(isCustomerSegment(null)).toBe(false);
  });

  it('calculates comparable growth and decline percentages', () => {
    expect(numericChange(75, 100)).toBe(-25);
    expect(numericChange(125, 100)).toBe(25);
    expect(numericChange(10, 0)).toBe(100);
    expect(numericChange(0, 0)).toBeNull();
  });

  it('turns overdue risk into a concrete action', () => {
    expect(customerAction('en_riesgo', 8)).toContain('8 días');
    expect(customerAction('bajando')).toContain('productos');
    expect(customerAction('nuevo')).toContain('segunda compra');
  });
});
