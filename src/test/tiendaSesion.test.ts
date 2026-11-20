import { describe, it, expect } from 'vitest';
import { tokenExpiraEn } from '@/tienda/TiendaContext';

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('tokenExpiraEn', () => {
  it('lee exp del token de la tienda (en ms)', () => {
    const tok = `${b64url({ alg: 'HS256' })}.${b64url({ email: 'ñandú@x.mx'.normalize(), exp: 1893456000 })}.firma`;
    expect(tokenExpiraEn(tok)).toBe(1893456000 * 1000);
  });
  it('token ilegible o vacío → null', () => {
    expect(tokenExpiraEn(null)).toBeNull();
    expect(tokenExpiraEn('basura')).toBeNull();
    expect(tokenExpiraEn('a.%%%.c')).toBeNull();
  });
});

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { vi } from 'vitest';
import { TiendaProvider, useTienda } from '@/tienda/TiendaContext';

describe('TiendaProvider: sesión vencida por tiempo', () => {
  const montarVencido = async (respRefresh: () => Response | Promise<Response>) => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    const fetchMock = vi.fn(async (url: any) => String(url).includes('tienda-refresh')
      ? respRefresh()
      : new Response(JSON.stringify({ config: null, empresa: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const vencido = `${b64url({ alg: 'HS256' })}.${b64url({ exp: Math.floor(Date.now() / 1000) - 60 })}.f`;
    localStorage.setItem('tienda_token_demo', vencido);
    localStorage.setItem('tienda_token_demo_email', 'a@b.mx');
    let estado: any = null;
    const Espia = () => { estado = useTienda(); return null; };
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement(TiendaProvider, { slug: 'demo', children: createElement(Espia) })); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const e = estado;
    act(() => root.unmount());
    vi.unstubAllGlobals();
    return { estado: e, fetchMock };
  };

  it('NO cierra sesión: la renueva y sigue dentro', async () => {
    const { estado, fetchMock } = await montarVencido(() => new Response(JSON.stringify({ token: 'nuevo.token.x' }), { status: 200 }));
    expect(fetchMock.mock.calls.some((c: any[]) => String(c[0]).includes('tienda-refresh'))).toBe(true);
    expect(estado.isAuth).toBe(true);
    expect(estado.token).toBe('nuevo.token.x');
    expect(estado.sesionExpirada).toBe(false);
  });

  it('sin internet: conserva la sesión', async () => {
    const { estado } = await montarVencido(() => { throw new TypeError('Failed to fetch'); });
    expect(estado.isAuth).toBe(true);
    expect(localStorage.getItem('tienda_token_demo')).not.toBeNull();
  });

  it('error del servidor (500 / respuesta no JSON): conserva la sesión', async () => {
    const { estado } = await montarVencido(() => new Response('<html>504</html>', { status: 504 }));
    expect(estado.isAuth).toBe(true);
    expect(estado.sesionExpirada).toBe(false);
  });

  it('el servidor rechaza la renovación (cliente bloqueado): se cierra y avisa', async () => {
    const { estado } = await montarVencido(() => new Response(JSON.stringify({ error: 'Sesión expirada', code: 'sesion_expirada' }), { status: 401 }));
    expect(estado.isAuth).toBe(false);
    expect(estado.sesionExpirada).toBe(true);
    expect(localStorage.getItem('tienda_token_demo')).toBeNull();
  });
});

describe('TiendaProvider: renovación', () => {
  const montar = async (respRefresh: () => Response) => {
    localStorage.clear();
    const fetchMock = vi.fn(async (url: any) => String(url).includes('tienda-refresh')
      ? respRefresh()
      : new Response(JSON.stringify({ config: null, empresa: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const vigente = `${b64url({ alg: 'HS256' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600 })}.f`;
    localStorage.setItem('tienda_token_demo', vigente);
    let estado: any = null;
    const Espia = () => { estado = useTienda(); return null; };
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement(TiendaProvider, { slug: 'demo', children: createElement(Espia) })); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const e = estado;
    act(() => root.unmount());
    return { estado: () => e, fetchMock };
  };

  it('token vigente: se renueva y se guarda el nuevo', async () => {
    const { estado } = await montar(() => new Response(JSON.stringify({ token: 'nuevo.token.x', email: 'a@b.mx' }), { status: 200 }));
    expect(estado().token).toBe('nuevo.token.x');
    expect(localStorage.getItem('tienda_token_demo')).toBe('nuevo.token.x');
    vi.unstubAllGlobals();
  });

  it('el servidor dice sesión expirada (cliente bloqueado): se cierra sola', async () => {
    const { estado } = await montar(() => new Response(JSON.stringify({ error: 'Sesión expirada', code: 'sesion_expirada' }), { status: 401 }));
    expect(estado().isAuth).toBe(false);
    expect(estado().sesionExpirada).toBe(true);
    vi.unstubAllGlobals();
  });
});

import { fnGet, repreciarCarrito, type CartItem, type TiendaProducto } from '@/tienda/TiendaContext';

describe('fnGet: 401 de sesión → renueva y reintenta una vez', () => {
  it('reintenta con el token nuevo sin cerrar sesión', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    const vigente = `${b64url({ alg: 'HS256' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600 })}.f`;
    localStorage.setItem('tienda_token_demo', vigente);
    localStorage.setItem('tienda_token_demo_renovado', String(Date.now()));
    const fetchMock = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('tienda-refresh')) return new Response(JSON.stringify({ token: 'renovado.t.x' }), { status: 200 });
      if (u.includes('tienda-catalog')) {
        return u.includes('token=renovado.t.x')
          ? new Response(JSON.stringify({ productos: [{ id: 'p1', precio: 9 }] }), { status: 200 })
          : new Response(JSON.stringify({ error: 'Sesión expirada', code: 'sesion_expirada' }), { status: 401 });
      }
      return new Response(JSON.stringify({ config: null, empresa: null }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    let estado: any = null;
    const Espia = () => { estado = useTienda(); return null; };
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement(TiendaProvider, { slug: 'demo', children: createElement(Espia) })); });
    let data: any = null;
    await act(async () => { data = await fnGet('tienda-catalog', { slug: 'demo', token: vigente }); });
    expect(data.productos[0].precio).toBe(9);
    expect(estado.isAuth).toBe(true);
    expect(estado.token).toBe('renovado.t.x');
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('respuesta que no es JSON → mensaje claro, no "Unexpected token"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(fnGet('tienda-resolve', { slug: 'x' })).rejects.toThrow(/servidor no respondió/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fnGet('tienda-resolve', { slug: 'x' })).rejects.toThrow(/Sin conexión/);
    vi.unstubAllGlobals();
  });
});

describe('repreciarCarrito: el carrito toma los precios del cliente', () => {
  const prod = (over: Partial<TiendaProducto>): TiendaProducto => ({
    id: 'p1', nombre: 'Refresco', sku: null, descripcion: null, categoria: null, marca: null, imagen_url: null,
    unidad_venta: 'pz', precio: 10, precio_base: 12, stock: 5, vender_sin_stock: false,
    tiene_iva: true, iva_pct: 16, tiene_ieps: false, ieps_pct: 0, presentaciones: [], ...over,
  });
  const item = (over: Partial<CartItem>): CartItem => ({
    producto_id: 'p1', nombre: 'Refresco', imagen_url: null, precio_unitario: 12, cantidad: 2, unidad: 'pz', ...over,
  });

  it('agregado como visitante ($12) → al entrar ve su precio ($10)', () => {
    const out = repreciarCarrito([item({})], [prod({})]);
    expect(out[0].precio_unitario).toBe(10);
    expect(out[0].cantidad).toBe(2);
  });

  it('presentación: precio especial o precio × factor', () => {
    const p = prod({ presentaciones: [
      { id: 'caja', nombre: 'Caja 12', factor_base: 12, precio_especial: 100 },
      { id: 'six', nombre: 'Six', factor_base: 6, precio_especial: null },
    ] });
    const out = repreciarCarrito([
      item({ presentacion_id: 'caja', precio_unitario: 130, factor_base: 12 }),
      item({ presentacion_id: 'six', precio_unitario: 70, factor_base: 6 }),
    ], [p]);
    expect(out.map((c) => c.precio_unitario)).toEqual([100, 60]);
  });

  it('sin cambios devuelve el mismo arreglo; producto ausente se conserva', () => {
    const cart = [item({ precio_unitario: 10 }), item({ producto_id: 'otro', precio_unitario: 5 })];
    expect(repreciarCarrito(cart, [prod({})])).toBe(cart);
  });
});
