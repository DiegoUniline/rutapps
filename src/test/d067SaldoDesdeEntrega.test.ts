import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// D-067: el saldo de un pedido «a lo entregado» nace al generar la entrega (no solo al validarla).
describe('D-067: saldo desde que se genera la entrega', () => {
  const sql = readFileSync('supabase/migrations/20261125010000_d067_saldo_desde_entrega.sql', 'utf8');
  it('cuenta toda entrega salvo cancelada o no entregada', () => {
    expect(sql).toMatch(/e\.status::text NOT IN \('cancelado', 'no_entregado'\)/);
    expect(sql).not.toMatch(/e\.status::text = 'hecho'\s*\n\s*AND el\.producto_id/);
  });
  it('recalcula el pedido al borrar entrega o renglón', () => {
    expect(sql).toMatch(/AFTER DELETE ON public\.entregas/);
    expect(sql).toMatch(/AFTER DELETE ON public\.entrega_lineas/);
  });
});
