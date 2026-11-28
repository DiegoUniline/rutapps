import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// D-071: el total de existencias en productos se recalcula al cerrar la operación y solo si cambió.
describe('D-071: total de existencias en productos', () => {
  const sql = readFileSync('supabase/migrations/20261128010000_d071_stock_total_productos.sql', 'utf8');
  it('solo escribe si cambió', () => {
    expect(sql).toMatch(/WHERE id = v_producto_id AND cantidad IS DISTINCT FROM v_total/);
  });
  it('trigger diferido al cerrar la operación', () => {
    expect(sql).toMatch(/CREATE CONSTRAINT TRIGGER trg_recalc_stock_total_almacen[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  });
});
