import { useEffect, useState } from 'react';
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type PedidoOperacionTab = 'pendientes' | 'generadas' | 'surtidos' | 'en_ruta' | 'entregados' | 'cerrados' | 'todos';
export type PedidoOperacionFechaTipo = 'fecha' | 'fecha_entrega';

export interface PedidoOperacionFilters {
  desde: string;
  hasta: string;
  fechaTipo: PedidoOperacionFechaTipo;
  vendedorIds?: string[];
  search?: string;
  tab: PedidoOperacionTab;
  page: number;
  pageSize: number;
}

export const EMPTY_PEDIDO_COUNTS = {
  pendientes: 0,
  generadas: 0,
  surtidos: 0,
  en_ruta: 0,
  entregados: 0,
  cerrados: 0,
  todos: 0,
};

export type PedidoOperacionCounts = typeof EMPTY_PEDIDO_COUNTS;

export interface PedidoOperacionRow {
  id: string;
  folio: string;
  cliente_id: string;
  clientes: { nombre: string };
  vendedor_id: string;
  vendedores: { nombre: string };
  status: string;
  fecha: string;
  total: number;
  cerrado_at: string | null;
  totalPendiente: number;
  totalGenerada: number;
  totalSurtido: number;
  totalEntregado: number;
  totalDemanda: number;
  totalValorPendiente: number;
  lineasPendientes: number;
  pctGenerada: number;
  pctSurtido: number;
  pctEntregado: number;
  fullyGenerada: boolean;
  fullySurtido: boolean;
  fullyDelivered: boolean;
  enRuta: boolean;
  estadoOdoo: string;
  fechaProgramada: string | null;
  vendedorRutaId: string | null;
  vendedorRutaNombre: string | null;
  fechaEntrega: string | null;
}

export interface PedidoOperacionPageResult {
  rows: PedidoOperacionRow[];
  dbMs: number;
  payloadBytes: number;
}

export interface PedidoOperacionCountsResult {
  counts: PedidoOperacionCounts;
  totalCount: number;
  totalPendiente: number;
  totalValorPendiente: number;
  dbMs: number;
  payloadBytes: number;
}

export const pedidosOperacionKeys = {
  all: ['pedidos-operacion'] as const,
  pages: ['pedidos-operacion', 'page'] as const,
  counts: ['pedidos-operacion', 'counts'] as const,
  detalle: (pedidoId: string) => ['pedido-detalle', pedidoId] as const,
};

export function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function payloadBytes(value: unknown) {
  try {
    const text = JSON.stringify(value ?? null);
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).byteLength : text.length;
  } catch {
    return 0;
  }
}

function perfEnabled() {
  if (typeof window === 'undefined') return false;
  return import.meta.env.DEV || window.localStorage.getItem('rutapp:perf-logistica') === '1';
}

function logPerf(label: string, startedAt: number, payload: any) {
  if (!perfEnabled()) return;
  const elapsed = typeof performance !== 'undefined' ? performance.now() - startedAt : 0;
  console.info(`[Perf][Pedidos Operación] ${label}`, {
    network_ms: Number(elapsed.toFixed(2)),
    db_ms: Number(payload?.db_ms ?? 0),
    payload_bytes: payloadBytes(payload),
    rows: Array.isArray(payload?.rows) ? payload.rows.length : undefined,
  });
}

async function rpcWithAbort(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  let request: any = (supabase as any).rpc(name, args);
  if (signal && typeof request?.abortSignal === 'function') {
    request = request.abortSignal(signal);
  }
  const { data, error } = await request;
  if (error) throw error;
  logPerf(name, startedAt, data);
  return data ?? {};
}

function commonArgs(empresaId: string, filters: PedidoOperacionFilters) {
  return {
    p_empresa_id: empresaId,
    p_fecha_desde: filters.desde || null,
    p_fecha_hasta: filters.hasta || null,
    p_fecha_tipo: filters.fechaTipo === 'fecha_entrega' ? 'programada' : 'levantamiento',
    p_vendedor_ids: filters.vendedorIds?.length ? filters.vendedorIds : null,
    p_search: filters.search?.trim() || null,
    p_tab: filters.tab,
  };
}

export function usePedidosOperacionPage(filters: PedidoOperacionFilters): UseQueryResult<PedidoOperacionPageResult> {
  const { empresa } = useAuth();
  const vendedoresKey = (filters.vendedorIds ?? []).slice().sort().join(',');

  return useQuery({
    queryKey: [
      ...pedidosOperacionKeys.pages,
      empresa?.id,
      filters.desde,
      filters.hasta,
      filters.fechaTipo,
      vendedoresKey,
      filters.search?.trim() ?? '',
      filters.tab,
      filters.page,
      filters.pageSize,
    ],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async ({ signal }) => {
      const payload = await rpcWithAbort('fn_logistica_pedidos_page_v4', {
        ...commonArgs(empresa!.id, filters),
        p_page_size: filters.pageSize,
        p_offset: filters.pageSize === 0 ? 0 : filters.page * filters.pageSize,
      }, signal);

      const rows = (Array.isArray(payload.rows) ? payload.rows : []).map((row: any) => ({
        id: row.id,
        folio: row.folio,
        cliente_id: row.cliente_id,
        clientes: { nombre: row.cliente_nombre },
        vendedor_id: row.vendedor_id,
        vendedores: { nombre: row.vendedor_nombre },
        status: row.status,
        fecha: row.fecha,
        total: Number(row.total ?? 0),
        cerrado_at: row.cerrado_at,
        totalPendiente: Number(row.total_pendiente ?? 0),
        totalGenerada: Number(row.total_generada ?? 0),
        totalSurtido: Number(row.total_surtido ?? 0),
        totalEntregado: Number(row.total_entregado ?? 0),
        totalDemanda: Number(row.total_demanda ?? 0),
        totalValorPendiente: Number(row.total_valor_pendiente ?? 0),
        lineasPendientes: Number(row.lineas_pendientes ?? 0),
        pctGenerada: Number(row.pct_generada ?? 0),
        pctSurtido: Number(row.pct_surtido ?? 0),
        pctEntregado: Number(row.pct_entregado ?? 0),
        fullyGenerada: !!row.fully_generada,
        fullySurtido: !!row.fully_surtido,
        fullyDelivered: !!row.fully_delivered,
        enRuta: !!row.en_ruta,
        estadoOdoo: row.estado_odoo,
        fechaProgramada: row.fecha_programada,
        vendedorRutaId: row.vendedor_ruta_id,
        vendedorRutaNombre: row.vendedor_ruta_nombre,
        fechaEntrega: row.fecha_entrega_real,
      }));

      return {
        rows,
        dbMs: Number(payload.db_ms ?? 0),
        payloadBytes: payloadBytes(payload),
      };
    },
  });
}

export function usePedidosOperacionCounts(filters: PedidoOperacionFilters) {
  const { empresa } = useAuth();
  const vendedoresKey = (filters.vendedorIds ?? []).slice().sort().join(',');

  return useQuery({
    queryKey: [
      ...pedidosOperacionKeys.counts,
      empresa?.id,
      filters.desde,
      filters.hasta,
      filters.fechaTipo,
      vendedoresKey,
      filters.search?.trim() ?? '',
      filters.tab,
    ],
    enabled: !!empresa?.id,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async ({ signal }) => {
      const payload = await rpcWithAbort('fn_logistica_pedidos_counts_v4', commonArgs(empresa!.id, filters), signal);
      const raw = payload.counts ?? {};
      return {
        counts: {
          pendientes: Number(raw.pendientes ?? 0),
          generadas: Number(raw.generadas ?? 0),
          surtidos: Number(raw.surtidos ?? 0),
          en_ruta: Number(raw.en_ruta ?? 0),
          entregados: Number(raw.entregados ?? 0),
          cerrados: Number(raw.cerrados ?? 0),
          todos: Number(raw.todos ?? 0),
        },
        totalCount: Number(payload.selected_count ?? 0),
        totalPendiente: Number(payload.selected_total_pendiente ?? 0),
        totalValorPendiente: Number(payload.selected_total_valor_pendiente ?? 0),
        dbMs: Number(payload.db_ms ?? 0),
        payloadBytes: payloadBytes(payload),
      };
    },
  });
}

async function fetchPedidoDetalle(pedidoId: string, signal?: AbortSignal) {
  const payload = await rpcWithAbort('fn_logistica_pedido_detalle_v4', { p_pedido_id: pedidoId }, signal);
  const lineas = (Array.isArray(payload.rows) ? payload.rows : []).map((row: any) => ({
    id: row.id,
    producto_id: row.producto_id,
    unidad_id: row.unidad_id,
    lote_id: row.lote_id,
    productos: {
      codigo: row.codigo,
      nombre: row.producto,
      unidades: row.unidad ? { abreviatura: row.unidad } : null,
    },
    cantidad: Number(row.cantidad ?? 0),
    precio_unitario: Number(row.precio ?? 0),
    cantidad_generada: Number(row.generado ?? 0),
    cantidad_surtida: Number(row.surtido ?? 0),
    cantidad_entregada: Number(row.entregado ?? 0),
    cantidad_pendiente: Number(row.pendiente ?? 0),
    subtotal: Number(row.subtotal ?? 0),
  }));

  return {
    lineas,
    clienteDireccion: payload.cliente_direccion ?? null,
    clienteTelefono: payload.cliente_telefono ?? null,
    notas: payload.notas ?? null,
    dbMs: Number(payload.db_ms ?? 0),
    payloadBytes: payloadBytes(payload),
  };
}

export function pedidoDetalleQueryOptions(pedidoId: string) {
  return {
    queryKey: pedidosOperacionKeys.detalle(pedidoId),
    queryFn: ({ signal }: { signal?: AbortSignal }) => fetchPedidoDetalle(pedidoId, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  };
}

export function usePedidoDetalle(pedidoId: string, enabled: boolean) {
  return useQuery({
    ...pedidoDetalleQueryOptions(pedidoId),
    enabled: enabled && !!pedidoId,
  });
}

export function prefetchPedidoDetalle(queryClient: QueryClient, pedidoId: string) {
  if (!pedidoId) return Promise.resolve();
  return queryClient.prefetchQuery(pedidoDetalleQueryOptions(pedidoId));
}

export async function invalidatePedidoOperacion(queryClient: QueryClient, pedidoIds: string[] = []) {
  const uniqueIds = Array.from(new Set(pedidoIds.filter(Boolean)));
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: pedidosOperacionKeys.pages }),
    queryClient.invalidateQueries({ queryKey: pedidosOperacionKeys.counts }),
    ...uniqueIds.map(id => queryClient.invalidateQueries({ queryKey: pedidosOperacionKeys.detalle(id) })),
  ]);
}
