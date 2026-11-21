import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Orden por columna en listas paginadas en la BD (clientes, productos, ventas y la vista
 * «Productos» de ventas): el orden elegido va en la consulta (ordena TODA la lista, no solo la
 * página), entra en el queryKey y, sin orden elegido, la consulta conserva su orden de siempre.
 */

type Llamada = [string, ...unknown[]];
const consultas: { tabla: string; llamadas: Llamada[] }[] = [];

function consulta(tabla: string) {
  const registro = { tabla, llamadas: [] as Llamada[] };
  consultas.push(registro);
  const q: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (ok: (v: unknown) => unknown) => ok({ data: [], count: 0, error: null });
      }
      return (...args: unknown[]) => { registro.llamadas.push([prop, ...args]); return q; };
    },
  });
  return q;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => consulta(t), rpc: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => opts,
  useQueryClient: () => ({}),
  useMutation: () => ({}),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ empresa: { id: 'emp-1' }, user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useDataVisibility', () => ({
  useDataVisibility: () => ({ seeAll: true, profileId: 'p-1', clientesVisibilidad: 'todos', blocked: false }),
}));
vi.mock('@/lib/catalogEnrich', () => ({
  ensureCatalogsForEnrich: async () => undefined,
  enrichClientes: (rows: unknown[]) => rows,
  enrichProductos: (rows: unknown[]) => rows,
}));

const ordenes = (tabla: string) =>
  consultas.filter(c => c.tabla === tabla).flatMap(c => c.llamadas.filter(l => l[0] === 'order').map(l => l.slice(1)));

beforeEach(() => { consultas.length = 0; });

describe('orden por columna en la consulta (listas paginadas)', () => {
  it('ventas: sin orden conserva «más recientes primero»; con orden usa la columna o la relación a-uno', async () => {
    const { useVentasPaginated } = await import('@/hooks/useVentas');
    const sinOrden: any = useVentasPaginated(undefined, 'todos', 'todos', 1, 50);
    await sinOrden.queryFn();
    expect(ordenes('ventas')).toEqual([['created_at', { ascending: false }], ['id', { ascending: true }]]);

    consultas.length = 0;
    const porCliente: any = useVentasPaginated(undefined, 'todos', 'todos', 3, 50, undefined, undefined, undefined, undefined, false, undefined, undefined, true, false, { key: 'cliente', dir: 'asc' });
    await porCliente.queryFn();
    expect(ordenes('ventas')).toEqual([['clientes(nombre)', { ascending: true, nullsFirst: false }], ['id', { ascending: true }]]);
    // El orden forma parte de la llave de caché (no se reutiliza la página con otro orden).
    expect(porCliente.queryKey).toEqual(expect.arrayContaining(['cliente', 'asc']));
    // Ordena toda la lista: la página 3 pide su rango ya ordenado en la BD.
    const rango = consultas.find(c => c.tabla === 'ventas')!.llamadas.find(l => l[0] === 'range');
    expect(rango).toEqual(['range', 100, 149]);
  });

  it('ventas: una columna calculada en el navegador (cantidad neta) no cambia el orden de la consulta', async () => {
    const { useVentasPaginated, VENTAS_ORDEN_BD } = await import('@/hooks/useVentas');
    expect(VENTAS_ORDEN_BD.cantidad).toBeUndefined();
    const q: any = useVentasPaginated(undefined, 'todos', 'todos', 1, 50, undefined, undefined, undefined, undefined, false, undefined, undefined, true, false, { key: 'cantidad', dir: 'desc' });
    await q.queryFn();
    expect(ordenes('ventas')).toEqual([['created_at', { ascending: false }], ['id', { ascending: true }]]);
  });

  it('renglones de venta (vista Productos): ordena por la relación del encabezado', async () => {
    const { useVentaLineasPaginated } = await import('@/hooks/useVentas');
    const q: any = useVentaLineasPaginated(undefined, 'todos', 'todos', 1, 50, undefined, undefined, undefined, undefined, false, undefined, undefined, true, false, { key: 'folio', dir: 'desc' });
    await q.queryFn();
    expect(ordenes('venta_lineas')).toEqual([['ventas(folio)', { ascending: false, nullsFirst: false }], ['id', { ascending: true }]]);
  });

  it('clientes: sin orden por nombre A→Z; con orden por la columna elegida', async () => {
    const { useClientesPaginated } = await import('@/hooks/useClientes');
    const sinOrden: any = useClientesPaginated(undefined, 'activo', 1, 80);
    await sinOrden.queryFn();
    expect(ordenes('clientes')).toEqual([['nombre', { ascending: true }], ['id', { ascending: true }]]);

    consultas.length = 0;
    const q: any = useClientesPaginated(undefined, 'activo', 1, 80, 'todos', 'todos', false, { key: 'limite_credito', dir: 'desc' });
    await q.queryFn();
    expect(ordenes('clientes')).toEqual([['limite_credito', { ascending: false, nullsFirst: false }], ['id', { ascending: true }]]);
    expect(q.queryKey).toEqual(expect.arrayContaining(['limite_credito', 'desc']));
  });

  it('productos: sin orden por nombre; categoría usa la relación que el select ya trae', async () => {
    const { useProductosPaginated } = await import('@/hooks/useData');
    const sinOrden: any = useProductosPaginated(undefined, 'activo', 1, 80);
    await sinOrden.queryFn();
    expect(ordenes('productos')).toEqual([['nombre', { ascending: true }], ['id', { ascending: true }]]);

    consultas.length = 0;
    const q: any = useProductosPaginated(undefined, 'activo', 1, 80, undefined, undefined, false, undefined, undefined, { key: 'clasificacion', dir: 'asc' });
    await q.queryFn();
    expect(ordenes('productos')).toEqual([['clasificaciones(nombre)', { ascending: true, nullsFirst: false }], ['id', { ascending: true }]]);
    const select = consultas.find(c => c.tabla === 'productos')!.llamadas.find(l => l[0] === 'select')![1] as string;
    expect(select).toContain('clasificaciones(nombre');
  });
});

describe('encabezado ordenable desactivado', () => {
  it('disabled: th normal sin clic ni indicador (columna que la consulta no puede ordenar)', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { SortableTh } = await import('@/hooks/useSortableTable');
    const props = { sortKey: 'cantidad', sort: { key: null, dir: 'asc' as const }, onToggle: () => undefined, className: 'th-odoo text-right' };
    const fila = (p: typeof props & { disabled?: boolean }) =>
      renderToStaticMarkup(createElement('table', null, createElement('thead', null, createElement('tr', null, createElement(SortableTh, p, 'Cant.')))));
    expect(fila(props)).toContain('aria-sort="none"');
    const inactivo = fila({ ...props, disabled: true });
    expect(inactivo).toContain('<th class="th-odoo text-right">Cant.</th>');
    expect(inactivo).not.toContain('aria-sort');
  });
});
