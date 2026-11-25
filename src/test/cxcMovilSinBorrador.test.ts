import { describe, it, expect } from 'vitest';
import { isMobileReceivable, getMobileReceivables } from '@/lib/mobileReceivables';

// 2026-11-25: en CxC del celular aparecía un pedido en borrador (Multi, PED-0189) como saldo pendiente.
describe('CxC móvil: solo documentos confirmados', () => {
  const base = { id: 'v1', cliente_id: 'c1', saldo_pendiente: 122, fecha: '2026-09-01' };
  it('borrador y cancelado no cuentan', () => {
    expect(isMobileReceivable({ ...base, status: 'borrador' })).toBe(false);
    expect(isMobileReceivable({ ...base, status: 'cancelado' })).toBe(false);
  });
  it('confirmado, entregado y facturado sí', () => {
    for (const status of ['confirmado', 'entregado', 'facturado']) {
      expect(isMobileReceivable({ ...base, status })).toBe(true);
    }
  });
  it('la lista del cliente omite el borrador', () => {
    const r = getMobileReceivables([{ ...base, status: 'borrador' }, { ...base, id: 'v2', status: 'entregado' }], 'c1');
    expect(r.map(x => x.id)).toEqual(['v2']);
  });
});
