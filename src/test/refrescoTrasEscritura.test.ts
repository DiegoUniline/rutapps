import { QueryClient } from '@tanstack/react-query';
import {
  clavesAfectadas,
  instalarRefrescoTrasEscritura,
  invalidarTrasEscritura,
  recursoDeEscritura,
  recursoRpc,
  tablasAfectadas,
} from '@/lib/refresco/refrescoTrasEscritura';

const REST = 'https://x.supabase.co/rest/v1';

describe('recursoDeEscritura', () => {
  it('detecta escrituras a tablas', () => {
    expect(recursoDeEscritura(`${REST}/clasificaciones?id=eq.1`, 'PATCH')).toBe('clasificaciones');
    expect(recursoDeEscritura(`${REST}/clientes`, 'POST')).toBe('clientes');
    expect(recursoDeEscritura(`${REST}/marcas?id=eq.1`, 'delete')).toBe('marcas');
  });

  it('ignora lecturas, otras rutas y telemetría', () => {
    expect(recursoDeEscritura(`${REST}/clientes?select=*`, 'GET')).toBeNull();
    expect(recursoDeEscritura(`${REST}/clientes?select=*`, undefined)).toBeNull();
    expect(recursoDeEscritura('https://x.supabase.co/auth/v1/token', 'POST')).toBeNull();
    expect(recursoDeEscritura(`${REST}/vendedor_ubicaciones`, 'POST')).toBeNull();
    expect(recursoDeEscritura(`${REST}/consumo_datos`, 'POST')).toBeNull();
  });

  it('edge functions: solo las acciones que escriben', () => {
    const fn = 'https://x.supabase.co/functions/v1/facturama';
    expect(recursoDeEscritura(fn, 'POST', JSON.stringify({ action: 'timbrar', cfdi_id: '1' }))).toBe('fn:facturama');
    expect(recursoDeEscritura(fn, 'POST', JSON.stringify({ action: 'descargar' }))).toBeNull();
    expect(recursoDeEscritura('https://x.supabase.co/functions/v1/admin-users', 'POST', JSON.stringify({ action: 'list-empresa-users' }))).toBeNull();
    expect(recursoDeEscritura('https://x.supabase.co/functions/v1/admin-users', 'POST', JSON.stringify({ action: 'create-user' }))).toBe('fn:admin-users');
    expect(recursoDeEscritura('https://x.supabase.co/functions/v1/send-otp', 'POST', '{}')).toBeNull();
    expect(clavesAfectadas(['fn:facturama']).has('cfdis')).toBe(true);
  });

  it('solo cuenta RPC que escriben', () => {
    expect(recursoDeEscritura(`${REST}/rpc/aplicar_cobro`, 'POST')).toBe('rpc:aplicar_cobro');
    expect(recursoDeEscritura(`${REST}/rpc/resumen_saldos_clientes`, 'POST')).toBeNull();
  });
});

describe('tablasAfectadas / clavesAfectadas', () => {
  it('un cobro aplicado alcanza ventas (saldo) por trigger', () => {
    const t = tablasAfectadas(recursoRpc('aplicar_cobro'));
    expect(t.has('cobros')).toBe(true);
    expect(t.has('cobro_aplicaciones')).toBe(true);
    expect(t.has('ventas')).toBe(true);
  });

  it('el stock no re-descarga el catálogo de productos (lo hace Realtime)', () => {
    const t = tablasAfectadas('stock_almacen');
    expect(t.has('stock_almacen')).toBe(true);
    expect(t.has('productos')).toBe(false);
  });

  it('renombrar una categoría refresca las listas de productos que muestran su nombre', () => {
    const k = clavesAfectadas(['clasificaciones']);
    expect(k.has('clasificaciones')).toBe(true);
    expect(k.has('productos')).toBe(true);
    expect(k.has('productos-page')).toBe(true);
    expect(k.has('producto-catalogos-inactivos')).toBe(true);
  });

  it('un cobro refresca cuentas por cobrar y estado de cuenta', () => {
    const k = clavesAfectadas([recursoRpc('aplicar_cobro')]);
    expect(k.has('cuentas-cobrar')).toBe(true);
    expect(k.has('cliente-estado-cuenta')).toBe(true);
    expect(k.has('ventas')).toBe(true);
  });

  it('no invalida lo que no tiene relación', () => {
    const k = clavesAfectadas(['marcas']);
    expect(k.has('cuentas-cobrar')).toBe(false);
    expect(k.has('kardex')).toBe(false);
  });
});

describe('invalidarTrasEscritura', () => {
  it('invalida por prefijo solo las relacionadas y omite las ya recargadas', async () => {
    const qc = new QueryClient();
    const desde = Date.now();
    qc.setQueryData(['productos', 'emp1', 'x'], [], { updatedAt: desde - 1000 });
    qc.setQueryData(['productos-page', 'emp1'], [], { updatedAt: desde + 5 }); // ya fresca
    qc.setQueryData(['cuentas-cobrar', 'emp1'], [], { updatedAt: desde - 1000 });
    await invalidarTrasEscritura(qc, ['clasificaciones'], desde);
    const estado = (k: unknown[]) => qc.getQueryState(k)?.isInvalidated;
    expect(estado(['productos', 'emp1', 'x'])).toBe(true);
    expect(estado(['productos-page', 'emp1'])).toBe(false);
    expect(estado(['cuentas-cobrar', 'emp1'])).toBe(false);
  });
});

describe('instalarRefrescoTrasEscritura', () => {
  afterEach(() => vi.useRealTimers());

  it('agrupa escrituras y refresca una vez; no se activa con lecturas ni errores', async () => {
    vi.useFakeTimers();
    const previo = window.fetch;
    window.fetch = vi.fn(async (input: RequestInfo | URL) =>
      new Response(null, { status: String(input).includes('falla') ? 400 : 200 })) as typeof window.fetch;
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const quitar = instalarRefrescoTrasEscritura(qc);
    try {
      await window.fetch(`${REST}/clientes?select=*`);
      await window.fetch(`${REST}/falla`, { method: 'POST' });
      vi.advanceTimersByTime(1000);
      expect(spy).not.toHaveBeenCalled();

      await window.fetch(`${REST}/ventas`, { method: 'POST' });
      await window.fetch(`${REST}/venta_lineas`, { method: 'POST' });
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      quitar();
      window.fetch = previo;
    }
  });
});
