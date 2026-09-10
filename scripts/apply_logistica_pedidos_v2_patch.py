from pathlib import Path

path = Path('src/pages/DemandaPage.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'Pattern not found: {label}')
    text = text.replace(old, new, 1)

replace_once(
    "import React, { useState, useMemo, Fragment, useDeferredValue } from 'react';",
    "import React, { useState, useMemo, Fragment, useDeferredValue, useEffect } from 'react';",
    'react import',
)

start = text.index('interface DemandaFilters {')
end = text.index('async function fetchPedidoLineas')
new_hook = r'''interface DemandaFilters {
  desde: string;
  hasta: string;
  fechaTipo: 'fecha' | 'fecha_entrega';
  vendedorIds?: string[];
  search?: string;
  tab: 'pendientes' | 'generadas' | 'surtidos' | 'en_ruta' | 'entregados' | 'cerrados' | 'todos';
  page: number;
  pageSize: number;
}

const EMPTY_COUNTS = {
  pendientes: 0,
  generadas: 0,
  surtidos: 0,
  en_ruta: 0,
  entregados: 0,
  cerrados: 0,
  todos: 0,
};

function usePedidosPendientes(filters: DemandaFilters) {
  const { empresa } = useAuth();

  return useQuery({
    queryKey: ['demanda', 'workspace-rpc-v2', empresa?.id, filters],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('fn_logistica_pedidos_workspace_v2', {
        p_empresa_id: empresa!.id,
        p_fecha_desde: filters.desde || null,
        p_fecha_hasta: filters.hasta || null,
        p_fecha_tipo: filters.fechaTipo === 'fecha_entrega' ? 'programada' : 'levantamiento',
        p_vendedor_ids: filters.vendedorIds?.length ? filters.vendedorIds : null,
        p_search: filters.search?.trim() || null,
        p_tab: filters.tab,
        p_page_size: filters.pageSize,
        p_offset: filters.page * filters.pageSize,
      });
      if (error) throw error;

      const payload = data ?? {};
      const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
      const rows = rawRows.map((row: any) => ({
        id: row.id,
        folio: row.folio,
        cliente_id: row.cliente_id,
        clientes: {
          nombre: row.cliente_nombre,
          direccion: row.cliente_direccion,
          telefono: row.cliente_telefono,
        },
        vendedor_id: row.vendedor_id,
        vendedores: { nombre: row.vendedor_nombre },
        status: row.status,
        fecha: row.fecha,
        total: Number(row.total ?? 0),
        cerrado_at: row.cerrado_at,
        notas: row.notas,
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
        fechaEntrega: row.fecha_entrega_real,
      }));

      const rawCounts = payload.counts ?? {};
      return {
        rows,
        totalCount: Number(payload.total_count ?? 0),
        totalPendiente: Number(payload.total_pendiente ?? 0),
        totalValorPendiente: Number(payload.total_valor_pendiente ?? 0),
        counts: {
          pendientes: Number(rawCounts.pendientes ?? 0),
          generadas: Number(rawCounts.generadas ?? 0),
          surtidos: Number(rawCounts.surtidos ?? 0),
          en_ruta: Number(rawCounts.en_ruta ?? 0),
          entregados: Number(rawCounts.entregados ?? 0),
          cerrados: Number(rawCounts.cerrados ?? 0),
          todos: Number(rawCounts.todos ?? 0),
        },
      };
    },
  });
}

'''
text = text[:start] + new_hook + text[end:]

replace_once(
    "  const [expanded, setExpanded] = useState<Set<string>>(new Set());\n\n  const deferredSearch = useDeferredValue(search);\n\n  const { data: pedidos, isLoading, error: pedidosError } = usePedidosPendientes({\n    desde,\n    hasta,\n    fechaTipo,\n    vendedorIds: vendedorFilter.length > 0 ? vendedorFilter : undefined,\n    search: deferredSearch,\n  });",
    "  const [expanded, setExpanded] = useState<Set<string>>(new Set());\n  const [page, setPage] = useState(0);\n  const pageSize = 50;\n\n  const deferredSearch = useDeferredValue(search);\n\n  const { data: pedidosResult, isLoading, isFetching, error: pedidosError } = usePedidosPendientes({\n    desde,\n    hasta,\n    fechaTipo,\n    vendedorIds: vendedorFilter.length > 0 ? vendedorFilter : undefined,\n    search: deferredSearch,\n    tab,\n    page,\n    pageSize,\n  });\n\n  const pedidos = pedidosResult?.rows ?? [];\n  const counts = pedidosResult?.counts ?? EMPTY_COUNTS;\n  const totalCount = pedidosResult?.totalCount ?? 0;\n  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));\n  const pageStart = totalCount === 0 ? 0 : page * pageSize + 1;\n  const pageEnd = Math.min((page + 1) * pageSize, totalCount);",
    'component query block',
)

replace_once(
    "  const [surtirResult, setSurtirResult] = useState<null | { fully: any[]; partial: any[]; none: any[]; errors: any[] }>(null);\n\n  // Fetch almacenes + vendedores",
    "  const [surtirResult, setSurtirResult] = useState<null | { fully: any[]; partial: any[]; none: any[]; errors: any[] }>(null);\n\n  useEffect(() => {\n    setPage(0);\n    setSelectedIds(new Set());\n    setExpanded(new Set());\n  }, [desde, hasta, fechaTipo, vendedorFilter, deferredSearch, tab]);\n\n  const goToPage = (nextPage: number) => {\n    const bounded = Math.min(Math.max(nextPage, 0), Math.max(totalPages - 1, 0));\n    setSelectedIds(new Set());\n    setExpanded(new Set());\n    setPage(bounded);\n  };\n\n  // Fetch almacenes + vendedores",
    'pagination effects',
)

counts_start = text.index('  // Counts per tab (based on currently-loaded set)')
counts_end_marker = '  }, [pedidos, search, tab]);\n\n'
counts_end = text.index(counts_end_marker, counts_start) + len(counts_end_marker)
text = text[:counts_start] + '  // La V2 ya filtra pestaña y búsqueda en servidor; sólo recibimos la página actual.\n  const filtered = pedidos;\n\n' + text[counts_end:]

replace_once(
    "  const totalPedidos = filtered.length;\n  const totalLineasPendientes = filtered.reduce((s, p) => s + p.totalPendiente, 0);\n  const totalValorPendiente = filtered.reduce((s, p) => s + Number(p.totalValorPendiente ?? 0), 0);",
    "  const totalPedidos = totalCount;\n  const totalLineasPendientes = Number(pedidosResult?.totalPendiente ?? 0);\n  const totalValorPendiente = Number(pedidosResult?.totalValorPendiente ?? 0);",
    'summary totals',
)

replace_once(
    "        {(vendedorFilter.length > 0 || search || desde !== weekStart || hasta !== weekEnd || fechaTipo !== 'fecha' || tab !== 'pendientes') && (\n          <Button variant=\"ghost\" size=\"sm\" className=\"h-9\" onClick={() => {\n            setVendedorFilter([]); setSearch(''); setTab('pendientes');\n            setDesde(weekStart); setHasta(weekEnd); setFechaTipo('fecha');\n          }}>",
    "        {(vendedorFilter.length > 0 || search || desde || hasta || fechaTipo !== 'fecha' || tab !== 'pendientes') && (\n          <Button variant=\"ghost\" size=\"sm\" className=\"h-9\" onClick={() => {\n            setVendedorFilter([]); setSearch(''); setTab('pendientes');\n            setDesde(''); setHasta(''); setFechaTipo('fecha');\n          }}>",
    'clear filters',
)

replace_once(
    "      {isLoading && <p className=\"text-muted-foreground\">Cargando...</p>}",
    "      {(isLoading || isFetching) && <p className=\"text-muted-foreground\">Cargando pedidos...</p>}",
    'loading text',
)

replace_once(
    "                    {pedido.estadoOdoo === 'entregado' ? (",
    "                    {pedido.status === 'cancelado' ? (\n                      <Badge variant=\"outline\" className=\"text-[10px] border-red-500 text-red-700\">Cancelado</Badge>\n                    ) : pedido.status === 'facturado' ? (\n                      <Badge variant=\"outline\" className=\"text-[10px] border-emerald-600 text-emerald-700\">Facturado</Badge>\n                    ) : pedido.estadoOdoo === 'entregado' ? (",
    'terminal status badges',
)

replace_once(
    "          </TableBody>\n        </Table>\n      </div>\n\n      {/* Create entregas dialog */}",
    "          </TableBody>\n        </Table>\n      </div>\n\n      {totalCount > 0 && (\n        <div className=\"flex items-center justify-between gap-3 border border-border rounded-lg bg-card px-3 py-2\">\n          <span className=\"text-xs text-muted-foreground\">\n            Mostrando {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} de {totalCount.toLocaleString()} pedidos\n          </span>\n          <div className=\"flex items-center gap-2\">\n            <Button variant=\"outline\" size=\"sm\" onClick={() => goToPage(page - 1)} disabled={page <= 0 || isFetching}>\n              Anterior\n            </Button>\n            <span className=\"text-xs text-muted-foreground min-w-[100px] text-center\">\n              Página {(page + 1).toLocaleString()} de {totalPages.toLocaleString()}\n            </span>\n            <Button variant=\"outline\" size=\"sm\" onClick={() => goToPage(page + 1)} disabled={page + 1 >= totalPages || isFetching}>\n              Siguiente\n            </Button>\n          </div>\n        </div>\n      )}\n\n      {/* Create entregas dialog */}",
    'pagination ui',
)

path.write_text(text, encoding='utf-8')
print('DemandaPage V2 patch applied')
