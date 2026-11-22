import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Orden por columna en las listas de logística paginadas por RPC (Entregas, Demanda y Concentrado
 * «Pedidos»): el orden viaja a la BD en p_orden/p_dir (ordena TODA la lista, no solo la página),
 * solo con claves de la lista blanca, y entra en el queryKey. Sin orden, p_orden = null (orden de siempre).
 */

const rpc = vi.fn();

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  // Los hooks se llaman fuera de React: useState devuelve el valor inicial, useEffect no corre.
  return {
    ...real,
    useState: (v: unknown) => [typeof v === 'function' ? (v as () => unknown)() : v, () => undefined],
    useEffect: () => undefined,
  };
});
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts: unknown) => opts }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ empresa: { id: 'emp-1' } }) }));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { rows: [], counts: {}, total_count: 0 }, error: null });
});

describe('ordenParaRpc (lista blanca)', () => {
  it('clave permitida → p_orden y p_dir', async () => {
    const { ordenParaRpc } = await import('@/hooks/useSortableTable');
    expect(ordenParaRpc({ key: 'cliente', dir: 'desc' }, ['cliente', 'folio'])).toEqual({ p_orden: 'cliente', p_dir: 'desc' });
    expect(ordenParaRpc({ key: 'folio', dir: 'asc' }, ['cliente', 'folio'])).toEqual({ p_orden: 'folio', p_dir: 'asc' });
  });

  it('rechaza claves desconocidas y sin orden: p_orden null (orden de siempre)', async () => {
    const { ordenParaRpc } = await import('@/hooks/useSortableTable');
    expect(ordenParaRpc({ key: 'nombre; drop table ventas', dir: 'asc' }, ['cliente'])).toEqual({ p_orden: null, p_dir: 'asc' });
    expect(ordenParaRpc({ key: 'id', dir: 'desc' }, ['cliente'])).toEqual({ p_orden: null, p_dir: 'asc' });
    expect(ordenParaRpc({ key: null, dir: 'desc' }, ['cliente'])).toEqual({ p_orden: null, p_dir: 'asc' });
    expect(ordenParaRpc(undefined, ['cliente'])).toEqual({ p_orden: null, p_dir: 'asc' });
  });
});

describe('listas blancas = claves que acepta cada función en la BD', () => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261122000000_orden_columnas_logistica.sql'), 'utf8');
  const clavesDe = (fn: string) => {
    const desde = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    expect(desde).toBeGreaterThanOrEqual(0);
    const bloque = sql.slice(desde).match(/v_orden = ANY \(ARRAY\[([\s\S]*?)\]\)/);
    expect(bloque).not.toBeNull();
    return [...bloque![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  };

  it('Entregas, Demanda y Concentrado coinciden con la migración', async () => {
    const { ORDEN_ENTREGAS, ORDEN_DEMANDA, ORDEN_CONCENTRADO_PEDIDOS } = await import('@/lib/ordenListasRpc');
    expect(clavesDe('fn_logistica_entregas_workspace_v3')).toEqual([...ORDEN_ENTREGAS]);
    expect(clavesDe('fn_logistica_pedidos_page_v5')).toEqual([...ORDEN_DEMANDA]);
    expect(clavesDe('fn_logistica_concentrado_pedidos_v4')).toEqual([...ORDEN_CONCENTRADO_PEDIDOS]);
  });

  it('la BD no arma SQL con el texto del usuario (sin EXECUTE dinámico) y rechaza claves con 22023', () => {
    expect(sql).not.toMatch(/(?<!GRANT )\bEXECUTE\b/);
    expect(sql.match(/RAISE EXCEPTION 'orden no permitido: %', p_orden USING ERRCODE = '22023'/g)?.length).toBe(3);
  });
});

describe('parámetros enviados a la RPC', () => {
  it('Entregas: v3 con p_orden/p_dir; el orden va en el queryKey', async () => {
    const { useEntregasWorkspaceList } = await import('@/hooks/useEntregasWorkspace');
    const q: any = useEntregasWorkspaceList({ page: 2, pageSize: 50, sort: { key: 'cliente', dir: 'desc' } });
    await q.queryFn();
    expect(rpc).toHaveBeenCalledWith('fn_logistica_entregas_workspace_v3', expect.objectContaining({
      p_empresa_id: 'emp-1', p_page_size: 50, p_offset: 100, p_orden: 'cliente', p_dir: 'desc',
    }));
    expect(q.queryKey).toEqual(expect.arrayContaining(['cliente', 'desc']));
  });

  it('Entregas: sin orden o clave desconocida → p_orden null', async () => {
    const { useEntregasWorkspaceList } = await import('@/hooks/useEntregasWorkspace');
    await (useEntregasWorkspaceList({}) as any).queryFn();
    await (useEntregasWorkspaceList({ sort: { key: 'nombre_cliente', dir: 'asc' } }) as any).queryFn();
    for (const llamada of rpc.mock.calls) {
      expect(llamada[1]).toEqual(expect.objectContaining({ p_orden: null, p_dir: 'asc' }));
    }
  });

  it('Demanda: v5 con p_orden/p_dir en la página; los conteos no cambian', async () => {
    const { usePedidosOperacionPage, usePedidosOperacionCounts } = await import('@/hooks/usePedidosOperacion');
    const filtros = { desde: '2026-11-01', hasta: '2026-11-30', fechaTipo: 'fecha' as const, tab: 'todos' as const, page: 1, pageSize: 50, sort: { key: 'pendiente', dir: 'desc' as const } };
    const pagina: any = usePedidosOperacionPage(filtros);
    await pagina.queryFn({});
    expect(rpc).toHaveBeenCalledWith('fn_logistica_pedidos_page_v5', expect.objectContaining({
      p_empresa_id: 'emp-1', p_offset: 50, p_orden: 'pendiente', p_dir: 'desc',
    }));
    expect(pagina.queryKey).toEqual(expect.arrayContaining(['pendiente', 'desc']));
    const conteos: any = usePedidosOperacionCounts(filtros);
    expect(conteos.queryKey).not.toContain('pendiente');

    rpc.mockClear();
    await (usePedidosOperacionPage({ ...filtros, sort: { key: 'x', dir: 'desc' } }) as any).queryFn({});
    expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_orden: null, p_dir: 'asc' }));
  });
});
