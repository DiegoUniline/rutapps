from pathlib import Path

# Re-run marker: integrate from the latest branch head after DB index migration.
source = Path('src/pages/EntregaListPageLegacy.tsx')
target = Path('src/pages/EntregaListPage.tsx')
text = source.read_text(encoding='utf-8')

old_import = "import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';\n"
new_import = old_import + "import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';\n"
if old_import not in text:
    raise SystemExit('No se encontró el import de Table esperado')
text = text.replace(old_import, new_import, 1)

old_hook_import = "import { useEntregasWorkspaceCounts, useEntregasWorkspaceList, useEntregaWorkspaceLineas } from '@/hooks/useEntregasWorkspace';"
new_hook_import = "import { useEntregasWorkspaceCounts, useEntregasWorkspaceList, useEntregaWorkspaceLineas, type EntregaFechaTipo } from '@/hooks/useEntregasWorkspace';"
if old_hook_import not in text:
    raise SystemExit('No se encontró el import del workspace esperado')
text = text.replace(old_hook_import, new_hook_import, 1)

old_state = "  const [fechaDesde, setFechaDesde] = useState('');\n  const [fechaHasta, setFechaHasta] = useState('');\n  const [statusFilter, setStatusFilter] = useState('todos');"
new_state = "  const [fechaDesde, setFechaDesde] = useState('');\n  const [fechaHasta, setFechaHasta] = useState('');\n  const [fechaTipo, setFechaTipo] = useState<EntregaFechaTipo>('programada');\n  const [statusFilter, setStatusFilter] = useState('todos');"
if old_state not in text:
    raise SystemExit('No se encontró el bloque de estado de fechas esperado')
text = text.replace(old_state, new_state, 1)

old_data_block = """  // Los conteos conservan el alcance anterior (búsqueda + vendedor), pero sólo
  // descargan id/status. La lista operativa sí aplica estado/ruta/fecha en servidor.
  const { data: countRows = [] } = useEntregasWorkspaceCounts(search, vendedorFilter);
  const { data: allEntregas = [], isLoading } = useEntregasWorkspaceList({
    search,
    vendedorFilter,
    statusFilter,
    rutaFilter,
    fechaDesde,
    fechaHasta,
  });
"""
new_data_block = """  // Los conteos se calculan en PostgreSQL; la lista aplica estado/ruta/fecha en servidor.
  const { data: counts = { total: 0, borrador: 0, surtido: 0, asignado: 0, cargado: 0, en_ruta: 0, hecho: 0, no_entregado: 0 } } = useEntregasWorkspaceCounts(search, vendedorFilter);
  const { data: allEntregas = [], isLoading } = useEntregasWorkspaceList({
    search,
    vendedorFilter,
    statusFilter,
    rutaFilter,
    fechaTipo,
    fechaDesde,
    fechaHasta,
  });
"""
if old_data_block not in text:
    raise SystemExit('No se encontró el bloque de carga del workspace esperado')
text = text.replace(old_data_block, new_data_block, 1)

old_counts = """  const counts = {
    total: countRows.length,
    borrador: countRows.filter(e => (e as any).status === 'borrador').length,
    surtido: countRows.filter(e => (e as any).status === 'surtido').length,
    asignado: countRows.filter(e => (e as any).status === 'asignado').length,
    cargado: countRows.filter(e => (e as any).status === 'cargado').length,
    en_ruta: countRows.filter(e => (e as any).status === 'en_ruta').length,
    hecho: countRows.filter(e => (e as any).status === 'hecho').length,
    no_entregado: countRows.filter(e => (e as any).status === 'no_entregado').length,
  };

"""
if old_counts not in text:
    raise SystemExit('No se encontró el cálculo local de conteos esperado')
text = text.replace(old_counts, '', 1)

old_date_ui = """        <div>
          <label className=\"text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1\">Rango de fechas</label>
          <DateRangePicker from={fechaDesde} to={fechaHasta} onChange={(f, t) => { setFechaDesde(f); setFechaHasta(t); }} />
        </div>
        {(rutaFilter !== 'todos' || fechaDesde || fechaHasta || vendedorFilter !== 'todos') && (
          <Button variant=\"ghost\" size=\"sm\" onClick={() => { setRutaFilter('todos'); setFechaDesde(''); setFechaHasta(''); setVendedorFilter('todos'); }}>
            Limpiar
          </Button>
        )}
"""
new_date_ui = """        <div className=\"min-w-[220px]\">
          <label className=\"text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1\">Filtrar fecha por</label>
          <Select value={fechaTipo} onValueChange={(value) => setFechaTipo(value as EntregaFechaTipo)}>
            <SelectTrigger className=\"h-9\">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=\"levantamiento\">Fecha de levantamiento</SelectItem>
              <SelectItem value=\"programada\">Fecha programada de entrega</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className=\"text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1\">Rango de fechas</label>
          <DateRangePicker from={fechaDesde} to={fechaHasta} onChange={(f, t) => { setFechaDesde(f); setFechaHasta(t); }} />
        </div>
        {(rutaFilter !== 'todos' || fechaDesde || fechaHasta || vendedorFilter !== 'todos' || fechaTipo !== 'programada') && (
          <Button variant=\"ghost\" size=\"sm\" onClick={() => { setRutaFilter('todos'); setFechaDesde(''); setFechaHasta(''); setFechaTipo('programada'); setVendedorFilter('todos'); }}>
            Limpiar
          </Button>
        )}
"""
if old_date_ui not in text:
    raise SystemExit('No se encontró el bloque UI de rango esperado')
text = text.replace(old_date_ui, new_date_ui, 1)

target.write_text(text, encoding='utf-8')
