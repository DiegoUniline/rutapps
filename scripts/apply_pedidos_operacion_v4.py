from pathlib import Path

p = Path('src/pages/DemandaPage.tsx')
s = p.read_text(encoding='utf-8')

# Imports
s = s.replace(
    "import React, { useState, useMemo, Fragment, useDeferredValue, useEffect } from 'react';",
    "import React, { useState, useMemo, Fragment, useEffect, useRef, useCallback } from 'react';"
)
anchor = "import { BulkCerrarPedidosDialog } from '@/components/venta/BulkCerrarPedidosDialog';\n"
new_import = """import { BulkCerrarPedidosDialog } from '@/components/venta/BulkCerrarPedidosDialog';
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
"""
if anchor not in s:
    raise SystemExit('import anchor not found')
s = s.replace(anchor, new_import, 1)

# Remove old monolithic data hook; keep batch helper for explicit bulk actions only.
start = s.index('interface DemandaFilters')
end = s.index('async function fetchPedidoLineas', start)
s = s[:start] + "// Batch helper used only after an explicit bulk action; never during initial screen load.\n" + s[end:]

# Replace old detail rows with a cached, isolated lazy detail component.
start = s.index('function PedidoLineasRows(')
end = s.index('// ─── Component', start)
new_detail = r'''function PedidoExpandedContent({
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


'''
s = s[:start] + new_detail + s[end:]

# Split initial load into two predictable RPCs: page + counters.
old_start = s.index('  const deferredSearch = useDeferredValue(search);')
old_end = s.index('  const [selectedIds, setSelectedIds]', old_start)
new_query = r'''  const debouncedSearch = useDebouncedValue(search, 350);
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

'''
s = s[:old_start] + new_query + s[old_end:]

# Lazy auxiliary catalogs: they are not required to paint the initial table.
s = s.replace(
    "  const [surtirResult, setSurtirResult] = useState<null | { fully: any[]; partial: any[]; none: any[]; errors: any[] }>(null);",
    "  const [surtirResult, setSurtirResult] = useState<null | { fully: any[]; partial: any[]; none: any[]; errors: any[] }>(null);\n  const [vendedoresOpen, setVendedoresOpen] = useState(false);"
)
s = s.replace('  }, [desde, hasta, fechaTipo, vendedorFilter, deferredSearch, tab]);', '  }, [desde, hasta, fechaTipo, vendedorFilter, debouncedSearch, tab]);')

s = s.replace(
    "enabled: !!empresa?.id,\n    queryFn: async () => {\n      const { data } = await supabase.from('almacenes')",
    "enabled: !!empresa?.id && (showCrearDialog || showSurtirDialog),\n    staleTime: 5 * 60_000,\n    refetchOnWindowFocus: false,\n    queryFn: async () => {\n      const { data } = await supabase.from('almacenes')",
    1
)
s = s.replace(
    "enabled: !!empresa?.id,\n    queryFn: async () => {\n      const { data } = await supabase.from('profiles')",
    "enabled: !!empresa?.id && (vendedoresOpen || showCrearDialog || showSurtirDialog || showAsignarDialog),\n    staleTime: 5 * 60_000,\n    refetchOnWindowFocus: false,\n    queryFn: async () => {\n      const { data } = await supabase.from('profiles')",
    1
)

# Reuse cached details for bulk actions; missing pedidos are still fetched in a compact batch.
old = """  const hydrateSelectedPedidos = async () => {
    const byPedido = await fetchPedidoLineas(selectedPedidos.map(p => p.id));
    return selectedPedidos.map(p => ({ ...p, venta_lineas: byPedido[p.id] ?? [] }));
  };"""
new = """  const hydrateSelectedPedidos = async () => {
    const cached: Record<string, any[]> = {};
    const missing: string[] = [];

    for (const pedido of selectedPedidos) {
      const detail = qc.getQueryData<any>(pedidosOperacionKeys.detalle(pedido.id));
      if (detail?.lineas) cached[pedido.id] = detail.lineas;
      else missing.push(pedido.id);
    }

    const fetched = missing.length > 0 ? await fetchPedidoLineas(missing) : {};
    return selectedPedidos.map(p => ({ ...p, venta_lineas: cached[p.id] ?? fetched[p.id] ?? [] }));
  };"""
if old not in s:
    raise SystemExit('hydrate block not found')
s = s.replace(old, new, 1)

# Replace monolithic invalidation with the precise operation domain. Keep Entregas/stock where business actions alter them.
s = s.replace("      qc.invalidateQueries({ queryKey: ['demanda'] });", "      void invalidatePedidoOperacion(qc, selectedPedidos.map(p => p.id));")
s = s.replace("      qc.invalidateQueries({ queryKey: ['ventas'] });\n", "")
s = s.replace("      qc.invalidateQueries({ queryKey: ['productos'] });\n", "")
# Confirmar can be invoked from an unselected row, so use its explicit ids.
s = s.replace(
    """    onSuccess: (ids) => {
      if (ids.length > 0) toast.success(`${ids.length} pedido(s) confirmado(s)`);
      void invalidatePedidoOperacion(qc, selectedPedidos.map(p => p.id));
    },""",
    """    onSuccess: (ids) => {
      if (ids.length > 0) toast.success(`${ids.length} pedido(s) confirmado(s)`);
      void invalidatePedidoOperacion(qc, ids);
    },""",
    1
)

# Prefetch on intent (hover dwell) without flooding Supabase.
go_marker = """  const goToPage = (nextPage: number) => {
    const bounded = Math.min(Math.max(nextPage, 0), Math.max(totalPages - 1, 0));
    setSelectedIds(new Set());
    setExpanded(new Set());
    setPage(bounded);
  };
"""
prefetch_block = go_marker + r'''
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
'''
if go_marker not in s:
    raise SystemExit('goToPage marker not found')
s = s.replace(go_marker, prefetch_block, 1)

# Seller catalog is fetched only when the popover is opened.
s = s.replace('<Popover>\n            <PopoverTrigger asChild>', '<Popover open={vendedoresOpen} onOpenChange={setVendedoresOpen}>\n            <PopoverTrigger asChild>', 1)

# Search UX: explicit 350 ms debounce + spinner while debounce/request is pending.
s = s.replace('placeholder="Folio o cliente..."', 'placeholder="Folio, cliente, vendedor o producto..."', 1)
s = s.replace('{isFetching && search.trim() && (', '{isSearchPending && (', 1)

# Repartidor name now comes from the lightweight page RPC; no auxiliary catalog required initially.
s = s.replace(
    "pedido.vendedorRutaId ? (vendedoresList?.find(v => v.id === pedido.vendedorRutaId)?.nombre ?? '—') : <span className=\"text-muted-foreground/60\">Sin asignar</span>",
    "pedido.vendedorRutaId ? (pedido.vendedorRutaNombre ?? '—') : <span className=\"text-muted-foreground/60\">Sin asignar</span>"
)

# Add hover-intent prefetch to each row.
row_old = '''                <TableRow
                  className={cn("cursor-pointer hover:bg-accent/50 transition-colors", isSelected && "bg-primary/5", isExpanded && "bg-accent/30")}
                  onClick={() => setExpanded(prev => {'''
row_new = '''                <TableRow
                  className={cn("cursor-pointer hover:bg-accent/50 transition-colors", isSelected && "bg-primary/5", isExpanded && "bg-accent/30")}
                  onMouseEnter={() => scheduleDetallePrefetch(pedido.id)}
                  onMouseLeave={cancelDetallePrefetch}
                  onClick={() => setExpanded(prev => {'''
if row_old not in s:
    raise SystemExit('row marker not found')
s = s.replace(row_old, row_new, 1)

# Expansion contains only the isolated detail component; no secondary fields are carried in the page payload.
exp_start_marker = '''                {isExpanded && (
                  <TableRow className="hover:bg-transparent">'''
exp_start = s.index(exp_start_marker)
exp_end_marker = '''                )}
                </Fragment>'''
exp_end = s.index(exp_end_marker, exp_start)
replacement = '''                {isExpanded && (
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
'''
s = s[:exp_start] + replacement + s[exp_end + len('                )}\n'):]

# New counts query owns summary cards.
s = s.replace('  const totalLineasPendientes = Number(pedidosResult?.totalPendiente ?? 0);', '  const totalLineasPendientes = Number(countsQuery.data?.totalPendiente ?? 0);')
s = s.replace('  const totalValorPendiente = Number(pedidosResult?.totalValorPendiente ?? 0);', '  const totalValorPendiente = Number(countsQuery.data?.totalValorPendiente ?? 0);')

p.write_text(s, encoding='utf-8')
