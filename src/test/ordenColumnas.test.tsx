import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Orden de columnas por usuario (listas de Productos y Clientes): mover columnas, conservar el
 * orden guardado cuando se agregan o quitan columnas, y guardarlo en localStorage + perfil (BD).
 */

const rpc = vi.fn((..._args: unknown[]) => Promise.resolve({ error: null }));
let uiPrefs: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, profile: { ui_prefs: uiPrefs } }),
}));

import {
  mergeColumnOrder, moveColumnKey, moveColumnToKey, loadColumnOrder, saveColumnOrder, useColumnPreferences,
} from '@/hooks/useColumnPreferences';

const KEYS = ['codigo', 'nombre', 'precio', 'status'];

describe('mergeColumnOrder', () => {
  it('sin orden guardado usa el orden por omisión', () => {
    expect(mergeColumnOrder(null, KEYS)).toEqual(KEYS);
    expect(mergeColumnOrder(undefined, KEYS)).toEqual(KEYS);
    expect(mergeColumnOrder('basura', KEYS)).toEqual(KEYS);
  });

  it('conserva el orden guardado y agrega al final las columnas nuevas', () => {
    expect(mergeColumnOrder(['status', 'nombre'], KEYS)).toEqual(['status', 'nombre', 'codigo', 'precio']);
  });

  it('ignora columnas que ya no existen, duplicadas o que no son texto', () => {
    expect(mergeColumnOrder(['precio', 'vieja', 'precio', 3, 'codigo'], KEYS)).toEqual(['precio', 'codigo', 'nombre', 'status']);
  });
});

describe('mover columnas', () => {
  it('sube y baja una posición', () => {
    expect(moveColumnKey(KEYS, 'precio', -1)).toEqual(['codigo', 'precio', 'nombre', 'status']);
    expect(moveColumnKey(KEYS, 'codigo', 1)).toEqual(['nombre', 'codigo', 'precio', 'status']);
  });

  it('en los extremos o con clave desconocida no cambia (misma referencia)', () => {
    expect(moveColumnKey(KEYS, 'codigo', -1)).toBe(KEYS);
    expect(moveColumnKey(KEYS, 'status', 1)).toBe(KEYS);
    expect(moveColumnKey(KEYS, 'nada', 1)).toBe(KEYS);
  });

  it('arrastrar: coloca la columna en el lugar de otra', () => {
    expect(moveColumnToKey(KEYS, 'status', 'codigo')).toEqual(['status', 'codigo', 'nombre', 'precio']);
    expect(moveColumnToKey(KEYS, 'codigo', 'precio')).toEqual(['nombre', 'precio', 'codigo', 'status']);
    expect(moveColumnToKey(KEYS, 'codigo', 'codigo')).toBe(KEYS);
  });
});

describe('persistencia local', () => {
  beforeEach(() => localStorage.clear());

  it('guarda, lee y restablece (null borra)', () => {
    expect(loadColumnOrder('u-1_productos')).toBeNull();
    saveColumnOrder('u-1_productos', ['precio', 'codigo']);
    expect(loadColumnOrder('u-1_productos')).toEqual(['precio', 'codigo']);
    saveColumnOrder('u-1_productos', null);
    expect(loadColumnOrder('u-1_productos')).toBeNull();
  });

  it('un valor dañado no rompe la lista', () => {
    localStorage.setItem('col_order_v1_u-1_productos', '{no-json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadColumnOrder('u-1_productos')).toBeNull();
    warn.mockRestore();
  });
});

describe('useColumnPreferences: orden por usuario', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ReturnType<typeof useColumnPreferences>;
  const DEFAULTS = { codigo: true, nombre: true, precio: true, status: true };

  function Probe({ defaults }: { defaults: Record<string, boolean> }) {
    api = useColumnPreferences('productos', defaults);
    return null;
  }
  const render = (defaults: Record<string, boolean> = DEFAULTS) => act(() => root.render(<Probe defaults={defaults} />));
  const flush = () => act(async () => { await Promise.resolve(); });

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    rpc.mockClear();
    uiPrefs = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('mueve, guarda en localStorage y en el perfil (BD) con su propia clave', async () => {
    render();
    expect(api.columnOrder).toEqual(KEYS);
    act(() => api.moveColumn('precio', -1));
    await flush();
    expect(api.columnOrder).toEqual(['codigo', 'precio', 'nombre', 'status']);
    expect(loadColumnOrder('u-1_productos')).toEqual(['codigo', 'precio', 'nombre', 'status']);
    expect(rpc).toHaveBeenCalledWith('set_ui_pref', { p_key: 'colsorder_productos', p_value: ['codigo', 'precio', 'nombre', 'status'] });
    // La visibilidad sigue usando su clave de siempre (no se toca al mover).
    expect(rpc.mock.calls.some(c => (c[1] as any)?.p_key === 'cols_productos')).toBe(false);
  });

  it('mover en un extremo no guarda nada', async () => {
    render();
    act(() => api.moveColumn('codigo', -1));
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(loadColumnOrder('u-1_productos')).toBeNull();
  });

  it('al volver a abrir conserva el orden; columnas nuevas al final y las quitadas se ignoran', () => {
    saveColumnOrder('u-1_productos', ['status', 'vieja', 'nombre']);
    render({ ...DEFAULTS, clave_alterna: true });
    expect(api.columnOrder).toEqual(['status', 'nombre', 'codigo', 'precio', 'clave_alterna']);
  });

  it('adopta el orden guardado en el perfil (otro dispositivo)', () => {
    saveColumnOrder('u-1_productos', ['precio']);
    uiPrefs = { colsorder_productos: ['status', 'codigo'] };
    render();
    expect(api.columnOrder).toEqual(['status', 'codigo', 'nombre', 'precio']);
    expect(loadColumnOrder('u-1_productos')).toEqual(['status', 'codigo']);
  });

  it('restablecer vuelve al orden por omisión y lo sincroniza (null)', async () => {
    saveColumnOrder('u-1_productos', ['status', 'precio']);
    render();
    act(() => api.resetOrder());
    await flush();
    expect(api.columnOrder).toEqual(KEYS);
    expect(loadColumnOrder('u-1_productos')).toBeNull();
    expect(rpc).toHaveBeenCalledWith('set_ui_pref', { p_key: 'colsorder_productos', p_value: null });
  });

  it('no cambia la visibilidad: columnas ocultas guardadas siguen ocultas y las nuevas aparecen', () => {
    localStorage.setItem('col_prefs_v1_u-1_productos', JSON.stringify({ precio: false }));
    render({ ...DEFAULTS, clave_alterna: true });
    expect(api.visible).toEqual({ codigo: true, nombre: true, precio: false, status: true, clave_alterna: true });
  });
});
