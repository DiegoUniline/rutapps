import { DateRangePicker } from '@/components/shared/DateRangePicker';
import React, { useState, useMemo, Fragment, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Check, Search, ClipboardList, Package, Warehouse, CheckCircle2, X, ChevronDown, ChevronRight, ExternalLink, Zap, AlertTriangle, UserPlus, XCircle, Lock, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ModalSelect from '@/components/ModalSelect';
import { toast } from 'sonner';
import { cn, fmtDate, todayLocal, weekStartLocal, weekEndLocal } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import PedidosTabs from '@/components/PedidosTabs';
import { BulkCerrarPedidosDialog } from '@/components/venta/BulkCerrarPedidosDialog';
import {
  EMPTY_PEDIDO_COUNTS,
  invalidatePedidoOperacion,
  pedidosOperacionKeys,
  prefetchPedidoDetalle,
  useDebouncedValue,
  usePedidoDetalle,
  usePedidosOperacionCounts,
  usePedidosOperacionPage,
} from '@/hooks/usePedidosOperacion';
import { ListPage, TABLE_CARD, SCROLL_AREA } from '@/components/layout/ListPage';

// ─── Data hooks ────────────────────────────────────────────

// Batch helper used only after an explicit bulk action; never during initial screen load.
async function fetchPedidoLineas(pedidoIds: string[]) {
  const ids = Array.from(new Set(pedidoIds.filter(Boolean)));
  const result: Record<string, any[]> = {};
  for (const id of ids) result[id] = [];
  if (ids.length === 0) return result;

  const lineas: any[] = [];
  const entregas: any[] = [];
  const chunkSize = 150;
  const concurrency = 4;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async chunk => {
      const [ventasPart, entregasPart] = await Promise.all([
        fetchAllPages<any>((from, to) =>
          supabase
            .from('venta_lineas')
            .select('id, venta_id, producto_id, unidad_id, lote_id, cantidad, descripcion, precio_unitario, productos(id, codigo, nombre, unidades:unidad_venta_id(abreviatura))')
            .in('venta_id', chunk)
            .order('created_at', { ascending: true })
            .range(from, to)
        ),
        fetchAllPages<any>((from, to) =>
          supabase
            .from('entregas')
            .select('pedido_id, status, entrega_lineas(producto_id, cantidad_entregada)')
            .in('pedido_id', chunk)
            .neq('status', 'cancelado')
            .range(from, to)
        ),
      ]);
      return { ventasPart, entregasPart };
    }));

    for (const part of batchResults) {
      lineas.push(...part.ventasPart);
      entregas.push(...part.entregasPart);
    }
  }

  const generada: Record<string, Record<string, number>> = {};
  const surtida: Record<string, Record<string, number>> = {};
  const entregada: Record<string, Record<string, number>> = {};
  const SURTIDO_STATUSES = new Set(['surtido', 'asignado', 'cargado', 'en_ruta', 'hecho']);

  for (const e of entregas) {
    if (!e.pedido_id) continue;
    for (const l of (e.entrega_lineas ?? [])) {
      if (!l.producto_id) continue;
      const qty = Number(l.cantidad_entregada ?? 0);
      if (e.status === 'borrador') {
        generada[e.pedido_id] ??= {};
        generada[e.pedido_id][l.producto_id] = (generada[e.pedido_id][l.producto_id] ?? 0) + qty;
      } else if (SURTIDO_STATUSES.has(e.status)) {
        surtida[e.pedido_id] ??= {};
        surtida[e.pedido_id][l.producto_id] = (surtida[e.pedido_id][l.producto_id] ?? 0) + qty;
        if (e.status === 'hecho') {
          entregada[e.pedido_id] ??= {};
          entregada[e.pedido_id][l.producto_id] = (entregada[e.pedido_id][l.producto_id] ?? 0) + qty;
        }
      }
    }
  }

  for (const l of lineas) {
    const pedidoId = l.venta_id;
    const productoId = l.producto_id;
    const cantidadGenerada = productoId ? (generada[pedidoId]?.[productoId] ?? 0) : 0;
    const cantidadSurtida = productoId ? (surtida[pedidoId]?.[productoId] ?? 0) : 0;
    const cantidadEntregada = productoId ? (entregada[pedidoId]?.[productoId] ?? 0) : 0;
    const cantidad = Number(l.cantidad ?? 0);

    result[pedidoId] ??= [];
    result[pedidoId].push({
      ...l,
      cantidad,
      precio_unitario: Number(l.precio_unitario ?? 0),
      cantidad_generada: cantidadGenerada,
      cantidad_surtida: cantidadSurtida,
      cantidad_entregada: cantidadEntregada,
      cantidad_pendiente: cantidad - cantidadSurtida - cantidadGenerada,
    });
  }

  return result;
}

function PedidoExpandedContent({
  pedidoId,
  fmt,
  onOpen,
}: {
  pedidoId: string;
  fmt: (n: number) => string;
  onOpen: () => void;
}) {
  const { data, isLoading, isError } = usePedidoDetalle(pedidoId, true);
  const lineas = data?.lineas ?? [];

  if (isLoading) {
    return (
      <div className="px-6 py-3 space-y-3" aria-label="Cargando productos del pedido">
        <div className="flex gap-4">
          <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          <div className="h-3 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="grid grid-cols-9 gap-3 py-1.5">
              {Array.from({ length: 9 }).map((_, j) => (
                <div key={j} className="h-3 rounded bg-muted/80 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-6 py-4 flex items-center justify-between gap-3">
        <span className="text-[12px] text-destructive">No se pudieron cargar los productos de este pedido.</span>
        <Button size="sm" variant="outline" onClick={onOpen}>Ver detalle <ExternalLink className="h-3 w-3" /></Button>
      </div>
    );
  }

  return (
    <div className="px-6 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted-foreground">
          {data?.clienteDireccion && <span><strong className="text-foreground">Dirección:</strong> {data.clienteDireccion}</span>}
          {data?.clienteTelefono && <span><strong className="text-foreground">Tel:</strong> {data.clienteTelefono}</span>}
          {data?.notas && <span><strong className="text-foreground">Notas:</strong> {data.notas}</span>}
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onOpen}>
          Ver detalle <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      {lineas.length === 0 ? (
        <p className="py-3 text-center text-[12px] text-muted-foreground">Sin productos</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-1 pr-2 font-medium">Código</th>
              <th className="text-left py-1 pr-2 font-medium">Producto</th>
              <th className="text-right py-1 pr-2 font-medium">Cantidad</th>
              <th className="text-right py-1 pr-2 font-medium">Generado</th>
              <th className="text-right py-1 pr-2 font-medium">Surtido</th>
              <th className="text-right py-1 pr-2 font-medium">Entregado</th>
              <th className="text-right py-1 pr-2 font-medium">Pendiente</th>
              <th className="text-right py-1 pr-2 font-medium">Precio</th>
              <th className="text-right py-1 font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l: any) => (
              <tr key={l.id} className="border-b border-border/40 last:border-0">
                <td className="py-1 pr-2 font-mono text-[11px]">{l.productos?.codigo ?? '—'}</td>
                <td className="py-1 pr-2">{l.productos?.nombre ?? '—'}</td>
                <td className="py-1 pr-2 text-right">{l.cantidad} {l.productos?.unidades?.abreviatura ?? ''}</td>
                <td className="py-1 pr-2 text-right text-blue-700">{l.cantidad_generada}</td>
                <td className="py-1 pr-2 text-right text-amber-700">{l.cantidad_surtida}</td>
                <td className="py-1 pr-2 text-right text-green-700">{l.cantidad_entregada}</td>
                <td className={cn('py-1 pr-2 text-right font-medium', l.cantidad_pendiente > 0 ? 'text-foreground' : 'text-muted-foreground')}>{Math.max(0, l.cantidad_pendiente)}</td>
                <td className="py-1 pr-2 text-right">{fmt(l.precio_unitario)}</td>
                <td className="py-1 text-right font-medium">{fmt(l.subtotal ?? l.cantidad * l.precio_unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


// ─── Component ────────────────────────────────────────────

export default function DemandaPage() {
  const { empresa, user } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const today = todayLocal();
  const weekStart = weekStartLocal();
  const weekEnd = weekEndLocal();

  // ── Filters ──
  const [tab, setTab] = useState<'pendientes' | 'generadas' | 'surtidos' | 'en_ruta' | 'entregados' | 'cerrados' | 'todos'>('pendientes');
  const [desde, setDesde] = useState(weekStart);
  const [hasta, setHasta] = useState(weekEnd);
  const [fechaTipo, setFechaTipo] = useState<'fecha' | 'fecha_entrega'>('fecha');
  const [vendedorFilter, setVendedorFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const debouncedSearch = useDebouncedValue(search, 350);
  const operationFilters = useMemo(() => ({
    desde,
    hasta,
    fechaTipo,
    vendedorIds: vendedorFilter.length > 0 ? vendedorFilter : undefined,
    search: debouncedSearch,
    tab,
    page,
    pageSize,
  }), [desde, hasta, fechaTipo, vendedorFilter, debouncedSearch, tab, page, pageSize]);

  const pageQuery = usePedidosOperacionPage(operationFilters);
  const countsQuery = usePedidosOperacionCounts(operationFilters);

  const pedidos = pageQuery.data?.rows ?? [];
  const counts = countsQuery.data?.counts ?? EMPTY_PEDIDO_COUNTS;
  const totalCount = countsQuery.data?.totalCount ?? 0;
  const isLoading = pageQuery.isLoading;
  const isFetching = pageQuery.isFetching || countsQuery.isFetching;
  const isSearchPending = !!search.trim() && (search !== debouncedSearch || isFetching);
  const pedidosError = pageQuery.error ?? countsQuery.error;
  const showAll = pageSize === 0;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));
  const pageStart = totalCount === 0 ? 0 : showAll ? 1 : page * pageSize + 1;
  const pageEnd = showAll ? totalCount : Math.min((page + 1) * pageSize, totalCount);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCrearDialog, setShowCrearDialog] = useState(false);
  const [showSurtirDialog, setShowSurtirDialog] = useState(false);
  const [showCerrarDialog, setShowCerrarDialog] = useState(false);
  const [almacenId, setAlmacenId] = useState('');
  const [vendedorRutaId, setVendedorRutaId] = useState('');
  const [surtirResult, setSurtirResult] = useState<null | { fully: any[]; partial: any[]; none: any[]; errors: any[] }>(null);
  const [vendedoresOpen, setVendedoresOpen] = useState(false);
  const [showAsignarDialog, setShowAsignarDialog] = useState(false);
  const [asignarRepartidorId, setAsignarRepartidorId] = useState('');

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
    setExpanded(new Set());
  }, [desde, hasta, fechaTipo, vendedorFilter, debouncedSearch, tab]);

  const goToPage = (nextPage: number) => {
    const bounded = Math.min(Math.max(nextPage, 0), Math.max(totalPages - 1, 0));
    setSelectedIds(new Set());
    setExpanded(new Set());
    setPage(bounded);
  };

  const prefetchTimerRef = useRef<number | null>(null);
  const scheduleDetallePrefetch = useCallback((pedidoId: string) => {
    if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = window.setTimeout(() => {
      void prefetchPedidoDetalle(qc, pedidoId);
      prefetchTimerRef.current = null;
    }, 180);
  }, [qc]);
  const cancelDetallePrefetch = useCallback(() => {
    if (prefetchTimerRef.current) {
      window.clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);
  useEffect(() => () => cancelDetallePrefetch(), [cancelDetallePrefetch]);

  // Fetch almacenes + vendedores
  const { data: almacenesList } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id && (showCrearDialog || showSurtirDialog),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: vendedoresList } = useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id && (vendedoresOpen || showCrearDialog || showSurtirDialog || showAsignarDialog),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
      return data ?? [];
    },
  });

  const almacenOptions = (almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const vendedorOptions = (vendedoresList ?? []).map(v => ({ value: v.id, label: v.nombre }));

  // La V2 ya filtra pestaña y búsqueda en servidor; sólo recibimos la página actual.
  const filtered = pedidos;


  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const selectedPedidos = filtered.filter(p => selectedIds.has(p.id));

  const hydrateSelectedPedidos = async () => {
    const cached: Record<string, any[]> = {};
    const missing: string[] = [];

    for (const pedido of selectedPedidos) {
      const detail = qc.getQueryData<any>(pedidosOperacionKeys.detalle(pedido.id));
      if (detail?.lineas) cached[pedido.id] = detail.lineas;
      else missing.push(pedido.id);
    }

    const fetched = missing.length > 0 ? await fetchPedidoLineas(missing) : {};
    return selectedPedidos.map(p => ({ ...p, venta_lineas: cached[p.id] ?? fetched[p.id] ?? [] }));
  };

  // Confirm pedidos (single or bulk)
  const confirmarPedidoMut = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return [];
      const { error } = await supabase
        .from('ventas')
        .update({ status: 'confirmado' })
        .in('id', ids)
        .eq('status', 'borrador');
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => {
      if (ids.length > 0) toast.success(`${ids.length} pedido(s) confirmado(s)`);
      void invalidatePedidoOperacion(qc, ids);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Bulk create entregas mutation
  const crearEntregasMut = useMutation({
    mutationFn: async () => {
      if (selectedPedidos.length === 0) throw new Error('Selecciona al menos un pedido');
      const pedidosConLineas = await hydrateSelectedPedidos();

      const createdIds: string[] = [];

      // Auto-confirm any borrador in the batch first
      const borradorIds = pedidosConLineas.filter(p => p.status === 'borrador').map(p => p.id);
      if (borradorIds.length > 0) {
        const { error: cErr } = await supabase
          .from('ventas')
          .update({ status: 'confirmado' })
          .in('id', borradorIds)
          .eq('status', 'borrador');
        if (cErr) throw cErr;
      }

      for (const pedido of pedidosConLineas) {
        const pendientes = pedido.venta_lineas.filter((l: any) => l.cantidad_pendiente > 0);
        if (pendientes.length === 0) continue;

        // Fetch client's saved route order
        let ordenEntrega = 0;
        if (pedido.cliente_id) {
          const { data: cli } = await supabase.from('clientes').select('orden').eq('id', pedido.cliente_id).single();
          ordenEntrega = cli?.orden ?? 0;
        }

        // Create entrega
        const { data: entrega, error } = await supabase.from('entregas').insert({
          empresa_id: empresa!.id,
          pedido_id: pedido.id,
          vendedor_id: pedido.vendedor_id ?? null,
          cliente_id: pedido.cliente_id,
          almacen_id: almacenId || null,
          vendedor_ruta_id: vendedorRutaId || null,
          status: 'borrador',
          fecha: today,
          orden_entrega: ordenEntrega,
        } as any).select('id, folio').single();
        if (error) throw error;

        // Create lines with pending quantities
        const { error: lErr } = await supabase.from('entrega_lineas').insert(
          pendientes.map((l: any) => ({
            entrega_id: entrega.id,
            producto_id: l.producto_id,
            unidad_id: l.unidad_id ?? null,
            cantidad_pedida: Math.max(0, l.cantidad_pendiente),
            cantidad_entregada: 0,
            hecho: false,
            // Lote apartado desde el pedido (si el vendedor lo eligió).
            lote_id: l.lote_id ?? null,
          }))
        );
        if (lErr) throw lErr;

        createdIds.push(entrega.id);
      }

      return createdIds;
    },
    onSuccess: (ids) => {
      toast.success(`${ids.length} entrega(s) creada(s)`);
      void invalidatePedidoOperacion(qc, selectedPedidos.map(p => p.id));
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      setSelectedIds(new Set());
      setShowCrearDialog(false);
      // If single, navigate to it
      if (ids.length === 1) {
        navigate(`/logistica/entregas/${ids[0]}`);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Surtir masivo: auto-fulfill with available stock ──
  const surtirMasivoMut = useMutation({
    mutationFn: async () => {
      if (!almacenId) throw new Error('Selecciona un almacén');
      if (selectedPedidos.length === 0) throw new Error('Selecciona al menos un pedido');
      const pedidosConLineas = await hydrateSelectedPedidos();

      // Si se eligió repartidor en este diálogo, validar que tenga almacén
      // para poder transicionar a 'cargado' y disparar el trigger de BD que
      // mueve stock origen → almacén del repartidor.
      let repartidorAlmacenOk = false;
      if (vendedorRutaId) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('almacen_id, nombre')
          .eq('id', vendedorRutaId)
          .maybeSingle();
        if (!prof?.almacen_id) {
          throw new Error(`El repartidor ${prof?.nombre ?? ''} no tiene almacén asignado en su perfil. Configúralo antes de cargar.`);
        }
        repartidorAlmacenOk = true;
      }

      // 1) Auto-confirm borradores
      const borradorIds = pedidosConLineas.filter(p => p.status === 'borrador').map(p => p.id);
      if (borradorIds.length > 0) {
        await supabase.from('ventas').update({ status: 'confirmado' }).in('id', borradorIds).eq('status', 'borrador');
      }


      // 2) Get current stock for all needed products in this almacen
      const productoIds = Array.from(new Set<string>(
        pedidosConLineas.flatMap(p => p.venta_lineas.filter((l: any) => l.cantidad_pendiente > 0).map((l: any) => String(l.producto_id)))
      ));
      const stockMap: Record<string, number> = {};
      if (productoIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < productoIds.length; i += chunkSize) {
          const chunk = productoIds.slice(i, i + chunkSize);
          const { data } = await supabase.from('stock_almacen')
            .select('producto_id, cantidad')
            .eq('almacen_id', almacenId)
            .in('producto_id', chunk);
          for (const r of (data ?? []) as any[]) {
            stockMap[r.producto_id] = (stockMap[r.producto_id] ?? 0) + Number(r.cantidad ?? 0);
          }
        }
      }

      const fully: any[] = [], partial: any[] = [], none: any[] = [], errors: any[] = [];

      for (const pedido of pedidosConLineas) {
        try {
          const pendientes = pedido.venta_lineas.filter((l: any) => l.cantidad_pendiente > 0);
          if (pendientes.length === 0) continue;

          // Decide what to surtir per line based on remaining stock
          const planLineas = pendientes.map((l: any) => {
            const need = Math.max(0, l.cantidad_pendiente);
            const avail = stockMap[l.producto_id] ?? 0;
            const give = Math.min(need, Math.max(0, avail));
            stockMap[l.producto_id] = avail - give;
            return { ...l, give, faltante: need - give };
          });

          const totalGive = planLineas.reduce((s, l) => s + l.give, 0);
          const totalFaltante = planLineas.reduce((s, l) => s + l.faltante, 0);

          if (totalGive === 0) {
            none.push({ pedido, faltantes: planLineas.filter(l => l.faltante > 0) });
            continue;
          }

          // Get orden_entrega
          let ordenEntrega = 0;
          if (pedido.cliente_id) {
            const { data: cli } = await supabase.from('clientes').select('orden').eq('id', pedido.cliente_id).single();
            ordenEntrega = cli?.orden ?? 0;
          }

          // 1) Reuse existing active entrega or create a new one
          let entrega: { id: string; folio: string } | null = null;
          const { data: existing } = await supabase
            .from('entregas')
            .select('id, folio, status')
            .eq('pedido_id', pedido.id)
            .neq('status', 'cancelado')
            .neq('status', 'hecho')
            .limit(1)
            .maybeSingle();

          if (existing) {
            entrega = { id: existing.id, folio: existing.folio };
            // Make sure default almacen is set on the entrega for stock deduction
            await supabase.from('entregas').update({ almacen_id: almacenId } as any).eq('id', existing.id);
          } else {
            const { data: created, error: eErr } = await supabase.from('entregas').insert({
              empresa_id: empresa!.id,
              pedido_id: pedido.id,
              vendedor_id: pedido.vendedor_id ?? null,
              cliente_id: pedido.cliente_id,
              almacen_id: almacenId,
              vendedor_ruta_id: vendedorRutaId || null,
              status: 'borrador',
              fecha: today,
              orden_entrega: ordenEntrega,
            } as any).select('id, folio').single();
            if (eErr) throw eErr;
            entrega = created;
          }

          // 2) Get existing lines so we don't duplicate; only insert missing ones
          const { data: existingLines } = await supabase
            .from('entrega_lineas')
            .select('id, producto_id, cantidad_pedida, cantidad_entregada, hecho')
            .eq('entrega_id', entrega!.id);

          const existingByProd: Record<string, any> = {};
          for (const el of (existingLines ?? []) as any[]) existingByProd[el.producto_id] = el;

          const linesToInsert = planLineas
            .filter(l => !existingByProd[l.producto_id])
            .map(l => ({
              entrega_id: entrega!.id,
              producto_id: l.producto_id,
              unidad_id: l.unidad_id ?? null,
              cantidad_pedida: Math.max(0, l.cantidad_pendiente),
              cantidad_entregada: 0,
              hecho: false,
              almacen_origen_id: almacenId,
              lote_id: (l as any).lote_id ?? null,
            }));

          let createdLines: any[] = (existingLines ?? []).map((el: any) => ({ id: el.id, producto_id: el.producto_id }));
          if (linesToInsert.length > 0) {
            const { data: inserted, error: lErr } = await supabase.from('entrega_lineas').insert(linesToInsert).select('id, producto_id');
            if (lErr) throw lErr;
            createdLines = createdLines.concat(inserted ?? []);
          }


          // 3) Surtir each line with stock via RPC
          const lineIdByProd: Record<string, string> = {};
          for (const cl of (createdLines ?? []) as any[]) lineIdByProd[cl.producto_id] = cl.id;

          let surtidasOk = 0;
          for (const l of planLineas) {
            if (l.give <= 0) continue;
            const lineId = lineIdByProd[l.producto_id];
            if (!lineId) continue;
            const { error } = await supabase.rpc('surtir_linea_entrega', {
              p_linea_id: lineId,
              p_producto_id: l.producto_id,
              p_almacen_origen_id: almacenId,
              p_cantidad_surtida: l.give,
              p_entrega_id: entrega.id,
              p_empresa_id: empresa!.id,
              p_user_id: user?.id,
            } as any);
            if (error) {
              // Stock changed between read and write — re-read and skip this line
              console.warn(`Línea ${l.producto_id} no se pudo surtir:`, error.message);
              l.give = 0;
              l.faltante = l.cantidad_pendiente;
            } else {
              surtidasOk++;
            }
          }

          // 4) Recompute faltantes after RPC outcomes
          const recompFaltante = planLineas.reduce((s, l) => s + l.faltante, 0);

          if (recompFaltante === 0 && surtidasOk > 0) {
            await supabase.from('entregas').update({ status: 'surtido' } as any).eq('id', entrega.id);
            // Si se seleccionó repartidor, transicionar asignado → cargado para
            // que el trigger mueva el stock al almacén del repartidor.
            if (repartidorAlmacenOk && vendedorRutaId) {
              const nowIso = new Date().toISOString();
              await supabase.from('entregas').update({
                vendedor_ruta_id: vendedorRutaId,
                status: 'asignado',
                fecha_asignacion: nowIso,
              } as any).eq('id', entrega.id);
              await supabase.from('entregas').update({
                status: 'cargado',
                fecha_carga: nowIso,
              } as any).eq('id', entrega.id);
            }
            fully.push({ pedido, entrega });
          } else if (surtidasOk > 0) {
            partial.push({ pedido, entrega, faltantes: planLineas.filter(l => l.faltante > 0) });
          } else {
            // entrega exists but nothing got surtido (race condition with stock)
            none.push({ pedido, entrega, faltantes: planLineas.filter(l => l.faltante > 0) });
          }

        } catch (err: any) {
          console.error(`Error procesando pedido ${pedido.folio}:`, err);
          errors.push({ pedido, message: err?.message ?? 'Error desconocido' });
        }
      }

      return { fully, partial, none, errors };
    },
    onSuccess: (res) => {
      const total = res.fully.length + res.partial.length + res.none.length + res.errors.length;
      toast.success(`${res.fully.length}/${total} completos · ${res.partial.length} parcial · ${res.none.length} sin stock${res.errors.length > 0 ? ` · ${res.errors.length} con error` : ''}`);
      void invalidatePedidoOperacion(qc, selectedPedidos.map(p => p.id));
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      setSelectedIds(new Set());
      setShowSurtirDialog(false);
      setSurtirResult(res);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const borradorSelectedIds = selectedPedidos.filter(p => p.status === 'borrador').map(p => p.id);

  // ── Contextual selection state ──
  const selectionState = useMemo(() => {
    const needsSurtir = selectedPedidos.some(p => p.totalPendiente > 0 || (!p.fullySurtido && !p.enRuta && !p.fullyDelivered));
    const surtidosSinRuta = selectedPedidos.some(p => p.fullySurtido && !p.enRuta && !p.fullyDelivered);
    const enRutaSel = selectedPedidos.some(p => p.enRuta && !p.fullyDelivered);
    const conEntregaActiva = selectedPedidos.some(p => (p.totalGenerada + p.totalSurtido) > 0 && !p.fullyDelivered);
    const conEntregaParcial = selectedPedidos.some(p => p.totalEntregado > 0 && p.totalEntregado < p.totalDemanda && !p.fullyDelivered);
    return { needsSurtir, surtidosSinRuta, enRutaSel, conEntregaActiva, conEntregaParcial };
  }, [selectedPedidos]);

  // ── Asignar / Cambiar repartidor en entregas activas ──
  // Además de fijar vendedor_ruta_id, transiciona la entrega:
  //   surtido → asignado → cargado  (para que el trigger de BD
  //   trg_apply_entrega_cargado_inventory mueva el stock al almacén del repartidor)
  const asignarRepartidorMut = useMutation({
    mutationFn: async () => {
      if (!asignarRepartidorId) throw new Error('Selecciona un repartidor');

      // Validar que el repartidor tiene almacén asignado
      const { data: prof } = await supabase
        .from('profiles')
        .select('almacen_id, nombre')
        .eq('id', asignarRepartidorId)
        .maybeSingle();
      if (!prof?.almacen_id) {
        throw new Error(`El repartidor ${prof?.nombre ?? ''} no tiene almacén asignado en su perfil. Configúralo antes de cargar.`);
      }

      const pedidoIds = selectedPedidos
        .filter(p => !p.fullyDelivered && (p.totalGenerada + p.totalSurtido) > 0)
        .map(p => p.id);
      if (pedidoIds.length === 0) throw new Error('No hay entregas activas para asignar');

      // Traer entregas activas afectadas
      const { data: entregas, error: eErr } = await supabase
        .from('entregas')
        .select('id, status, folio')
        .in('pedido_id', pedidoIds)
        .not('status', 'in', '(hecho,cancelado)');
      if (eErr) throw eErr;
      if (!entregas || entregas.length === 0) throw new Error('No hay entregas activas para asignar');

      const nowIso = new Date().toISOString();
      let cargadas = 0;
      let soloAsignadas = 0;
      let reasignadas = 0;
      const errores: string[] = [];

      for (const ent of entregas) {
        const st = ent.status as string;
        try {
          if (st === 'borrador' || st === 'pendiente') {
            // No surtido aún: sólo asignar repartidor, no se puede cargar stock
            await supabase.from('entregas').update({
              vendedor_ruta_id: asignarRepartidorId,
              status: 'asignado',
              fecha_asignacion: nowIso,
            } as any).eq('id', ent.id);
            soloAsignadas++;
          } else if (st === 'surtido') {
            // Surtido: asignar + cargar (trigger mueve stock origen → almacén repartidor)
            await supabase.from('entregas').update({
              vendedor_ruta_id: asignarRepartidorId,
              status: 'asignado',
              fecha_asignacion: nowIso,
            } as any).eq('id', ent.id);
            await supabase.from('entregas').update({
              status: 'cargado',
              fecha_carga: nowIso,
            } as any).eq('id', ent.id);
            cargadas++;
          } else if (st === 'asignado') {
            // Ya asignado pero no cargado: cambiar repartidor y cargar
            await supabase.from('entregas').update({
              vendedor_ruta_id: asignarRepartidorId,
              fecha_asignacion: nowIso,
            } as any).eq('id', ent.id);
            await supabase.from('entregas').update({
              status: 'cargado',
              fecha_carga: nowIso,
            } as any).eq('id', ent.id);
            cargadas++;
          } else {
            // cargado / en_ruta: sólo reasignar repartidor (stock ya movido)
            await supabase.from('entregas').update({
              vendedor_ruta_id: asignarRepartidorId,
            } as any).eq('id', ent.id);
            reasignadas++;
          }
        } catch (err: any) {
          errores.push(`${ent.folio ?? ent.id.slice(0, 8)}: ${err?.message ?? 'error'}`);
        }
      }

      if (errores.length > 0 && cargadas + soloAsignadas + reasignadas === 0) {
        throw new Error(errores.join(' · '));
      }
      return { cargadas, soloAsignadas, reasignadas, errores };
    },
    onSuccess: ({ cargadas, soloAsignadas, reasignadas, errores }) => {
      const partes: string[] = [];
      if (cargadas) partes.push(`${cargadas} cargada(s) al almacén del repartidor`);
      if (soloAsignadas) partes.push(`${soloAsignadas} asignada(s) (pendientes de surtir)`);
      if (reasignadas) partes.push(`${reasignadas} repartidor cambiado`);
      toast.success(partes.join(' · ') || 'Asignación aplicada');
      if (errores.length > 0) toast.error(`Errores: ${errores.slice(0, 3).join(' · ')}`);
      setShowAsignarDialog(false);
      setAsignarRepartidorId('');
      setSelectedIds(new Set());
      void invalidatePedidoOperacion(qc, selectedPedidos.map(p => p.id));
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['pedidos-pendientes'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Cancelar entregas activas (no las completadas) ──
  const cancelarEntregasMut = useMutation({
    mutationFn: async () => {
      const ids = selectedPedidos
        .filter(p => !p.fullyDelivered && (p.totalGenerada + p.totalSurtido) > 0)
        .map(p => p.id);
      if (ids.length === 0) throw new Error('No hay entregas activas que cancelar');
      const { error } = await supabase
        .from('entregas')
        .update({ status: 'cancelado' } as any)
        .in('pedido_id', ids)
        .not('status', 'in', '(hecho,cancelado)');
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Entregas canceladas en ${n} pedido(s)`);
      setSelectedIds(new Set());
      void invalidatePedidoOperacion(qc, selectedPedidos.map(p => p.id));
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['pedidos-pendientes'] });
    },
    onError: (err: any) => toast.error(err.message),
  });


  // Totals
  const totalPedidos = totalCount;
  const totalLineasPendientes = Number(countsQuery.data?.totalPendiente ?? 0);
  const totalValorPendiente = Number(countsQuery.data?.totalValorPendiente ?? 0);

  return (
    <ListPage scroll>
      <PedidosTabs />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Pedidos pendientes
        </h1>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {borradorSelectedIds.length > 0 && (
              <Button
                onClick={() => confirmarPedidoMut.mutate(borradorSelectedIds)}
                size="sm"
                variant="outline"
                disabled={confirmarPedidoMut.isPending}
                className="border-green-600 text-green-700 hover:bg-green-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirmar {borradorSelectedIds.length} pedido{borradorSelectedIds.length > 1 ? 's' : ''}
              </Button>
            )}
            {selectionState.needsSurtir && (
              <>
                <Button
                  onClick={() => setShowSurtirDialog(true)}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Surtir disponible ({selectedIds.size})
                </Button>
                <Button onClick={() => setShowCrearDialog(true)} size="sm" variant="outline">
                  <Package className="h-3.5 w-3.5" />
                  Crear {selectedIds.size} entrega{selectedIds.size > 1 ? 's' : ''}
                </Button>
              </>
            )}
            {(selectionState.surtidosSinRuta || selectionState.enRutaSel) && (
              <Button
                onClick={() => setShowAsignarDialog(true)}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {selectionState.enRutaSel ? 'Cambiar repartidor' : 'Asignar repartidor'}
              </Button>
            )}
            {selectionState.conEntregaActiva && (
              <Button
                onClick={() => {
                  if (confirm('¿Cancelar las entregas activas de los pedidos seleccionados? El stock se devolverá.')) {
                    cancelarEntregasMut.mutate();
                  }
                }}
                size="sm"
                variant="outline"
                disabled={cancelarEntregasMut.isPending}
                className="border-red-600 text-red-700 hover:bg-red-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancelar entrega
              </Button>
            )}
            {selectionState.conEntregaParcial && (
              <Button
                onClick={() => setShowCerrarDialog(true)}
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-700 hover:bg-amber-50"
              >
                <Lock className="h-3.5 w-3.5" />
                Cerrar a lo entregado
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pedidos pendientes</p>
          <p className="text-2xl font-bold text-foreground">{totalPedidos}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Unidades por surtir</p>
          <p className="text-2xl font-bold text-foreground">{totalLineasPendientes}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Valor pendiente</p>
          <p className="text-2xl font-bold text-primary">{fmt(totalValorPendiente)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end bg-card border border-border rounded-lg p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Filtrar por</Label>
          <Select value={fechaTipo} onValueChange={(v: any) => setFechaTipo(v)}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fecha">Fecha de levantamiento</SelectItem>
              <SelectItem value="fecha_entrega">Fecha programada de entrega</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Rango de fechas</Label>
          <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Vendedor</Label>
          <Popover open={vendedoresOpen} onOpenChange={setVendedoresOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 w-[200px] justify-between font-normal">
                <span className="truncate">
                  {vendedorFilter.length === 0
                    ? 'Todos los vendedores'
                    : vendedorFilter.length === 1
                      ? (vendedoresList ?? []).find((v: any) => v.id === vendedorFilter[0])?.nombre ?? '1 vendedor'
                      : `${vendedorFilter.length} vendedores`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-2 z-[60]" align="start">
              <button
                className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent text-muted-foreground"
                onClick={() => setVendedorFilter([])}
              >
                Todos los vendedores
              </button>
              <div className="max-h-60 overflow-y-auto mt-1 space-y-0.5">
                {(vendedoresList ?? []).map((v: any) => {
                  const checked = vendedorFilter.includes(v.id);
                  return (
                    <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setVendedorFilter(prev => checked ? prev.filter(id => id !== v.id) : [...prev, v.id])
                        }
                      />
                      <span className="truncate">{v.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-[11px] text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Folio, cliente, vendedor o producto..." className="pl-9 pr-9 h-9" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
            {isSearchPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" aria-label="Buscando" />
            )}
          </div>
        </div>
        {(vendedorFilter.length > 0 || search || desde || hasta || fechaTipo !== 'fecha' || tab !== 'pendientes') && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => {
            setVendedorFilter([]); setSearch(''); setTab('pendientes');
            setDesde(''); setHasta(''); setFechaTipo('fecha');
          }}>
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      {/* Status tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px">
          {([
            { key: 'pendientes', label: 'Pendientes', count: counts.pendientes },
            { key: 'generadas', label: 'Pendiente de surtir', count: counts.generadas },
            { key: 'surtidos', label: 'Surtidos', count: counts.surtidos },
            { key: 'en_ruta', label: 'En ruta', count: counts.en_ruta },
            { key: 'entregados', label: 'Entregados', count: counts.entregados },
            { key: 'cerrados', label: 'Cerrados', count: counts.cerrados },
            { key: 'todos', label: 'Todos', count: counts.todos },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {t.label} <span className="ml-1 text-xs opacity-70">({t.count})</span>
            </button>
          ))}
        </nav>
      </div>

      {selectedIds.size > 0 && (
        <p className="text-sm text-muted-foreground">{selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}</p>
      )}


      {isLoading && <p className="text-muted-foreground">Cargando pedidos...</p>}
      {pedidosError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          No se pudieron cargar los pedidos: {(pedidosError as any)?.message ?? 'error de consulta'}
        </div>
      )}


      {totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border rounded-lg bg-card px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Mostrando {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} de {totalCount.toLocaleString()} pedidos
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Ver</span>
              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(0); setSelectedIds(new Set()); setExpanded(new Set()); }}>
                <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="0">Todo</SelectItem>
                </SelectContent>
              </Select>
              {showAll && <span className="text-[10px] text-amber-600">Puede tardar más</span>}
            </div>
          </div>
          {!showAll ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 0 || isFetching}>Anterior</Button>
              <span className="text-xs text-muted-foreground min-w-[100px] text-center">Página {(page + 1).toLocaleString()} de {totalPages.toLocaleString()}</span>
              <Button variant="outline" size="sm" onClick={() => goToPage(page + 1)} disabled={page + 1 >= totalPages || isFetching}>Siguiente</Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Todos los registros</span>
          )}
        </div>
      )}

      {/* Pedidos table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px]">Repartidor</TableHead>
              <TableHead className="text-[11px]">Programada entrega</TableHead>
              <TableHead className="text-[11px]">Fecha entrega</TableHead>
              <TableHead className="text-[11px] text-right">Total</TableHead>
              <TableHead className="text-[11px] text-center w-28">Surtido</TableHead>
              <TableHead className="text-[11px] text-center w-28">Entregado</TableHead>
              <TableHead className="text-[11px] text-center w-20">Pendiente</TableHead>
              <TableHead className="text-[11px] text-center w-28">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground py-12">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No hay pedidos pendientes de surtir
                </TableCell>
              </TableRow>
            )}
            {filtered.map(pedido => {
              const isSelected = selectedIds.has(pedido.id);
              const isExpanded = expanded.has(pedido.id);
              return (
                <Fragment key={pedido.id}>
                <TableRow
                  className={cn("cursor-pointer hover:bg-accent/50 transition-colors", isSelected && "bg-primary/5", isExpanded && "bg-accent/30")}
                  onMouseEnter={() => scheduleDetallePrefetch(pedido.id)}
                  onMouseLeave={cancelDetallePrefetch}
                  onClick={() => setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(pedido.id)) next.delete(pedido.id); else next.add(pedido.id);
                    return next;
                  })}
                >
                  <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(pedido.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] font-bold text-primary py-2">
                    <span className="inline-flex items-center gap-1">
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {pedido.folio}
                    </span>
                  </TableCell>
                  <TableCell className="text-[12px] font-medium py-2">{pedido.clientes?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{pedido.vendedores?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{fmtDate(pedido.fecha)}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">
                    {pedido.vendedorRutaId ? (pedido.vendedorRutaNombre ?? '—') : <span className="text-muted-foreground/60">Sin asignar</span>}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">
                    {pedido.fechaProgramada ? fmtDate(pedido.fechaProgramada) : <span className="text-muted-foreground/60">—</span>}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">
                    {pedido.fechaEntrega ? fmtDate(pedido.fechaEntrega) : <span className="text-muted-foreground/60">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-[12px] font-medium py-2">{fmt(pedido.total)}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pedido.pctSurtido}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground w-8">{pedido.pctSurtido}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${pedido.pctEntregado}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground w-8">{pedido.pctEntregado}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-[12px] font-bold text-foreground py-2">{pedido.totalPendiente}</TableCell>
                  <TableCell className="text-center py-2" onClick={e => e.stopPropagation()}>
                    {pedido.status === 'cancelado' ? (
                      <Badge variant="outline" className="text-[10px] border-red-500 text-red-700">Cancelado</Badge>
                    ) : pedido.status === 'facturado' ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-600 text-emerald-700">Facturado</Badge>
                    ) : pedido.estadoOdoo === 'entregado' ? (
                      <Badge className="text-[10px] bg-green-600 text-white hover:bg-green-600">Entregado</Badge>
                    ) : pedido.estadoOdoo === 'en_ruta' ? (
                      <Badge className="text-[10px] bg-purple-600 text-white hover:bg-purple-600">En ruta</Badge>
                    ) : pedido.estadoOdoo === 'surtido_completo' ? (
                      <Badge variant="outline" className="text-[10px] border-amber-600 text-amber-700">Surtido completo</Badge>
                    ) : pedido.estadoOdoo === 'surtido_parcial' ? (
                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">Surtido parcial</Badge>
                    ) : pedido.estadoOdoo === 'pendiente_surtir' ? (
                      <Badge variant="outline" className="text-[10px] border-blue-600 text-blue-700">Pendiente de surtir</Badge>
                    ) : pedido.estadoOdoo === 'en_surtido' ? (
                      <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-600">En surtido</Badge>
                    ) : pedido.status === 'borrador' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] border-green-600 text-green-700 hover:bg-green-50"
                        onClick={() => confirmarPedidoMut.mutate([pedido.id])}
                        disabled={confirmarPedidoMut.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Confirmar
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-primary text-primary">
                        Confirmado
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={13} className="bg-muted/30 p-0">
                      <PedidoExpandedContent
                        pedidoId={pedido.id}
                        fmt={fmt}
                        onOpen={() => navigate(`/logistica/pedidos/${pedido.id}`)}
                      />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>


      {/* Create entregas dialog */}
      <Dialog open={showCrearDialog} onOpenChange={setShowCrearDialog}>
        <DialogContent
          className="w-[min(96vw,1180px)] sm:max-w-5xl max-h-[92dvh] overflow-visible flex flex-col gap-4"
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Crear {selectedPedidos.length} entrega{selectedPedidos.length > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 flex-1 min-h-0">
            <p className="text-sm text-muted-foreground max-w-3xl">
              Se creará una entrega por cada pedido seleccionado con las cantidades pendientes. Después podrás surtir línea a línea desde la entrega.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-20">
              <div>
                <label className="label-odoo">Almacén origen (por defecto)</label>
                <ModalSelect
                  options={almacenOptions}
                  value={almacenId}
                  onChange={setAlmacenId}
                  placeholder="Seleccionar almacén..."
                />
              </div>
              <div>
                <label className="label-odoo">Repartidor</label>
                <ModalSelect
                  options={vendedorOptions}
                  value={vendedorRutaId}
                  onChange={setVendedorRutaId}
                  placeholder="Opcional — asignar después"
                />
              </div>
            </div>

            {/* Preview of selected pedidos */}
            <div className="border border-border rounded-md h-[min(48dvh,430px)] min-h-[260px] overflow-auto relative z-10 bg-background">
              <table className="w-full min-w-[720px] text-[12px]">
                <thead>
                  <tr className="border-b bg-card">
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Folio</th>
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Cliente</th>
                    <th className="px-3 py-1.5 text-right text-muted-foreground font-medium">Líneas pend.</th>
                    <th className="px-3 py-1.5 text-right text-muted-foreground font-medium">Uds pend.</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPedidos.map(p => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="px-3 py-1.5 font-mono font-bold">{p.folio}</td>
                      <td className="px-3 py-1.5">{p.clientes?.nombre ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right">{p.lineasPendientes}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{p.totalPendiente}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border pt-4 bg-background">
            <Button variant="outline" onClick={() => setShowCrearDialog(false)}>Cancelar</Button>
            <Button onClick={() => crearEntregasMut.mutate()} disabled={crearEntregasMut.isPending}>
              <Truck className="h-3.5 w-3.5" />
              Crear entrega{selectedPedidos.length > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Surtir masivo dialog */}
      <Dialog open={showSurtirDialog} onOpenChange={setShowSurtirDialog}>
        <DialogContent
          className="w-[min(94vw,920px)] sm:max-w-3xl min-h-[520px] max-h-[90dvh] overflow-visible flex flex-col gap-4"
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-600" />
              Surtir disponible — {selectedPedidos.length} pedido{selectedPedidos.length > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2 flex-1 min-h-0">
            <p className="text-sm text-muted-foreground max-w-3xl">
              Se creará una entrega por pedido y se surtirá automáticamente <strong>solo lo que haya en stock</strong> del almacén seleccionado. Los pedidos que no se completen quedarán marcados como parciales.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-20">
            <div>
              <label className="label-odoo">Almacén origen *</label>
              <ModalSelect
                options={almacenOptions}
                value={almacenId}
                onChange={setAlmacenId}
                placeholder="Seleccionar almacén..."
              />
            </div>
            <div>
              <label className="label-odoo">Repartidor (opcional)</label>
              <ModalSelect
                options={vendedorOptions}
                value={vendedorRutaId}
                onChange={setVendedorRutaId}
                placeholder="Asignar después"
              />
            </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border pt-4 bg-background">
            <Button variant="outline" onClick={() => setShowSurtirDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => surtirMasivoMut.mutate()}
              disabled={surtirMasivoMut.isPending || !almacenId}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Zap className="h-3.5 w-3.5" />
              {surtirMasivoMut.isPending ? 'Surtiendo...' : 'Surtir ahora'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asignar / Cambiar repartidor dialog */}
      <Dialog open={showAsignarDialog} onOpenChange={setShowAsignarDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-purple-600" />
              {selectionState.enRutaSel ? 'Cambiar repartidor' : 'Asignar repartidor'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Se asignará a las entregas activas de {selectedPedidos.length} pedido(s) seleccionado(s).
            </p>
            <div>
              <Label className="text-xs">Repartidor</Label>
              <Select value={asignarRepartidorId} onValueChange={setAsignarRepartidorId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar repartidor" /></SelectTrigger>
                <SelectContent>
                  {vendedorOptions.map(v => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAsignarDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => asignarRepartidorMut.mutate()}
              disabled={asignarRepartidorMut.isPending || !asignarRepartidorId}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {asignarRepartidorMut.isPending ? 'Asignando...' : 'Asignar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Result dialog: shows partial / not-surtido alerts */}
      <Dialog open={!!surtirResult} onOpenChange={(o) => !o && setSurtirResult(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Resultado del surtido
            </DialogTitle>
          </DialogHeader>
          {surtirResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{surtirResult.fully.length}</p>
                  <p className="text-[11px] text-green-700 uppercase">Completos</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{surtirResult.partial.length}</p>
                  <p className="text-[11px] text-amber-700 uppercase">Parciales</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{surtirResult.none.length}</p>
                  <p className="text-[11px] text-red-700 uppercase">Sin stock</p>
                </div>
              </div>

              {surtirResult.partial.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-amber-700 mb-1">Pedidos parcialmente surtidos</p>
                  <div className="border border-amber-200 rounded-md divide-y divide-amber-100">
                    {surtirResult.partial.map(({ pedido, entrega, faltantes }: any) => (
                      <div key={pedido.id} className="p-2 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-primary">{pedido.folio}</span>
                          <span className="text-muted-foreground">{pedido.clientes?.nombre}</span>
                          <button className="text-primary hover:underline text-[11px]" onClick={() => navigate(`/logistica/entregas/${entrega.id}`)}>
                            Ver entrega {entrega.folio} <ExternalLink className="h-3 w-3 inline" />
                          </button>
                        </div>
                        <ul className="ml-3 mt-1 text-muted-foreground text-[11px] list-disc list-inside">
                          {faltantes.map((l: any) => (
                            <li key={l.id}>
                              {l.productos?.codigo} · {l.productos?.nombre} — faltan <strong className="text-amber-700">{l.faltante}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {surtirResult.none.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-1">Pedidos sin stock (no se surtió nada)</p>
                  <div className="border border-red-200 rounded-md divide-y divide-red-100">
                    {surtirResult.none.map(({ pedido, faltantes }: any) => (
                      <div key={pedido.id} className="p-2 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-primary">{pedido.folio}</span>
                          <span className="text-muted-foreground">{pedido.clientes?.nombre}</span>
                        </div>
                        <ul className="ml-3 mt-1 text-muted-foreground text-[11px] list-disc list-inside">
                          {faltantes.map((l: any) => (
                            <li key={l.id}>
                              {l.productos?.codigo} · {l.productos?.nombre} — faltan <strong className="text-red-700">{l.faltante}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {surtirResult.errors.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-1">Pedidos con error</p>
                  <div className="border border-red-200 rounded-md divide-y divide-red-100">
                    {surtirResult.errors.map(({ pedido, message }: any) => (
                      <div key={pedido.id} className="p-2 text-[12px] flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-primary">{pedido.folio}</span>
                        <span className="text-muted-foreground flex-1">{pedido.clientes?.nombre}</span>
                        <span className="text-red-700 text-[11px] truncate max-w-[260px]" title={message}>{message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSurtirResult(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkCerrarPedidosDialog
        open={showCerrarDialog}
        onOpenChange={setShowCerrarDialog}
        ventaIds={selectedPedidos.map(p => p.id)}
        fmt={(n) => fmt(n)}
        onDone={() => setSelectedIds(new Set())}
      />
    </ListPage>
  );
}
