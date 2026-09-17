import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VentaPresentacion, VentaPresentacionEditor } from '@/components/venta/VentaPresentacion';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/hooks/usePresentaciones', () => ({ usePresentaciones: query }));
const box = { id: 'box', nombre: 'Caja', activo: true, factor_base: 12, producto_id: 'p' };

describe('admin presentation UI shared by desktop and mobile', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    query.mockReturnValue({ data: [box, { ...box, id: 'old', nombre: 'Anterior', activo: false }], isLoading: false });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows persisted presentation and base units without requesting a catalog', () => {
    query.mockClear();
    act(() => root.render(<VentaPresentacion line={{ presentacion_nombre: 'Caja', presentacion_factor: 12, paquetes: 2, cantidad: 24 }} unit="pz" />));
    expect(container.textContent).toBe('2 × Caja (12 pz c/u) · 24 pz');
    expect(query).not.toHaveBeenCalled();
    expect(container.querySelector('input, select')).toBeNull();
  });

  it('loads product-specific choices and passes the selected presentation to the form', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    act(() => root.render(<VentaPresentacionEditor line={{ producto_id: 'p', cantidad: 1 }} idx={2} unit="pz" disabled={false} onChange={onChange} onUpdateLine={vi.fn()} />));
    expect(query).toHaveBeenCalledWith('p');
    expect(container.textContent).toContain('Caja · 12 pz');
    expect(container.textContent).not.toContain('Anterior');
    const select = container.querySelector('select')!;
    await act(async () => { select.value = 'box'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith(2, box);
  });

  it('shows an inactive historical selection and respects disabled editing', () => {
    act(() => root.render(<VentaPresentacionEditor line={{ producto_id: 'p', presentacion_id: 'old', presentacion_nombre: 'Anterior', presentacion_factor: 12, paquetes: 2, cantidad: 24 }} idx={0} unit="pz" disabled onChange={vi.fn()} onUpdateLine={vi.fn()} />));
    expect(container.querySelector('select')?.value).toBe('old');
    expect(container.textContent).toContain('Anterior (inactiva)');
    expect(container.querySelector('select')?.disabled).toBe(true);
    expect(container.querySelector('input')?.disabled).toBe(true);
  });
});
