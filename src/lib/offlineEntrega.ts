/**
 * Offline-first helpers for entrega/descarga views.
 * All readers try Supabase first when online, then fall back to IndexedDB.
 */
import { supabase } from './supabase';
import { getOfflineTable } from './offlineDb';

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;

async function localTableToArray<T = any>(name: string): Promise<T[]> {
  const t = getOfflineTable(name);
  if (!t) return [];
  try { return (await t.toArray()) as T[]; } catch { return []; }
}

async function localGet<T = any>(name: string, id: string): Promise<T | null> {
  const t = getOfflineTable(name);
  if (!t) return null;
  try { return ((await t.get(id)) as T) ?? null; } catch { return null; }
}

/** Fetch entrega with clientes, vendedores y entrega_lineas (con productos) embebidos. */
export async function fetchEntregaWithFallback(id: string) {
  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from('entregas')
        .select(`*, clientes(id, nombre, telefono, direccion, colonia, credito, limite_credito, dias_credito), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre), entrega_lineas(*, productos(id, codigo, nombre, precio_principal))`)
        .eq('id', id)
        .single();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      console.warn('[fetchEntregaWithFallback] server failed, using cache:', err);
    }
  }
  // Offline fallback
  const entrega = await localGet<any>('entregas', id);
  if (!entrega) return null;
  const [lineasAll, productos, cliente, vendedor] = await Promise.all([
    localTableToArray<any>('entrega_lineas'),
    localTableToArray<any>('productos'),
    entrega.cliente_id ? localGet<any>('clientes', entrega.cliente_id) : Promise.resolve(null),
    entrega.vendedor_id ? localGet<any>('profiles', entrega.vendedor_id) : Promise.resolve(null),
  ]);
  const prodMap = new Map(productos.map((p: any) => [p.id, p]));
  const entrega_lineas = lineasAll
    .filter((l: any) => l.entrega_id === id)
    .map((l: any) => ({
      ...l,
      productos: prodMap.get(l.producto_id) ?? { id: l.producto_id, codigo: '', nombre: '—', precio_principal: 0 },
    }));
  return {
    ...entrega,
    clientes: cliente ? { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono, direccion: cliente.direccion, colonia: cliente.colonia, credito: cliente.credito, limite_credito: cliente.limite_credito, dias_credito: cliente.dias_credito } : null,
    vendedores: vendedor ? { nombre: vendedor.nombre } : null,
    entrega_lineas,
  };
}

/** Fetch venta con venta_lineas (productos) + clientes + vendedores. */
export async function fetchVentaForEntregaWithFallback(ventaId: string) {
  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select(`*, venta_lineas(*, productos(id, codigo, nombre), unidades:unidad_id(nombre, abreviatura)), clientes(id, nombre, telefono), vendedores:profiles!vendedor_id(nombre), venta_promociones(*)`)
        .eq('id', ventaId)
        .single();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      console.warn('[fetchVentaForEntregaWithFallback] server failed, using cache:', err);
    }
  }
  const venta = await localGet<any>('ventas', ventaId);
  if (!venta) return null;
  const [lineasAll, productos, cliente, vendedor] = await Promise.all([
    localTableToArray<any>('venta_lineas'),
    localTableToArray<any>('productos'),
    venta.cliente_id ? localGet<any>('clientes', venta.cliente_id) : Promise.resolve(null),
    venta.vendedor_id ? localGet<any>('profiles', venta.vendedor_id) : Promise.resolve(null),
  ]);
  const prodMap = new Map(productos.map((p: any) => [p.id, p]));
  const venta_lineas = lineasAll
    .filter((l: any) => l.venta_id === ventaId)
    .map((l: any) => ({
      ...l,
      productos: prodMap.get(l.producto_id) ?? { id: l.producto_id, codigo: '', nombre: l.descripcion ?? '—' },
      unidades: null,
    }));
  return {
    ...venta,
    venta_lineas,
    clientes: cliente ? { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono } : null,
    vendedores: vendedor ? { nombre: vendedor.nombre } : null,
    venta_promociones: [],
  };
}

/** Otras cuentas pendientes del cliente (saldo_pendiente > 0). */
export async function fetchOtrasPendientesWithFallback(clienteId: string) {
  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente')
        .eq('cliente_id', clienteId)
        .gt('saldo_pendiente', 0)
        .in('status', ['borrador', 'confirmado', 'entregado', 'facturado'])
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      console.warn('[fetchOtrasPendientesWithFallback] server failed, using cache:', err);
    }
  }
  const all = await localTableToArray<any>('ventas');
  return all
    .filter((v: any) => v.cliente_id === clienteId
      && Number(v.saldo_pendiente ?? 0) > 0
      && ['borrador', 'confirmado', 'entregado', 'facturado'].includes(v.status))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((v: any) => ({ id: v.id, folio: v.folio, fecha: v.fecha, total: v.total, saldo_pendiente: v.saldo_pendiente }));
}

export interface DevFinItem {
  nombre: string;
  cantidad: number;
  motivo: string;
  accion: string;
  monto_credito: number;
  cliente: string;
}

/** Efectivo entregado al cliente por devoluciones de dinero (sale de la caja del vendedor). */
function sumDevolucionesDinero(items: DevFinItem[]): number {
  return Math.round(
    items.filter(i => i.accion === 'devolucion_dinero')
      .reduce((s, i) => s + (Number(i.monto_credito) || 0), 0) * 100,
  ) / 100;
}

/** Cálculos financieros del día para liquidación de ruta. Lee de IndexedDB si offline. */
export async function fetchDescargaFinancialsWithFallback(args: {
  empresaId: string;
  userId: string;
  vendedorId: string;
  today: string; // YYYY-MM-DD
}) {
  const { empresaId, userId, vendedorId, today } = args;
  if (isOnline()) {
    try {
      const [ventasRes, cobrosRes, gastosRes, devsRes] = await Promise.all([
        supabase.from('ventas').select('total').eq('vendedor_id', vendedorId).eq('fecha', today).eq('condicion_pago', 'contado').neq('status', 'cancelado'),
        supabase.from('cobros').select('monto, metodo_pago').eq('empresa_id', empresaId).eq('user_id', userId).eq('fecha', today).neq('status', 'cancelado'),
        supabase.from('gastos').select('monto').eq('vendedor_id', vendedorId).eq('fecha', today),
        supabase.from('devoluciones').select('id, tipo, clientes(nombre), devolucion_lineas(cantidad, motivo, accion, monto_credito, productos(nombre))').eq('empresa_id', empresaId).eq('vendedor_id', vendedorId).eq('fecha', today),
      ]);
      const ventasContado = (ventasRes.data || []).reduce((s, v: any) => s + (Number(v.total) || 0), 0);
      const cobrosEfectivo = (cobrosRes.data || []).filter((c: any) => c.metodo_pago === 'efectivo').reduce((s, c: any) => s + (Number(c.monto) || 0), 0);
      const gastosTotal = (gastosRes.data || []).reduce((s, g: any) => s + (Number(g.monto) || 0), 0);
      const devItems: DevFinItem[] = [];
      (devsRes.data || []).forEach((d: any) => {
        (d.devolucion_lineas || []).forEach((l: any) => {
          devItems.push({
            nombre: l.productos?.nombre || '—',
            cantidad: Number(l.cantidad),
            motivo: l.motivo || '—',
            accion: l.accion || 'reposicion',
            monto_credito: Number(l.monto_credito) || 0,
            cliente: d.clientes?.nombre || '—',
          });
        });
      });
      return { ventasContado, cobrosEfectivo, gastosTotal, devItems, devolucionesDinero: sumDevolucionesDinero(devItems) };
    } catch (err) {
      console.warn('[fetchDescargaFinancialsWithFallback] server failed, using cache:', err);
    }
  }
  // Offline fallback: compute from IndexedDB
  const [ventas, cobros, gastos, devoluciones, devLineas, productos, clientes] = await Promise.all([
    localTableToArray<any>('ventas'),
    localTableToArray<any>('cobros'),
    localTableToArray<any>('gastos'),
    localTableToArray<any>('devoluciones'),
    localTableToArray<any>('devolucion_lineas'),
    localTableToArray<any>('productos'),
    localTableToArray<any>('clientes'),
  ]);
  const ventasContado = ventas
    .filter((v: any) => v.vendedor_id === vendedorId && v.fecha === today && v.condicion_pago === 'contado' && v.status !== 'cancelado')
    .reduce((s, v: any) => s + (Number(v.total) || 0), 0);
  const cobrosEfectivo = cobros
    .filter((c: any) => c.empresa_id === empresaId && c.user_id === userId && c.fecha === today && c.status !== 'cancelado' && c.metodo_pago === 'efectivo')
    .reduce((s, c: any) => s + (Number(c.monto) || 0), 0);
  const gastosTotal = gastos
    .filter((g: any) => g.vendedor_id === vendedorId && g.fecha === today)
    .reduce((s, g: any) => s + (Number(g.monto) || 0), 0);
  const prodMap = new Map(productos.map((p: any) => [p.id, p]));
  const cliMap = new Map(clientes.map((c: any) => [c.id, c]));
  const devsDelDia = devoluciones.filter((d: any) => d.empresa_id === empresaId && d.vendedor_id === vendedorId && d.fecha === today);
  const devIds = new Set(devsDelDia.map((d: any) => d.id));
  const devItems: DevFinItem[] = [];
  for (const l of devLineas) {
    if (!devIds.has(l.devolucion_id)) continue;
    const dev = devsDelDia.find((d: any) => d.id === l.devolucion_id);
    devItems.push({
      nombre: prodMap.get(l.producto_id)?.nombre ?? '—',
      cantidad: Number(l.cantidad),
      motivo: l.motivo || '—',
      accion: l.accion || 'reposicion',
      monto_credito: Number(l.monto_credito) || 0,
      cliente: dev?.cliente_id ? (cliMap.get(dev.cliente_id)?.nombre ?? '—') : '—',
    });
  }
  return { ventasContado, cobrosEfectivo, gastosTotal, devItems, devolucionesDinero: sumDevolucionesDinero(devItems) };
}

/** Verifica si ya existe una liquidación enviada hoy (por carga, vendedor o user). */
export async function fetchExistingDescargaWithFallback(args: {
  cargaId?: string | null;
  vendedorId?: string | null;
  userId: string;
  today: string;
}) {
  const { cargaId, vendedorId, userId, today } = args;
  if (isOnline()) {
    try {
      if (cargaId) {
        const { data } = await supabase.from('descarga_ruta').select('id, status').eq('carga_id', cargaId).limit(1).maybeSingle();
        if (data) return data;
      }
      if (vendedorId) {
        const { data } = await supabase.from('descarga_ruta').select('id, status').eq('vendedor_id', vendedorId).lte('fecha_inicio', today).gte('fecha_fin', today).limit(1).maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase.from('descarga_ruta').select('id, status').eq('user_id', userId).eq('fecha', today).limit(1).maybeSingle();
      return data ?? null;
    } catch (err) {
      console.warn('[fetchExistingDescargaWithFallback] server failed, using cache:', err);
    }
  }
  const all = await localTableToArray<any>('descarga_ruta');
  const hit = all.find((d: any) => {
    if (cargaId && d.carga_id === cargaId) return true;
    if (vendedorId && d.vendedor_id === vendedorId && d.fecha_inicio <= today && d.fecha_fin >= today) return true;
    if (d.user_id === userId && d.fecha === today) return true;
    return false;
  });
  return hit ? { id: hit.id, status: hit.status } : null;
}

/** Carga activa del vendedor (en_ruta/completada más reciente). */
export async function fetchCargaActivaWithFallback(empresaId: string) {
  if (isOnline()) {
    try {
      const { data } = await supabase
        .from('cargas').select('id, fecha, vendedor_id')
        .eq('empresa_id', empresaId)
        .in('status', ['en_ruta', 'completada'])
        .order('fecha', { ascending: false }).limit(1).maybeSingle();
      if (data !== undefined) return data;
    } catch (err) {
      console.warn('[fetchCargaActivaWithFallback] server failed, using cache:', err);
    }
  }
  const all = await localTableToArray<any>('cargas');
  const candidates = all
    .filter((c: any) => c.empresa_id === empresaId && ['en_ruta', 'completada'].includes(c.status))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const first = candidates[0];
  return first ? { id: first.id, fecha: first.fecha, vendedor_id: first.vendedor_id } : null;
}

/** Profile id (=vendedor_id) por user_id. */
export async function fetchMyProfileWithFallback(userId: string) {
  if (isOnline()) {
    try {
      const { data } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle();
      if (data !== undefined) return data;
    } catch (err) {
      console.warn('[fetchMyProfileWithFallback] server failed, using cache:', err);
    }
  }
  const all = await localTableToArray<any>('profiles');
  const hit = all.find((p: any) => p.user_id === userId);
  return hit ? { id: hit.id } : null;
}
