from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Pattern not found: {label}')
    return text.replace(old, new, 1)

# 1) Generic optional header inside DateRangePicker popover.
p = Path('src/components/shared/DateRangePicker.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "  /** Compact trigger button for dense toolbars. */\n  compact?: boolean;\n}",
    "  /** Compact trigger button for dense toolbars. */\n  compact?: boolean;\n  /** Optional control area rendered at the top of the same date popover. */\n  headerContent?: React.ReactNode;\n}",
    'DateRangePicker props',
)
s = replace_once(
    s,
    "  placeholder = 'Seleccionar rango',\n  compact,\n}: DateRangePickerProps) {",
    "  placeholder = 'Seleccionar rango',\n  compact,\n  headerContent,\n}: DateRangePickerProps) {",
    'DateRangePicker destructure',
)
s = replace_once(
    s,
    "        <PopoverContent className=\"w-[calc(100vw-1rem)] sm:w-auto max-w-[560px] p-0 pointer-events-auto max-h-[85vh] overflow-hidden\" align=\"start\" collisionPadding={8}>\n          <div className=\"flex flex-col sm:flex-row max-h-[85vh]\">",
    "        <PopoverContent className=\"w-[calc(100vw-1rem)] sm:w-auto max-w-[560px] p-0 pointer-events-auto max-h-[85vh] overflow-hidden\" align=\"start\" collisionPadding={8}>\n          {headerContent && (\n            <div className=\"border-b border-border bg-background p-3\">{headerContent}</div>\n          )}\n          <div className=\"flex flex-col sm:flex-row max-h-[85vh]\">",
    'DateRangePicker header render',
)
p.write_text(s, encoding='utf-8')

# 2) Entregas query: actual date modes + true debounce.
p = Path('src/hooks/useEntregasWorkspace.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(s, "import { useDeferredValue } from 'react';", "import { useEffect, useState } from 'react';", 'react imports')
s = replace_once(
    s,
    "export type EntregaFechaTipo = 'levantamiento' | 'programada';",
    "export type EntregaFechaTipo = 'programada' | 'real' | 'creacion' | 'levantamiento';\n\nfunction useDebouncedValue<T>(value: T, delay = 350) {\n  const [debounced, setDebounced] = useState(value);\n  useEffect(() => {\n    const timer = window.setTimeout(() => setDebounced(value), delay);\n    return () => window.clearTimeout(timer);\n  }, [value, delay]);\n  return debounced;\n}",
    'EntregaFechaTipo + debounce',
)
s = s.replace("const deferredSearch = useDeferredValue((search ?? '').trim());", "const deferredSearch = useDebouncedValue((search ?? '').trim(), 350);")
p.write_text(s, encoding='utf-8')

# 3) Entregas UI.
p = Path('src/pages/EntregaListPage.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(s, "borrador: { label: 'Borrador', variant: 'secondary' },", "borrador: { label: 'Por surtir', variant: 'secondary' },", 'borrador label')

old_tabs = """        {[\n          { key: 'todos', label: 'Todos', count: counts.total },\n          { key: 'borrador', label: 'Borrador', count: counts.borrador },\n          { key: 'surtido', label: 'Surtidos', count: counts.surtido },\n          { key: 'asignado', label: 'Asignados', count: counts.asignado },\n          { key: 'cargado', label: 'Cargados', count: counts.cargado },\n          { key: 'en_ruta', label: 'En ruta', count: counts.en_ruta },\n          { key: 'hecho', label: 'Entregadas', count: counts.hecho },\n          { key: 'no_entregado', label: 'No entregadas', count: counts.no_entregado },\n        ].map(tab => ("""
new_tabs = """        {[\n          { key: 'borrador', label: 'Por surtir', count: counts.borrador },\n          { key: 'surtido', label: 'Surtidos', count: counts.surtido },\n          { key: 'asignado', label: 'Asignados', count: counts.asignado },\n          { key: 'cargado', label: 'Cargados', count: counts.cargado },\n          { key: 'en_ruta', label: 'En ruta', count: counts.en_ruta },\n          { key: 'hecho', label: 'Entregadas', count: counts.hecho },\n          { key: 'no_entregado', label: 'No entregadas', count: counts.no_entregado },\n          { key: 'todos', label: 'Todos', count: counts.total },\n        ].map(tab => ("""
s = replace_once(s, old_tabs, new_tabs, 'reordered Entregas tabs')

s = replace_once(
    s,
    '<Input placeholder="Buscar por folio..." className="pl-9 pr-9" value={search} onChange={e => setSearch(e.target.value)} />',
    '<Input placeholder="Buscar por folio, pedido, cliente, vendedor o producto..." className="pl-9 pr-9" value={search} onChange={e => setSearch(e.target.value)} />',
    'Entregas search placeholder',
)

old_date = """        <div className=\"min-w-[220px]\">\n          <label className=\"text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1\">Filtrar fecha por</label>\n          <Select value={fechaTipo} onValueChange={(value) => setFechaTipo(value as EntregaFechaTipo)}>\n            <SelectTrigger className=\"h-9\">\n              <SelectValue />\n            </SelectTrigger>\n            <SelectContent>\n              <SelectItem value=\"levantamiento\">Fecha de levantamiento</SelectItem>\n              <SelectItem value=\"programada\">Fecha programada de entrega</SelectItem>\n            </SelectContent>\n          </Select>\n        </div>\n        <div>\n          <label className=\"text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1\">Rango de fechas</label>\n          <DateRangePicker from={fechaDesde} to={fechaHasta} onChange={(f, t) => { setFechaDesde(f); setFechaHasta(t); }} />\n        </div>"""
new_date = """        <div>\n          <label className=\"text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1\">Rango de fechas</label>\n          <DateRangePicker\n            from={fechaDesde}\n            to={fechaHasta}\n            onChange={(f, t) => { setFechaDesde(f); setFechaHasta(t); }}\n            headerContent={(\n              <div className=\"space-y-1.5\">\n                <label className=\"text-[11px] font-medium text-muted-foreground uppercase tracking-wide\">¿Qué fecha quieres filtrar?</label>\n                <Select value={fechaTipo} onValueChange={(value) => setFechaTipo(value as EntregaFechaTipo)}>\n                  <SelectTrigger className=\"h-9 w-full\"><SelectValue /></SelectTrigger>\n                  <SelectContent>\n                    <SelectItem value=\"programada\">Fecha programada de entrega</SelectItem>\n                    <SelectItem value=\"real\">Fecha de entrega real</SelectItem>\n                    <SelectItem value=\"creacion\">Fecha de creación de la entrega</SelectItem>\n                  </SelectContent>\n                </Select>\n              </div>\n            )}\n          />\n        </div>"""
s = replace_once(s, old_date, new_date, 'centralized date filter')

s = replace_once(s, '<TableHead className="text-[11px]">Folio</TableHead>\n              <TableHead className="text-[11px]">Pedido origen</TableHead>', '<TableHead className="text-[11px]">Entrega</TableHead>\n              <TableHead className="text-[11px]">Pedido</TableHead>', 'Entrega/Pedido headers')

# Move Entregas pagination above the table, leaving only one control.
table_marker = '      {/* Table */}'
dialog_marker = '\n\n      {/* ─── Dialog: Surtir rápido ─── */}'
table_pos = s.find(table_marker)
if table_pos < 0:
    raise SystemExit('Entregas table marker not found')
pag_start = s.find('\n      {totalCount > 0 && (', table_pos)
pag_end = s.find(dialog_marker, pag_start)
if pag_start < 0 or pag_end < 0:
    raise SystemExit('Entregas pagination block not found')
pagination = s[pag_start:pag_end]
s = s[:pag_start] + s[pag_end:]
table_pos = s.find(table_marker)
s = s[:table_pos] + pagination + '\n\n' + s[table_pos:]
p.write_text(s, encoding='utf-8')

# 4) Pedidos: move existing server-side pagination above the table.
p = Path('src/pages/DemandaPage.tsx')
s = p.read_text(encoding='utf-8')
table_marker = '      {/* Pedidos table */}'
dialog_marker = '\n\n      {/* Create entregas dialog */}'
table_pos = s.find(table_marker)
if table_pos < 0:
    raise SystemExit('Pedidos table marker not found')
pag_start = s.find('\n      {totalCount > 0 && (', table_pos)
pag_end = s.find(dialog_marker, pag_start)
if pag_start < 0 or pag_end < 0:
    raise SystemExit('Pedidos pagination block not found')
pagination = s[pag_start:pag_end]
s = s[:pag_start] + s[pag_end:]
table_pos = s.find(table_marker)
s = s[:table_pos] + pagination + '\n\n' + s[table_pos:]
p.write_text(s, encoding='utf-8')

print('Logistics filters/pagination patch applied.')
