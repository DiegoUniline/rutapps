import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuscadorProductoMovil, type ProductoBuscable } from '@/components/productos/BuscadorProductoMovil';

const productos: ProductoBuscable[] = [
  { id: 'a', codigo: 'SKU-01', nombre: 'Agua Mineral 600 ml' },
  { id: 'b', codigo: 'SKU-02', nombre: 'Refresco Cola 2 L' },
  { id: 'c', codigo: 'ACE-9', nombre: 'Aceite Vegetal 1 L' },
];
const existencias: Record<string, number> = { a: 0, b: 148, c: 37 };
const fmt = (v: number) => `$${v.toFixed(2)}`;

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const click = (el: Element | null | undefined) => { if (!el) throw new Error('elemento no encontrado'); (el as HTMLElement).click(); };
const byText = (text: string) => Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes(text));
const overlay = () => document.body.querySelector('[role="dialog"]');
const filas = () => Array.from(overlay()?.querySelectorAll('button[aria-expanded]') ?? []);

describe('BuscadorProductoMovil (D-038)', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = (props: Partial<Parameters<typeof BuscadorProductoMovil>[0]> = {}) => {
    const onAgregar = props.onAgregar ?? vi.fn();
    act(() => root.render(
      <BuscadorProductoMovil
        productos={productos}
        modo="compra"
        fmt={fmt}
        getExistencia={p => existencias[p.id]}
        getPrecio={() => 10}
        puedeEditarPrecio
        {...props}
        onAgregar={onAgregar}
      />,
    ));
    act(() => click(byText('Buscar producto')));
    return onAgregar;
  };

  it('abre a pantalla completa y filtra por nombre o código', () => {
    render();
    expect(overlay()).not.toBeNull();
    expect(filas()).toHaveLength(3);
    const input = overlay()!.querySelector('input[type="search"]') as HTMLInputElement;
    act(() => setInput(input, 'refresco'));
    expect(filas()).toHaveLength(1);
    expect(filas()[0].textContent).toContain('Refresco Cola 2 L');
    act(() => setInput(input, 'ace-9'));
    expect(filas()).toHaveLength(1);
    expect(filas()[0].textContent).toContain('Aceite');
    act(() => setInput(input, 'zzz'));
    expect(filas()).toHaveLength(0);
    expect(overlay()!.textContent).toContain('Sin resultados');
  });

  it('muestra la existencia en verde si hay y en rojo si no', () => {
    render();
    const pillAgua = filas()[0].querySelector('.rounded-full');
    const pillRefresco = filas()[1].querySelector('.rounded-full');
    expect(pillAgua?.className).toContain('text-destructive');
    expect(pillRefresco?.className).toContain('text-success');
    expect(pillRefresco?.textContent).toContain('148');
  });

  it('al tocar un producto despliega el editor debajo de ese renglón', () => {
    render();
    expect(byText('Agregar')).toBeUndefined();
    act(() => click(filas()[1]));
    expect(filas()[1].getAttribute('aria-expanded')).toBe('true');
    const item = filas()[1].parentElement!;
    expect(item.querySelector('#buscador-cant-b')).not.toBeNull();
    expect(Array.from(item.querySelectorAll('button')).some(b => b.textContent === 'Agregar')).toBe(true);
  });

  it('− no baja de 1 y + suma de uno en uno', () => {
    render();
    act(() => click(filas()[1]));
    const cant = () => (document.getElementById('buscador-cant-b') as HTMLInputElement).value;
    expect(cant()).toBe('1');
    act(() => click(document.body.querySelector('[aria-label="Menos"]')));
    expect(cant()).toBe('1');
    act(() => click(document.body.querySelector('[aria-label="Más"]')));
    act(() => click(document.body.querySelector('[aria-label="Más"]')));
    expect(cant()).toBe('3');
    act(() => click(document.body.querySelector('[aria-label="Menos"]')));
    expect(cant()).toBe('2');
  });

  it('Agregar llama al callback con cantidad, presentación y precio, y cierra el buscador', () => {
    const onAgregar = render({
      getPresentaciones: p => (p.id === 'b' ? [{ id: 'caja', nombre: 'Caja', factor: 8 }] : []),
      getPrecio: (_p, pres) => (pres ? 9 : 10),
    });
    act(() => click(filas()[1]));
    act(() => click(document.body.querySelector('[aria-label="Más"]')));
    act(() => click(Array.from(document.body.querySelectorAll('[role="group"] button')).find(b => b.textContent?.startsWith('Caja'))));
    const precio = document.getElementById('buscador-precio-b') as HTMLInputElement;
    expect(precio.value).toBe('9');
    act(() => setInput(precio, '8.5'));
    act(() => click(byText('Agregar')));
    expect(onAgregar).toHaveBeenCalledTimes(1);
    expect(onAgregar).toHaveBeenCalledWith({
      producto: productos[1],
      cantidad: 2,
      presentacion: { id: 'caja', nombre: 'Caja', factor: 8 },
      precio: 8.5,
    });
    expect(overlay()).toBeNull();
    expect(byText('Buscar producto')).toBeDefined();
  });

  it('si el formulario rechaza (false) el buscador sigue abierto', () => {
    const onAgregar = render({ onAgregar: vi.fn(() => false) });
    act(() => click(filas()[0]));
    act(() => click(byText('Agregar')));
    expect(onAgregar).toHaveBeenCalled();
    expect(overlay()).not.toBeNull();
  });

  it('sin permiso el precio no es editable; en traspaso no hay precio', () => {
    render({ modo: 'venta', puedeEditarPrecio: false });
    act(() => click(filas()[1]));
    expect(document.getElementById('buscador-precio-b')).toBeNull();
    expect(overlay()!.textContent).toContain('$10.00');
    act(() => root.unmount());
    root = createRoot(container);
    const onAgregar = render({ modo: 'traspaso' });
    act(() => click(filas()[2]));
    expect(document.getElementById('buscador-precio-c')).toBeNull();
    expect(overlay()!.textContent).toContain('disponible 37');
    act(() => click(byText('Agregar')));
    expect(onAgregar).toHaveBeenCalledWith(expect.objectContaining({ precio: 0, cantidad: 1, presentacion: null }));
  });
});
