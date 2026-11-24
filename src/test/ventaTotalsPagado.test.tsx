// «Pagado» en los totales de la venta (web): sale de los cobros reales, nunca de total − saldo.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ fmt: (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}` }) }));

import { VentaTotals } from '@/components/venta/VentaTotals';

const base = { subtotal: 115, descuento_total: 0, iva_total: 0, ieps_total: 0, total: 115, isMobile: true };

describe('VentaTotals: Pagado', () => {
  let container: HTMLDivElement;
  let root: Root;
  const texto = () => container.textContent ?? '';
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('venta nueva (sin pagos ni saldo): no muestra «Pagado»', () => {
    act(() => root.render(<VentaTotals {...base} />));
    expect(texto()).not.toMatch(/Pagado/);
  });

  it('venta guardada sin cobros: Pagado $0.00 y saldo pendiente por el total', () => {
    act(() => root.render(<VentaTotals {...base} saldoPendiente={115} totalPagado={0} />));
    expect(texto()).toMatch(/Pagado\$0\.00/);
    expect(texto()).toMatch(/Saldo pendiente\$115\.00/);
  });

  it('saldo 0 sin cobros (pedido por entregado / total guardado desfasado): no aparenta pagado', () => {
    act(() => root.render(<VentaTotals {...base} saldoPendiente={0} totalPagado={0} />));
    expect(texto()).toMatch(/Pagado\$0\.00/);
    expect(texto()).not.toMatch(/Pagado\$115/);
  });

  it('venta pagada: Pagado por lo cobrado', () => {
    act(() => root.render(<VentaTotals {...base} saldoPendiente={0} totalPagado={115} />));
    expect(texto()).toMatch(/Pagado\$115\.00/);
  });
});
