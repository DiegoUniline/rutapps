from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Not found: {label}')
    return text.replace(old, new, 1)

# -----------------------------------------------------------------------------
# Pedidos: page-size selector + explicit Todo + search spinner
# -----------------------------------------------------------------------------
p = Path('src/pages/DemandaPage.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { Truck, Check, Search, ClipboardList, Package, Warehouse, CheckCircle2, X, ChevronDown, ChevronRight, ExternalLink, Zap, AlertTriangle, UserPlus, XCircle, Lock } from 'lucide-react';",
    "import { Truck, Check, Search, ClipboardList, Package, Warehouse, CheckCircle2, X, ChevronDown, ChevronRight, ExternalLink, Zap, AlertTriangle, UserPlus, XCircle, Lock, Loader2 } from 'lucide-react';",
    'Pedidos Loader2 import',
)
s = replace_once(s, "  const [page, setPage] = useState(0);\n  const pageSize = 50;", "  const [page, setPage] = useState(0);\n  const [pageSize, setPageSize] = useState(50);", 'Pedidos page size state')
s = replace_once(
    s,
    "  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));\n  const pageStart = totalCount === 0 ? 0 : page * pageSize + 1;\n  const pageEnd = Math.min((page + 1) * pageSize, totalCount);",
    "  const showAll = pageSize === 0;\n  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));\n  const pageStart = totalCount === 0 ? 0 : showAll ? 1 : page * pageSize + 1;\n  const pageEnd = showAll ? totalCount : Math.min((page + 1) * pageSize, totalCount);",
    'Pedidos pagination calculations',
)
s = replace_once(
    s,
    "            <Search className=\"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground\" />\n            <Input placeholder=\"Folio o cliente...\" className=\"pl-9 h-9\" value={search} onChange={e => setSearch(e.target.value)} />",
    "            <Search className=\"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground\" />\n            <Input placeholder=\"Folio o cliente...\" className=\"pl-9 pr-9 h-9\" value={search} onChange={e => setSearch(e.target.value)} />\n            {isFetching && search.trim() && (\n              <Loader2 className=\"absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary\" aria-label=\"Buscando\" />\n            )}",
    'Pedidos search spinner',
)
old_pager = '''      {totalCount > 0 && (\n        <div className="flex items-center justify-between gap-3 border border-border rounded-lg bg-card px-3 py-2">\n          <span className="text-xs text-muted-foreground">\n            Mostrando {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} de {totalCount.toLocaleString()} pedidos\n          </span>\n          <div className="flex items-center gap-2">\n            <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 0 || isFetching}>\n              Anterior\n            </Button>\n            <span className="text-xs text-muted-foreground min-w-[100px] text-center">\n              Página {(page + 1).toLocaleString()} de {totalPages.toLocaleString()}\n            </span>\n            <Button variant="outline" size="sm" onClick={() => goToPage(page + 1)} disabled={page + 1 >= totalPages || isFetching}>\n              Siguiente\n            </Button>\n          </div>\n        </div>\n      )}'''
new_pager = '''      {totalCount > 0 && (\n        <div className="flex flex-wrap items-center justify-between gap-3 border border-border rounded-lg bg-card px-3 py-2">\n          <div className="flex items-center gap-3">\n            <span className="text-xs text-muted-foreground">\n              Mostrando {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} de {totalCount.toLocaleString()} pedidos\n            </span>\n            <div className="flex items-center gap-1.5">\n              <span className="text-[11px] text-muted-foreground">Ver</span>\n              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(0); setSelectedIds(new Set()); setExpanded(new Set()); }}>\n                <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>\n                <SelectContent>\n                  <SelectItem value="50">50</SelectItem>\n                  <SelectItem value="100">100</SelectItem>\n                  <SelectItem value="200">200</SelectItem>\n                  <SelectItem value="500">500</SelectItem>\n                  <SelectItem value="0">Todo</SelectItem>\n                </SelectContent>\n              </Select>\n              {showAll && <span className="text-[10px] text-amber-600">Puede tardar más</span>}\n            </div>\n          </div>\n          {!showAll ? (\n            <div className="flex items-center gap-2">\n              <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 0 || isFetching}>Anterior</Button>\n              <span className="text-xs text-muted-foreground min-w-[100px] text-center">Página {(page + 1).toLocaleString()} de {totalPages.toLocaleString()}</span>\n              <Button variant="outline" size="sm" onClick={() => goToPage(page + 1)} disabled={page + 1 >= totalPages || isFetching}>Siguiente</Button>\n            </div>\n          ) : (\n            <span className="text-xs text-muted-foreground">Todos los registros</span>\n          )}\n        </div>\n      )}'''
s = replace_once(s, old_pager, new_pager, 'Pedidos pager')
p.write_text(s, encoding='utf-8')

# -----------------------------------------------------------------------------
# Entregas: page-size selector + Todo + search spinner
# -----------------------------------------------------------------------------
p = Path('src/pages/EntregaListPage.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { Truck, Search, Package, Zap, PackageCheck, ArrowRightLeft, Calendar, XCircle, ChevronDown } from 'lucide-react';",
    "import { Truck, Search, Package, Zap, PackageCheck, ArrowRightLeft, Calendar, XCircle, ChevronDown, Loader2 } from 'lucide-react';",
    'Entregas Loader2 import',
)
s = replace_once(s, "  const [page, setPage] = useState(0);\n  const pageSize = 50;", "  const [page, setPage] = useState(0);\n  const [pageSize, setPageSize] = useState(50);", 'Entregas page size state')
s = replace_once(
    s,
    "  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));\n  const pageStart = totalCount === 0 ? 0 : page * pageSize + 1;\n  const pageEnd = Math.min((page + 1) * pageSize, totalCount);",
    "  const showAll = pageSize === 0;\n  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));\n  const pageStart = totalCount === 0 ? 0 : showAll ? 1 : page * pageSize + 1;\n  const pageEnd = showAll ? totalCount : Math.min((page + 1) * pageSize, totalCount);",
    'Entregas pagination calculations',
)
s = replace_once(
    s,
    "          <Search className=\"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground\" />\n          <Input placeholder=\"Buscar por folio...\" className=\"pl-9\" value={search} onChange={e => setSearch(e.target.value)} />",
    "          <Search className=\"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground\" />\n          <Input placeholder=\"Buscar por folio...\" className=\"pl-9 pr-9\" value={search} onChange={e => setSearch(e.target.value)} />\n          {isFetching && search.trim() && (\n            <Loader2 className=\"absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary\" aria-label=\"Buscando\" />\n          )}",
    'Entregas search spinner',
)
old_ent_pager = '''      {totalCount > 0 && (\n        <div className="flex items-center justify-between gap-3 border border-border bg-card rounded-lg px-3 py-2">\n          <span className="text-xs text-muted-foreground">\n            {pageStart}-{pageEnd} de {totalCount} entrega{totalCount === 1 ? '' : 's'}\n            {isFetching && !isLoading ? ' · Actualizando…' : ''}\n          </span>\n          <div className="flex items-center gap-2">\n            <Button variant="outline" size="sm" disabled={page <= 0 || isFetching} onClick={() => goToPage(page - 1)}>Anterior</Button>\n            <span className="text-xs text-muted-foreground tabular-nums">Página {page + 1} de {totalPages}</span>\n            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || isFetching} onClick={() => goToPage(page + 1)}>Siguiente</Button>\n          </div>\n        </div>\n      )}'''
new_ent_pager = '''      {totalCount > 0 && (\n        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card rounded-lg px-3 py-2">\n          <div className="flex items-center gap-3">\n            <span className="text-xs text-muted-foreground">\n              {pageStart}-{pageEnd} de {totalCount} entrega{totalCount === 1 ? '' : 's'}\n              {isFetching && !isLoading ? ' · Actualizando…' : ''}\n            </span>\n            <div className="flex items-center gap-1.5">\n              <span className="text-[11px] text-muted-foreground">Ver</span>\n              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(0); setSelectedIds(new Set()); setExpandedId(null); }}>\n                <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>\n                <SelectContent>\n                  <SelectItem value="50">50</SelectItem>\n                  <SelectItem value="100">100</SelectItem>\n                  <SelectItem value="200">200</SelectItem>\n                  <SelectItem value="500">500</SelectItem>\n                  <SelectItem value="0">Todo</SelectItem>\n                </SelectContent>\n              </Select>\n              {showAll && <span className="text-[10px] text-amber-600">Puede tardar más</span>}\n            </div>\n          </div>\n          {!showAll ? (\n            <div className="flex items-center gap-2">\n              <Button variant="outline" size="sm" disabled={page <= 0 || isFetching} onClick={() => goToPage(page - 1)}>Anterior</Button>\n              <span className="text-xs text-muted-foreground tabular-nums">Página {page + 1} de {totalPages}</span>\n              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || isFetching} onClick={() => goToPage(page + 1)}>Siguiente</Button>\n            </div>\n          ) : (\n            <span className="text-xs text-muted-foreground">Todas las entregas</span>\n          )}\n        </div>\n      )}'''
s = replace_once(s, old_ent_pager, new_ent_pager, 'Entregas pager')
p.write_text(s, encoding='utf-8')

# -----------------------------------------------------------------------------
# Concentrado: default pedido page is light; product aggregation is lazy/on demand
# -----------------------------------------------------------------------------
p = Path('src/pages/logistica/ConcentradoSurtidoPage.tsx')
s = p.read_text(encoding='utf-8')
# Remove no-longer-used historical interfaces
for block_start, block_end in [
    ('interface VentaLite {', 'interface LineaRow {'),
    ('interface LineaRow {', 'interface EntregaLineaRow {'),
    ('interface EntregaLineaRow {', 'interface ProductoRow {'),
    ('interface ProductoRow {', '\nfunction addDays'),
]:
    if block_start in s and block_end in s:
        a = s.index(block_start)
        b = s.index(block_end, a)
        s = s[:a] + s[b:]
s = replace_once(s, "  const [pedidoPage, setPedidoPage] = useState(0);\n  const pedidoPageSize = 50;", "  const [pedidoPage, setPedidoPage] = useState(0);\n  const [pedidoPageSize, setPedidoPageSize] = useState(50);\n  const [expandedPedidoId, setExpandedPedidoId] = useState<string | null>(null);", 'Concentrado page size state')
start = s.index("  const vendedoresKey = vendedorFilter.slice().sort().join(',');")
end = s.index("\n\n  // ── Export", start)
new_queries = r'''  const vendedoresKey = vendedorFilter.slice().sort().join(',');
  const statuses = statusFilter.length > 0
    ? statusFilter
    : ['confirmado', 'entregado', 'facturado'];

  // Vista principal: sólo la página de pedidos. No calcula el concentrado global de productos.
  const {
    data: pedidoData,
    isLoading: isLoadingPedidos,
    isFetching: isFetchingPedidos,
    refetch: refetchPedidos,
  } = useQuery({
    queryKey: ['concentrado-pedidos-v3', empresa?.id, desde, hasta, statusFilter.join(','), fechaField, tipoFilter, vendedoresKey, pedidoPage, pedidoPageSize],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async () => {
      const { data: payload, error } = await (supabase as any).rpc('fn_logistica_concentrado_pedidos_v3', {
        p_empresa_id: empresa!.id,
        p_fecha_desde: desde || null,
        p_fecha_hasta: hasta || null,
        p_fecha_field: fechaField,
        p_statuses: statuses,
        p_tipo: tipoFilter,
        p_vendedor_ids: vendedorFilter.length > 0 ? vendedorFilter : null,
        p_page_size: pedidoPageSize,
        p_offset: pedidoPageSize === 0 ? 0 : pedidoPage * pedidoPageSize,
      });
      if (error) throw error;
      return {
        pedidos: (Array.isArray(payload?.pedidos) ? payload.pedidos : []).map((r: any) => ({
          ...r,
          total: Number(r.total ?? 0),
          requerido: Number(r.requerido ?? 0),
          entregado: Number(r.entregado ?? 0),
          pendiente: Number(r.pendiente ?? 0),
        })) as PedidoRow[],
        pedidosCount: Number(payload?.pedidos_count ?? 0),
      };
    },
  });

  // Concentrado global: sólo se ejecuta al entrar a "Por producto" o cuando una
  // acción (Excel/PDF/Generar compras) realmente necesita esos datos.
  const {
    data: productoData,
    isLoading: isLoadingProductos,
    isFetching: isFetchingProductos,
    refetch: refetchProductos,
  } = useQuery({
    queryKey: ['concentrado-productos-lazy-v2', empresa?.id, desde, hasta, statusFilter.join(','), fechaField, tipoFilter, vendedoresKey, almacenesKey],
    enabled: !!empresa?.id && almacenInit && viewMode === 'productos',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: payload, error } = await (supabase as any).rpc('fn_logistica_concentrado_surtido_v2', {
        p_empresa_id: empresa!.id,
        p_fecha_desde: desde || null,
        p_fecha_hasta: hasta || null,
        p_fecha_field: fechaField,
        p_statuses: statuses,
        p_tipo: tipoFilter,
        p_vendedor_ids: vendedorFilter.length > 0 ? vendedorFilter : null,
        p_almacen_ids: almacenFilter.length > 0 ? almacenFilter : null,
        p_pedido_page_size: 1,
        p_pedido_offset: 0,
      });
      if (error) throw error;
      return {
        rows: (Array.isArray(payload?.rows) ? payload.rows : []).map((r: any) => ({
          ...r,
          requerido: Number(r.requerido ?? 0),
          entregado: Number(r.entregado ?? 0),
          pendiente: Number(r.pendiente ?? 0),
          stock: Number(r.stock ?? 0),
          faltante: Number(r.faltante ?? 0),
          costo: Number(r.costo ?? 0),
        })) as Row[],
        productosCount: Number(payload?.productos_count ?? 0),
        conFaltante: Number(payload?.con_faltante ?? 0),
        costoFaltante: Number(payload?.costo_faltante ?? 0),
      };
    },
  });

  useEffect(() => {
    setPedidoPage(0);
    setOpenGroups(new Set());
    setExpandedPedidoId(null);
  }, [desde, hasta, fechaField, statusFilter, tipoFilter, vendedoresKey]);

  const pedidoTotalCount = pedidoData?.pedidosCount ?? 0;
  const pedidoShowAll = pedidoPageSize === 0;
  const pedidoTotalPages = pedidoShowAll ? 1 : Math.max(1, Math.ceil(pedidoTotalCount / pedidoPageSize));
  const pedidoPageStart = pedidoTotalCount === 0 ? 0 : pedidoShowAll ? 1 : pedidoPage * pedidoPageSize + 1;
  const pedidoPageEnd = pedidoShowAll ? pedidoTotalCount : Math.min((pedidoPage + 1) * pedidoPageSize, pedidoTotalCount);
  const goPedidoPage = (nextPage: number) => {
    setOpenGroups(new Set());
    setExpandedPedidoId(null);
    setPedidoPage(Math.min(Math.max(nextPage, 0), Math.max(pedidoTotalPages - 1, 0)));
  };

  const rows = productoData?.rows ?? [];
  const faltantes = useMemo(() => rows.filter(r => r.faltante > 0), [rows]);

  const ensureProductosData = async () => {
    if (productoData) return productoData;
    if (!almacenInit) throw new Error('Todavía se están cargando los almacenes. Intenta de nuevo en un momento.');
    const result = await refetchProductos();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('No se pudo calcular el concentrado de productos.');
    return result.data;
  };

  const totales = useMemo(() => ({
    pedidos: pedidoData?.pedidosCount ?? 0,
    productos: productoData?.productosCount,
    conFaltante: productoData?.conFaltante,
    costoFaltante: productoData?.costoFaltante,
  }), [pedidoData?.pedidosCount, productoData]);'''
s = s[:start] + new_queries + s[end:]
# Export helpers now accept lazily loaded rows
s = replace_once(s, "  const buildExportRows = () => rows.map(r => {", "  const buildExportRows = (sourceRows: Row[]) => sourceRows.map(r => {", 'Concentrado buildExportRows')
s = replace_once(s, "  const buildExportOpts = () => ({", "  const buildExportOpts = (sourceRows: Row[]) => ({", 'Concentrado buildExportOpts signature')
s = replace_once(s, "    subtitle: `${rows.length} producto(s) · ${faltantes.length} con faltante`,\n    columns: exportColumns,\n    data: buildExportRows(),", "    subtitle: `${sourceRows.length} producto(s) · ${sourceRows.filter(r => r.faltante > 0).length} con faltante`,\n    columns: exportColumns,\n    data: buildExportRows(sourceRows),", 'Concentrado export opts body')
old_handlers = '''  const handleExportExcel = () => {\n    if (rows.length === 0) { toast.error('Nada que exportar'); return; }\n    try { exportToExcel(buildExportOpts()); }\n    catch (err: any) { toast.error(err?.message || 'Error al exportar Excel'); }\n  };\n  const handleExportPdf = async () => {\n    if (rows.length === 0) { toast.error('Nada que exportar'); return; }\n    try { await exportToPDF(buildExportOpts()); }\n    catch (err: any) { toast.error(err?.message || 'Error al exportar PDF'); }\n  };\n\n  const generarCompras = async () => {\n    if (!empresa?.id) return;\n    if (faltantes.length === 0) { toast.error('No hay productos con faltante'); return; }\n    setGenerando(true);\n    try {'''
new_handlers = '''  const handleExportExcel = async () => {\n    try {\n      const source = await ensureProductosData();\n      if (source.rows.length === 0) { toast.error('Nada que exportar'); return; }\n      exportToExcel(buildExportOpts(source.rows));\n    } catch (err: any) { toast.error(err?.message || 'Error al exportar Excel'); }\n  };\n  const handleExportPdf = async () => {\n    try {\n      const source = await ensureProductosData();\n      if (source.rows.length === 0) { toast.error('Nada que exportar'); return; }\n      await exportToPDF(buildExportOpts(source.rows));\n    } catch (err: any) { toast.error(err?.message || 'Error al exportar PDF'); }\n  };\n\n  const generarCompras = async () => {\n    if (!empresa?.id) return;\n    setGenerando(true);\n    try {\n      const source = await ensureProductosData();\n      const faltantesActuales = source.rows.filter(r => r.faltante > 0);\n      if (faltantesActuales.length === 0) { toast.error('No hay productos con faltante'); return; }'''
s = replace_once(s, old_handlers, new_handlers, 'Concentrado lazy handlers')
s = replace_once(s, "      const grupos = new Map<string, typeof faltantes>();\n      for (const f of faltantes) {", "      const grupos = new Map<string, Row[]>();\n      for (const f of faltantesActuales) {", 'Concentrado purchase source')
# Refetch/export action toolbar
s = replace_once(
    s,
    '''          <Button size="sm" variant="outline" onClick={() => refetch()}>Refrescar</Button>\n          <Button size="sm" variant="outline" onClick={handleExportExcel} disabled={rows.length === 0}>\n            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel\n          </Button>\n          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={rows.length === 0}>\n            <FileDown className="w-3.5 h-3.5" /> PDF\n          </Button>\n          {faltantes.length > 0 && (\n            <Button size="sm" onClick={generarCompras} disabled={generando} className="bg-primary text-primary-foreground">\n              {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}\n              Generar compras ({faltantes.length})\n            </Button>\n          )}''',
    '''          <Button size="sm" variant="outline" onClick={() => viewMode === 'productos' ? refetchProductos() : refetchPedidos()}>Refrescar</Button>\n          <Button size="sm" variant="outline" onClick={handleExportExcel} disabled={isFetchingProductos || !almacenInit}>\n            {isFetchingProductos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel\n          </Button>\n          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={isFetchingProductos || !almacenInit}>\n            {isFetchingProductos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF\n          </Button>\n          <Button size="sm" onClick={generarCompras} disabled={generando || isFetchingProductos || !almacenInit} className="bg-primary text-primary-foreground">\n            {generando || isFetchingProductos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}\n            Generar compras{productoData ? ` (${faltantes.length})` : ''}\n          </Button>''',
    'Concentrado toolbar actions',
)
# KPI values are explicitly lazy
s = replace_once(
    s,
    '''        <KPI label="Pedidos en rango" value={totales.pedidos} />\n        <KPI label="Productos a surtir" value={totales.productos} />\n        <KPI label="Con faltante" value={totales.conFaltante} highlight={totales.conFaltante > 0} />\n        <KPI label="Costo del faltante" value={fmtMoney(totales.costoFaltante)} />''',
    '''        <KPI label="Pedidos en rango" value={totales.pedidos} />\n        <KPI label="Productos a surtir" value={totales.productos ?? '—'} />\n        <KPI label="Con faltante" value={totales.conFaltante ?? '—'} highlight={(totales.conFaltante ?? 0) > 0} />\n        <KPI label="Costo del faltante" value={totales.costoFaltante == null ? '—' : fmtMoney(totales.costoFaltante)} />''',
    'Concentrado lazy KPIs',
)
s = s.replace("      {!isLoading && faltantes.length > 0 && (", "      {productoData && !isFetchingProductos && faltantes.length > 0 && (", 1)
s = s.replace("      {!isLoading && rows.length > 0 && faltantes.length === 0 && (", "      {productoData && !isFetchingProductos && rows.length > 0 && faltantes.length === 0 && (", 1)
# Product tab loading indicator
s = replace_once(s, "          Por producto\n        </button>", "          {isFetchingProductos && viewMode === 'productos' && <Loader2 className=\"w-3 h-3 inline mr-1 animate-spin\" />}Por producto\n        </button>", 'Concentrado product tab spinner')
# Use pedidoData instead of old data
s = s.replace("              const pedidos = data?.pedidos ?? [];", "              const pedidos = pedidoData?.pedidos ?? [];", 1)
# Main loading refs in pedido table
s = s.replace("                    {isLoading && (", "                    {isLoadingPedidos && (", 1)
s = s.replace("                    {!isLoading && pedidos.length === 0 && (", "                    {!isLoadingPedidos && pedidos.length === 0 && (", 1)
s = s.replace("                    {!isLoading && groupBy === 'none' && pedidos.map(renderRow)}", "                    {!isLoadingPedidos && groupBy === 'none' && pedidos.map(renderRow)}", 1)
s = s.replace("                    {!isLoading && groupBy !== 'none' && groups.map(([label, items]) => {", "                    {!isLoadingPedidos && groupBy !== 'none' && groups.map(([label, items]) => {", 1)
# Product table loading refs
product_branch_marker = ") : (\n            <table className=\"w-full text-sm\">"
pos = s.index(product_branch_marker)
tail = s[pos:]
tail = tail.replace("{isLoading && (", "{isLoadingProductos && (", 1)
tail = tail.replace("{!isLoading && rows.length === 0 && (", "{!isLoadingProductos && rows.length === 0 && (", 1)
s = s[:pos] + tail
# renderRow becomes expandable with lazy products
old_render_start = '''                return (\n                  <tr key={p.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/ventas/${p.id}`)}>\n                    <td className="px-3 py-2 text-xs">{p.fecha_entrega ?? '—'}</td>\n                    <td className="px-3 py-2 font-mono text-xs">{p.folio ?? '—'}</td>'''
new_render_start = '''                const isExpanded = expandedPedidoId === p.id;\n                return (\n                  <Fragment key={p.id}>\n                  <tr className="hover:bg-muted/20 cursor-pointer" onClick={() => setExpandedPedidoId(isExpanded ? null : p.id)}>\n                    <td className="px-3 py-2 text-xs">{p.fecha_entrega ?? '—'}</td>\n                    <td className="px-3 py-2 font-mono text-xs">\n                      <span className="inline-flex items-center gap-1">{isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{p.folio ?? '—'}</span>\n                    </td>'''
s = replace_once(s, old_render_start, new_render_start, 'Concentrado expandable row start')
old_render_end = '''                    <td className="px-3 py-2">\n                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>\n                    </td>\n                  </tr>\n                );'''
new_render_end = '''                    <td className="px-3 py-2">\n                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>\n                    </td>\n                  </tr>\n                  {isExpanded && (\n                    <tr className="bg-muted/25">\n                      <td colSpan={10} className="p-0">\n                        <ConcentradoPedidoProductos pedidoId={p.id} onOpen={() => navigate(`/ventas/${p.id}`)} />\n                      </td>\n                    </tr>\n                  )}\n                  </Fragment>\n                );'''
s = replace_once(s, old_render_end, new_render_end, 'Concentrado expandable row end')
# Pager with page-size selector
old_conc_pager = '''      {viewMode === 'pedidos' && pedidoTotalCount > 0 && (\n        <div className="flex items-center justify-between gap-3 border border-border bg-card rounded-lg px-3 py-2">\n          <span className="text-xs text-muted-foreground">\n            {pedidoPageStart}-{pedidoPageEnd} de {pedidoTotalCount} pedido{pedidoTotalCount === 1 ? '' : 's'}\n            {isFetching && !isLoading ? ' · Actualizando…' : ''}\n          </span>\n          <div className="flex items-center gap-2">\n            <Button variant="outline" size="sm" disabled={pedidoPage <= 0 || isFetching} onClick={() => goPedidoPage(pedidoPage - 1)}>Anterior</Button>\n            <span className="text-xs text-muted-foreground tabular-nums">Página {pedidoPage + 1} de {pedidoTotalPages}</span>\n            <Button variant="outline" size="sm" disabled={pedidoPage + 1 >= pedidoTotalPages || isFetching} onClick={() => goPedidoPage(pedidoPage + 1)}>Siguiente</Button>\n          </div>\n        </div>\n      )}'''
new_conc_pager = '''      {viewMode === 'pedidos' && pedidoTotalCount > 0 && (\n        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card rounded-lg px-3 py-2">\n          <div className="flex items-center gap-3">\n            <span className="text-xs text-muted-foreground">\n              {pedidoPageStart}-{pedidoPageEnd} de {pedidoTotalCount} pedido{pedidoTotalCount === 1 ? '' : 's'}\n              {isFetchingPedidos && !isLoadingPedidos ? ' · Actualizando…' : ''}\n            </span>\n            <div className="flex items-center gap-1.5">\n              <span className="text-[11px] text-muted-foreground">Ver</span>\n              <Select value={String(pedidoPageSize)} onValueChange={(value) => { setPedidoPageSize(Number(value)); setPedidoPage(0); setOpenGroups(new Set()); setExpandedPedidoId(null); }}>\n                <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>\n                <SelectContent>\n                  <SelectItem value="50">50</SelectItem>\n                  <SelectItem value="100">100</SelectItem>\n                  <SelectItem value="200">200</SelectItem>\n                  <SelectItem value="500">500</SelectItem>\n                  <SelectItem value="0">Todo</SelectItem>\n                </SelectContent>\n              </Select>\n              {pedidoShowAll && <span className="text-[10px] text-amber-600">Puede tardar más</span>}\n            </div>\n          </div>\n          {!pedidoShowAll ? (\n            <div className="flex items-center gap-2">\n              <Button variant="outline" size="sm" disabled={pedidoPage <= 0 || isFetchingPedidos} onClick={() => goPedidoPage(pedidoPage - 1)}>Anterior</Button>\n              <span className="text-xs text-muted-foreground tabular-nums">Página {pedidoPage + 1} de {pedidoTotalPages}</span>\n              <Button variant="outline" size="sm" disabled={pedidoPage + 1 >= pedidoTotalPages || isFetchingPedidos} onClick={() => goPedidoPage(pedidoPage + 1)}>Siguiente</Button>\n            </div>\n          ) : (\n            <span className="text-xs text-muted-foreground">Todos los pedidos</span>\n          )}\n        </div>\n      )}'''
s = replace_once(s, old_conc_pager, new_conc_pager, 'Concentrado pager')
# Add lazy line component before Row interface
insert_marker = "\ninterface Row {"
component = r'''

function ConcentradoPedidoProductos({ pedidoId, onOpen }: { pedidoId: string; onOpen: () => void }) {
  const { data: lineas = [], isLoading, isError } = useQuery({
    queryKey: ['concentrado-pedido-productos', pedidoId],
    enabled: !!pedidoId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [ventaRes, entregaRes] = await Promise.all([
        supabase
          .from('venta_lineas')
          .select('producto_id, cantidad, productos(codigo, nombre)')
          .eq('venta_id', pedidoId),
        supabase
          .from('entrega_lineas')
          .select('producto_id, cantidad_entregada, entregas!inner(pedido_id, status)')
          .eq('entregas.pedido_id', pedidoId)
          .in('entregas.status', ['surtido', 'cargado', 'hecho'] as any),
      ]);
      if (ventaRes.error) throw ventaRes.error;
      if (entregaRes.error) throw entregaRes.error;

      const map = new Map<string, { producto_id: string; codigo: string; nombre: string; requerido: number; surtido: number }>();
      for (const l of (ventaRes.data ?? []) as any[]) {
        if (!l.producto_id) continue;
        const current = map.get(l.producto_id) ?? {
          producto_id: l.producto_id,
          codigo: l.productos?.codigo ?? '—',
          nombre: l.productos?.nombre ?? '—',
          requerido: 0,
          surtido: 0,
        };
        current.requerido += Number(l.cantidad ?? 0);
        map.set(l.producto_id, current);
      }
      for (const l of (entregaRes.data ?? []) as any[]) {
        if (!l.producto_id) continue;
        const current = map.get(l.producto_id);
        if (current) current.surtido += Number(l.cantidad_entregada ?? 0);
      }
      return Array.from(map.values()).map(l => ({ ...l, pendiente: Math.max(0, l.requerido - l.surtido) }));
    },
  });

  return (
    <div className="px-6 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Productos del pedido</span>
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Abrir pedido</Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando productos…</div>
      ) : isError ? (
        <p className="py-3 text-xs text-destructive">No se pudieron cargar los productos.</p>
      ) : lineas.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">Sin productos.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr><th className="text-left px-3 py-2">Código</th><th className="text-left px-3 py-2">Producto</th><th className="text-right px-3 py-2">Requerido</th><th className="text-right px-3 py-2">Surtido</th><th className="text-right px-3 py-2">Pendiente</th></tr>
            </thead>
            <tbody>
              {lineas.map((l: any) => (
                <tr key={l.producto_id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{l.codigo}</td>
                  <td className="px-3 py-2 font-medium">{l.nombre}</td>
                  <td className="px-3 py-2 text-right">{l.requerido}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.surtido}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${l.pendiente > 0 ? 'text-destructive' : ''}`}>{l.pendiente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
'''
if insert_marker not in s:
    raise SystemExit('Concentrado Row marker missing')
s = s.replace(insert_marker, component + insert_marker, 1)
p.write_text(s, encoding='utf-8')

# -----------------------------------------------------------------------------
# Migration: allow 50/100/200/500/Todo on Pedidos/Entregas and add fast
# page-first Concentrado pedidos RPC.
# -----------------------------------------------------------------------------
ped_sql = Path('supabase/migrations/20260910003000_logistica_pedidos_workspace_v2.sql').read_text(encoding='utf-8')
ent_sql = Path('supabase/migrations/20260910005500_logistica_entregas_concentrado_v2.sql').read_text(encoding='utf-8')

def extract_function(source: str, name: str) -> str:
    start = source.index(f'CREATE OR REPLACE FUNCTION public.{name}(')
    end = source.index('\n$$;', start) + len('\n$$;')
    return source[start:end]

ped_fn = extract_function(ped_sql, 'fn_logistica_pedidos_workspace_v2')
ent_fn = extract_function(ent_sql, 'fn_logistica_entregas_workspace_v2')
ped_fn = ped_fn.replace(
    "v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);",
    "v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(p_page_size, 1), 500) END;",
)
ent_fn = ent_fn.replace(
    "v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);",
    "v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(p_page_size, 1), 500) END;",
)

concentrado_fn = r'''CREATE OR REPLACE FUNCTION public.fn_logistica_concentrado_pedidos_v3(
  p_empresa_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_fecha_field text DEFAULT 'fecha',
  p_statuses text[] DEFAULT NULL,
  p_tipo text DEFAULT 'pedido',
  p_vendedor_ids uuid[] DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(p_page_size, 1), 500) END;
  v_offset integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN 0 ELSE GREATEST(COALESCE(p_offset, 0), 0) END;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_super_admin(auth.uid()), false) = false
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'empresa access denied' USING ERRCODE = '42501';
  END IF;

  WITH filtered_ventas AS MATERIALIZED (
    SELECT
      v.id,
      v.folio,
      v.fecha,
      v.fecha_entrega,
      v.status::text AS status,
      v.tipo::text AS tipo,
      v.total,
      v.cliente_id,
      v.vendedor_id,
      c.nombre AS cliente_nombre,
      pv.nombre AS vendedor_nombre
    FROM public.ventas v
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    LEFT JOIN public.profiles pv ON pv.id = v.vendedor_id
    WHERE v.empresa_id = p_empresa_id
      AND (COALESCE(cardinality(p_statuses), 0) = 0 OR v.status::text = ANY(p_statuses))
      AND (COALESCE(p_tipo, 'todos') = 'todos' OR v.tipo::text = p_tipo)
      AND (p_vendedor_ids IS NULL OR cardinality(p_vendedor_ids) = 0 OR v.vendedor_id = ANY(p_vendedor_ids))
      AND (
        COALESCE(p_fecha_field, 'fecha') <> 'fecha_entrega'
        OR ((p_fecha_desde IS NULL OR v.fecha_entrega >= p_fecha_desde) AND (p_fecha_hasta IS NULL OR v.fecha_entrega <= p_fecha_hasta))
      )
      AND (
        COALESCE(p_fecha_field, 'fecha') = 'fecha_entrega'
        OR ((p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde) AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta))
      )
  ),
  page_ventas AS MATERIALIZED (
    SELECT *
    FROM filtered_ventas
    ORDER BY fecha_entrega ASC NULLS LAST, folio ASC NULLS LAST, id
    LIMIT v_page_size OFFSET v_offset
  ),
  venta_producto AS MATERIALIZED (
    SELECT vl.venta_id, vl.producto_id, SUM(COALESCE(vl.cantidad, 0))::numeric AS requerido
    FROM public.venta_lineas vl
    INNER JOIN page_ventas pv ON pv.id = vl.venta_id
    GROUP BY vl.venta_id, vl.producto_id
  ),
  entrega_producto AS MATERIALIZED (
    SELECT e.pedido_id AS venta_id, el.producto_id, SUM(COALESCE(el.cantidad_entregada, 0))::numeric AS surtido
    FROM public.entregas e
    INNER JOIN page_ventas pv ON pv.id = e.pedido_id
    INNER JOIN public.entrega_lineas el ON el.entrega_id = e.id
    WHERE e.status::text IN ('surtido', 'cargado', 'hecho')
    GROUP BY e.pedido_id, el.producto_id
  ),
  pedido_agg AS MATERIALIZED (
    SELECT
      pv.id,
      COALESCE(SUM(vp.requerido), 0)::numeric AS requerido,
      COALESCE(SUM(COALESCE(ep.surtido, 0)), 0)::numeric AS surtido,
      COALESCE(SUM(GREATEST(0::numeric, vp.requerido - COALESCE(ep.surtido, 0))), 0)::numeric AS pendiente
    FROM page_ventas pv
    LEFT JOIN venta_producto vp ON vp.venta_id = pv.id
    LEFT JOIN entrega_producto ep ON ep.venta_id = vp.venta_id AND ep.producto_id IS NOT DISTINCT FROM vp.producto_id
    GROUP BY pv.id
  ),
  pedidos_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', pv.id,
      'folio', pv.folio,
      'fecha_entrega', pv.fecha_entrega,
      'status', pv.status,
      'tipo', pv.tipo,
      'cliente', COALESCE(pv.cliente_nombre, '—'),
      'vendedor_id', pv.vendedor_id,
      'vendedor', COALESCE(pv.vendedor_nombre, '—'),
      'total', COALESCE(pv.total, 0),
      'requerido', pa.requerido,
      'entregado', pa.surtido,
      'pendiente', pa.pendiente,
      'surtido_status', CASE
        WHEN pa.requerido = 0 THEN 'sin_lineas'
        WHEN pa.surtido <= 0 THEN 'pendiente'
        WHEN pa.pendiente <= 0 THEN 'surtido'
        ELSE 'parcial'
      END
    ) ORDER BY pv.fecha_entrega ASC NULLS LAST, pv.folio ASC NULLS LAST, pv.id), '[]'::jsonb) AS rows
    FROM page_ventas pv
    INNER JOIN pedido_agg pa ON pa.id = pv.id
  )
  SELECT jsonb_build_object(
    'pedidos', pj.rows,
    'pedidos_count', (SELECT COUNT(*) FROM filtered_ventas),
    'page_size', COALESCE(v_page_size, -1),
    'offset', v_offset
  ) INTO v_result
  FROM pedidos_json pj;

  RETURN COALESCE(v_result, jsonb_build_object('pedidos', '[]'::jsonb, 'pedidos_count', 0, 'page_size', COALESCE(v_page_size, -1), 'offset', v_offset));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_logistica_concentrado_pedidos_v3(uuid,date,date,text,text[],text,uuid[],integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_logistica_concentrado_pedidos_v3(uuid,date,date,text,text[],text,uuid[],integer,integer) TO authenticated;

COMMENT ON FUNCTION public.fn_logistica_concentrado_pedidos_v3(uuid,date,date,text,text[],text,uuid[],integer,integer)
IS 'Vista Por pedido del Concentrado: pagina ventas primero y calcula lineas solamente para la pagina visible; 0 = Todo.';'''

migration = f'''-- Logística lazy loading + tamaños de página configurables\n-- 0 en page_size significa "Todo" por decisión explícita del usuario.\n\n{ped_fn}\n\n{ent_fn}\n\n{concentrado_fn}\n'''
Path('supabase/migrations/20260910103500_logistica_lazy_pagination_v3.sql').write_text(migration, encoding='utf-8')
