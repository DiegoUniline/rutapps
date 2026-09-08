import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_SEGMENTS,
  CUSTOMER_SEGMENT_INFO,
  customerAction,
  isCustomerSegment,
  numericChange,
  summarizeCustomerProducts,
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

  it('reveals revenue gaps by category without changing product calculations', () => {
    const result = summarizeCustomerProducts([
      { id: '1', category_name: 'Bebidas', brand_name: 'A', previous_qty: 10, recent_qty: 0, previous_total: 500, recent_total: 0, trend: 'detenido' },
      { id: '2', category_name: 'Bebidas', brand_name: 'B', previous_qty: 10, recent_qty: 5, previous_total: 300, recent_total: 150, trend: 'bajando' },
      { id: '3', category_name: 'Botanas', brand_name: 'A', previous_qty: 5, recent_qty: 10, previous_total: 100, recent_total: 200, trend: 'creciendo' },
    ], 'category');

    expect(result[0]).toMatchObject({
      name: 'Bebidas', products: 2, stopped_products: 1,
      declining_products: 1, previous_total: 800, recent_total: 150,
      revenue_gap: 650,
    });
    expect(result[0].change_pct).toBeCloseTo(-81.25);
  });

  it('keeps uncatalogued products visible in dimension analysis', () => {
    const result = summarizeCustomerProducts([
      { id: '1', previous_qty: 1, recent_qty: 1, previous_total: 20, recent_total: 20, trend: 'estable' },
    ], 'brand');
    expect(result[0].name).toBe('Sin marca');
  });
});
