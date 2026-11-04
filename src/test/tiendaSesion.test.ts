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

describe('TiendaProvider: sesión vencida', () => {
  it('cierra sesión sola y avisa en la pantalla de entrar', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ config: null, empresa: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const vencido = `${b64url({ alg: 'HS256' })}.${b64url({ exp: Math.floor(Date.now() / 1000) - 60 })}.f`;
    localStorage.setItem('tienda_token_demo', vencido);
    localStorage.setItem('tienda_token_demo_email', 'a@b.mx');
    let estado: any = null;
    const Espia = () => { estado = useTienda(); return null; };
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => { root.render(createElement(TiendaProvider, { slug: 'demo' }, createElement(Espia))); });
    act(() => root.unmount());
    expect(estado.isAuth).toBe(false);
    expect(estado.sesionExpirada).toBe(true);
    expect(localStorage.getItem('tienda_token_demo')).toBeNull();
    // No intentó renovar un token vencido.
    expect(fetchMock.mock.calls.some((c: any[]) => String(c[0]).includes('tienda-refresh'))).toBe(false);
    vi.unstubAllGlobals();
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
    await act(async () => { root.render(createElement(TiendaProvider, { slug: 'demo' }, createElement(Espia))); });
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
