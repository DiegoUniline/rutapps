from pathlib import Path

# ---------------- Entregas ----------------
p = Path('src/pages/EntregaListPage.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace(
    "import { useEntregasWorkspaceCounts, useEntregasWorkspaceList, useEntregaWorkspaceLineas, type EntregaFechaTipo } from '@/hooks/useEntregasWorkspace';",
    "import { useEntregasWorkspaceList, useEntregaWorkspaceLineas, type EntregaFechaTipo } from '@/hooks/useEntregasWorkspace';"
)
s = s.replace(
    "  const [expandedId, setExpandedId] = useState<string | null>(null);\n  const [cargarProgress",
    "  const [expandedId, setExpandedId] = useState<string | null>(null);\n  const [page, setPage] = useState(0);\n  const pageSize = 50;\n  const [cargarProgress"
)
old = """  // Los conteos se calculan en PostgreSQL; la lista aplica estado/ruta/fecha en servidor.\n  const { data: counts = { total: 0, borrador: 0, surtido: 0, asignado: 0, cargado: 0, en_ruta: 0, hecho: 0, no_entregado: 0 } } = useEntregasWorkspaceCounts(search, vendedorFilter);\n  const { data: allEntregas = [], isLoading } = useEntregasWorkspaceList({\n    search,\n    vendedorFilter,\n    statusFilter,\n    rutaFilter,\n    fechaTipo,\n    fechaDesde,\n    fechaHasta,\n  });\n"""
new = """  // V2: una sola llamada trae página + total + conteos. No descarga el histórico completo.\n  const { data: entregasResult, isLoading, isFetching } = useEntregasWorkspaceList({\n    search,\n    vendedorFilter,\n    statusFilter,\n    rutaFilter,\n    fechaTipo,\n    fechaDesde,\n    fechaHasta,\n    page,\n    pageSize,\n  });\n  const allEntregas = entregasResult?.rows ?? [];\n  const counts = entregasResult?.counts ?? { total: 0, borrador: 0, surtido: 0, asignado: 0, cargado: 0, en_ruta: 0, hecho: 0, no_entregado: 0 };\n  const totalCount = entregasResult?.totalCount ?? 0;\n  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));\n  const pageStart = totalCount === 0 ? 0 : page * pageSize + 1;\n  const pageEnd = Math.min((page + 1) * pageSize, totalCount);\n\n  useEffect(() => {\n    setPage(0);\n    setSelectedIds(new Set());\n    setExpandedId(null);\n  }, [search, vendedorFilter, statusFilter, rutaFilter, fechaTipo, fechaDesde, fechaHasta]);\n\n  const goToPage = (nextPage: number) => {\n    setSelectedIds(new Set());\n    setExpandedId(null);\n    setPage(Math.min(Math.max(nextPage, 0), Math.max(totalPages - 1, 0)));\n  };\n"""
if old not in s:
    raise SystemExit('Entregas hook block not found')
s = s.replace(old, new)
marker = """        </Table>\n      </div>\n\n      {/* ─── Dialog: Surtir rápido ─── */}"""
pager = """        </Table>\n      </div>\n\n      {totalCount > 0 && (\n        <div className=\"flex items-center justify-between gap-3 border border-border bg-card rounded-lg px-3 py-2\">\n          <span className=\"text-xs text-muted-foreground\">\n            {pageStart}-{pageEnd} de {totalCount} entrega{totalCount === 1 ? '' : 's'}\n            {isFetching && !isLoading ? ' · Actualizando…' : ''}\n          </span>\n          <div className=\"flex items-center gap-2\">\n            <Button variant=\"outline\" size=\"sm\" disabled={page <= 0 || isFetching} onClick={() => goToPage(page - 1)}>Anterior</Button>\n            <span className=\"text-xs text-muted-foreground tabular-nums\">Página {page + 1} de {totalPages}</span>\n            <Button variant=\"outline\" size=\"sm\" disabled={page + 1 >= totalPages || isFetching} onClick={() => goToPage(page + 1)}>Siguiente</Button>\n          </div>\n        </div>\n      )}\n\n      {/* ─── Dialog: Surtir rápido ─── */}"""
if marker not in s:
    raise SystemExit('Entregas table marker not found')
s = s.replace(marker, pager)
p.write_text(s, encoding='utf-8')

# ---------------- Concentrado ----------------
p = Path('src/pages/logistica/ConcentradoSurtidoPage.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace("import { fetchAllPages } from '@/lib/supabasePaginate';\n", "")
s = s.replace(
    "  const [viewMode, setViewMode] = useState<'pedidos' | 'productos'>('pedidos');",
    "  const [viewMode, setViewMode] = useState<'pedidos' | 'productos'>('pedidos');\n  const [pedidoPage, setPedidoPage] = useState(0);\n  const pedidoPageSize = 50;"
)
start = s.index("  const vendedoresKey = vendedorFilter.slice().sort().join(',');\n  const { data, isLoading, refetch } = useQuery({")
end_marker = "\n\n  const rows = data?.rows ?? [];"
end = s.index(end_marker, start)
new_query = """  const vendedoresKey = vendedorFilter.slice().sort().join(',');\n  const { data, isLoading, isFetching, refetch } = useQuery({\n    queryKey: ['concentrado-surtido-v2', empresa?.id, desde, hasta, statusFilter.join(','), fechaField, tipoFilter, vendedoresKey, almacenesKey, pedidoPage],\n    enabled: !!empresa?.id && almacenInit,\n    staleTime: 30_000,\n    refetchOnWindowFocus: false,\n    queryFn: async () => {\n      const statuses = statusFilter.length > 0\n        ? statusFilter\n        : ['confirmado', 'entregado', 'facturado'];\n\n      const { data: payload, error } = await (supabase as any).rpc('fn_logistica_concentrado_surtido_v2', {\n        p_empresa_id: empresa!.id,\n        p_fecha_desde: desde || null,\n        p_fecha_hasta: hasta || null,\n        p_fecha_field: fechaField,\n        p_statuses: statuses,\n        p_tipo: tipoFilter,\n        p_vendedor_ids: vendedorFilter.length > 0 ? vendedorFilter : null,\n        p_almacen_ids: almacenFilter.length > 0 ? almacenFilter : null,\n        p_pedido_page_size: pedidoPageSize,\n        p_pedido_offset: pedidoPage * pedidoPageSize,\n      });\n      if (error) throw error;\n\n      return {\n        rows: (Array.isArray(payload?.rows) ? payload.rows : []).map((r: any) => ({\n          ...r,\n          requerido: Number(r.requerido ?? 0),\n          entregado: Number(r.entregado ?? 0),\n          pendiente: Number(r.pendiente ?? 0),\n          stock: Number(r.stock ?? 0),\n          faltante: Number(r.faltante ?? 0),\n          costo: Number(r.costo ?? 0),\n        })) as Row[],\n        pedidos: (Array.isArray(payload?.pedidos) ? payload.pedidos : []).map((r: any) => ({\n          ...r,\n          total: Number(r.total ?? 0),\n          requerido: Number(r.requerido ?? 0),\n          entregado: Number(r.entregado ?? 0),\n          pendiente: Number(r.pendiente ?? 0),\n        })) as PedidoRow[],\n        pedidosCount: Number(payload?.pedidos_count ?? 0),\n        productosCount: Number(payload?.productos_count ?? 0),\n        conFaltante: Number(payload?.con_faltante ?? 0),\n        costoFaltante: Number(payload?.costo_faltante ?? 0),\n      };\n    },\n  });\n\n  useEffect(() => {\n    setPedidoPage(0);\n    setOpenGroups(new Set());\n  }, [desde, hasta, fechaField, statusFilter, tipoFilter, vendedoresKey, almacenesKey]);\n\n  const pedidoTotalCount = data?.pedidosCount ?? 0;\n  const pedidoTotalPages = Math.max(1, Math.ceil(pedidoTotalCount / pedidoPageSize));\n  const pedidoPageStart = pedidoTotalCount === 0 ? 0 : pedidoPage * pedidoPageSize + 1;\n  const pedidoPageEnd = Math.min((pedidoPage + 1) * pedidoPageSize, pedidoTotalCount);\n  const goPedidoPage = (nextPage: number) => {\n    setOpenGroups(new Set());\n    setPedidoPage(Math.min(Math.max(nextPage, 0), Math.max(pedidoTotalPages - 1, 0)));\n  };"""
s = s[:start] + new_query + s[end:]
old_tot = """  const totales = useMemo(() => ({\n    pedidos: data?.ventas.length ?? 0,\n    productos: rows.length,\n    conFaltante: faltantes.length,\n    costoFaltante: faltantes.reduce((s, r) => s + r.faltante * r.costo, 0),\n  }), [rows, faltantes, data?.ventas.length]);"""
new_tot = """  const totales = useMemo(() => ({\n    pedidos: data?.pedidosCount ?? 0,\n    productos: data?.productosCount ?? rows.length,\n    conFaltante: data?.conFaltante ?? faltantes.length,\n    costoFaltante: data?.costoFaltante ?? faltantes.reduce((sum, r) => sum + r.faltante * r.costo, 0),\n  }), [rows, faltantes, data?.pedidosCount, data?.productosCount, data?.conFaltante, data?.costoFaltante]);"""
if old_tot not in s:
    raise SystemExit('Concentrado totals block not found')
s = s.replace(old_tot, new_tot)
# Insert pager after the main table card, immediately before component closing div.
needle = """        </div>\n      </div>\n    </div>\n  );\n}"""
replacement = """        </div>\n      </div>\n\n      {viewMode === 'pedidos' && pedidoTotalCount > 0 && (\n        <div className=\"flex items-center justify-between gap-3 border border-border bg-card rounded-lg px-3 py-2\">\n          <span className=\"text-xs text-muted-foreground\">\n            {pedidoPageStart}-{pedidoPageEnd} de {pedidoTotalCount} pedido{pedidoTotalCount === 1 ? '' : 's'}\n            {isFetching && !isLoading ? ' · Actualizando…' : ''}\n          </span>\n          <div className=\"flex items-center gap-2\">\n            <Button variant=\"outline\" size=\"sm\" disabled={pedidoPage <= 0 || isFetching} onClick={() => goPedidoPage(pedidoPage - 1)}>Anterior</Button>\n            <span className=\"text-xs text-muted-foreground tabular-nums\">Página {pedidoPage + 1} de {pedidoTotalPages}</span>\n            <Button variant=\"outline\" size=\"sm\" disabled={pedidoPage + 1 >= pedidoTotalPages || isFetching} onClick={() => goPedidoPage(pedidoPage + 1)}>Siguiente</Button>\n          </div>\n        </div>\n      )}\n    </div>\n  );\n}"""
if needle not in s:
    raise SystemExit('Concentrado final marker not found')
s = s.replace(needle, replacement, 1)
p.write_text(s, encoding='utf-8')
