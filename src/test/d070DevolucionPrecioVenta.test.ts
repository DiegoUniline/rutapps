import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { precioPorPiezaDeVenta } from '@/lib/devolucionPrecio';

// D-070: devolución desde una venta → precio por pieza de esa venta (Tampico PED-12045, Caja 20 pz a $248).
describe('D-070: precio de devolución desde la venta', () => {
  it('caja de 20 a $248 → $12.40 por pieza', () => {
    const m = precioPorPiezaDeVenta([{ producto_id: 'veladora', cantidad: 20, total: 248 }]);
    expect(m.get('veladora')).toBe(12.4);
  });
  it('varios renglones del mismo producto se promedian; sin cantidad no entra', () => {
    const m = precioPorPiezaDeVenta([
      { producto_id: 'a', cantidad: 20, total: 248 },
      { producto_id: 'a', cantidad: 5, total: 64.5 },
      { producto_id: 'b', cantidad: 0, total: 0 },
    ]);
    expect(m.get('a')).toBe(12.5);
    expect(m.has('b')).toBe(false);
  });
  it('el modal usa el precio de la venta y cae a la lista para lo demás', () => {
    const src = readFileSync('src/components/venta/DevolucionVentaModal.tsx', 'utf8');
    expect(src).toMatch(/precioVenta\.get\(p\.id\) \?\? precioLista\(p\)/);
  });
});
