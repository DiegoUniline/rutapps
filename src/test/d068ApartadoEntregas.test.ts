import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// D-068: el apartado de un pedido descuenta lo que ya va en entregas vigentes.
describe('D-068: apartado descuenta entregas', () => {
  const sql = readFileSync('supabase/migrations/20261126010000_d068_apartado_descuenta_entregas.sql', 'utf8');
  it('aparta solo lo pendiente de entregar', () => {
    expect(sql).toMatch(/v_pendiente := GREATEST\(0, COALESCE\(v_l\.cantidad, 0\) - v_en_entregas\)/);
    expect(sql).toMatch(/e\.status::text NOT IN \('cancelado', 'no_entregado'\)/);
  });
});
