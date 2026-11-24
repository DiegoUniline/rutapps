// Compra en borrador abierta desde el celular: el botón Confirmar debe verse, igual que en computadora.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ movil: true }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => estado.movil }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ fmt: (n: number) => String(n) }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ empresa: { id: 'e1' } }) }));
vi.mock('@/lib/ordenCompraPdf', () => ({ downloadOrdenCompraPdf: vi.fn(), downloadOrdenCompraExcel: vi.fn() }));

import { CompraHeader } from '@/pages/CompraForm/CompraHeader';

const props = (extra: Record<string, unknown> = {}) => ({
  form: { id: 'c1', folio: 'OC-1', status: 'borrador', condicion_pago: 'contado' },
  isNew: false, isEditable: true, editingExisting: false, saving: false, cancelling: false, dirty: false,
  totalPagado: 0, totals: { total: 100 }, saldoActual: 100, hayPendienteRecibir: true,
  confirmDialog: null, setConfirmDialog: vi.fn(), handleSave: vi.fn(), beginEditing: vi.fn(), cancelEditing: vi.fn(),
  handleDelete: vi.fn(), handleStatusChange: vi.fn(), handleCancel: vi.fn(), recibirTodoPendiente: vi.fn(),
  requestPin: vi.fn(), onBack: vi.fn(), onRegistrarPago: vi.fn(), ...extra,
});

describe('Compra borrador: Confirmar en celular', () => {
  let container: HTMLDivElement;
  let root: Root;
  const botones = () => Array.from(container.querySelectorAll('button')).map(b => (b.textContent ?? '').trim());

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('celular: borrador guardado muestra Confirmar junto a Guardar', () => {
    estado.movil = true;
    act(() => root.render(<CompraHeader {...(props() as any)} />));
    expect(botones()).toContain('Confirmar');
    expect(botones()).toContain('Guardar');
  });

  it('computadora: también lo muestra (paridad)', () => {
    estado.movil = false;
    act(() => root.render(<CompraHeader {...(props() as any)} />));
    expect(botones()).toContain('Confirmar');
  });

  it('celular: compra nueva sin guardar no muestra Confirmar', () => {
    estado.movil = true;
    act(() => root.render(<CompraHeader {...(props({ isNew: true, form: { status: 'borrador' } }) as any)} />));
    expect(botones()).not.toContain('Confirmar');
  });

  it('celular: editando una compra confirmada no muestra Confirmar', () => {
    estado.movil = true;
    act(() => root.render(<CompraHeader {...(props({ editingExisting: true, form: { id: 'c1', status: 'confirmada' } }) as any)} />));
    expect(botones()).not.toContain('Confirmar');
  });
});
