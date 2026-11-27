import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// D-069: cerrar a lo entregado deja el pedido Entregado; reabrir recalcula el estado.
describe('D-069: pedido cerrado a lo entregado', () => {
  const sql = readFileSync('supabase/migrations/20261127010000_d069_pedido_cerrado_entregado.sql', 'utf8');
  it('cerrar promueve Confirmado a Entregado', () => {
    expect(sql).toMatch(/SET status\s+= CASE WHEN status::text = 'confirmado' THEN 'entregado'::status_venta ELSE status END/);
  });
  it('reabrir recalcula el estado desde las entregas', () => {
    expect(sql).toMatch(/PERFORM public\.fn_sync_status_pedido\(p_venta_id\);\s*END;/);
  });
});
