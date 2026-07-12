import { useCurrency } from '@/hooks/useCurrency';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';
import { useSortableTable, SortableTh } from '@/hooks/useSortableTable';
import { useSmartColumnFilters, ColumnFilterButton, type ColumnFilterDef } from '@/hooks/useColumnFilters';

const COLUMNS: ColumnDef[] = [
  { key: '#', label: '#' },
  { key: 'nombre', label: 'Cliente' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'total', label: 'Total' },
  { key: 'costo', label: 'Costo', defaultVisible: false },
  { key: 'utilidad', label: 'Utilidad' },
  { key: 'margen', label: 'Margen %', defaultVisible: false },
  { key: 'pendiente', label: 'Pendiente' },
];

const FILTER_DEFS: ColumnFilterDef[] = [
  { key: 'nombre', type: 'text', label: 'Cliente' },
  { key: 'ventas', type: 'number', label: 'Ventas' },
  { key: 'total', type: 'number', label: 'Total' },
  { key: 'costo', type: 'number', label: 'Costo' },
  { key: 'utilidad', type: 'number', label: 'Utilidad' },
  { key: 'margen', type: 'number', label: 'Margen %' },
  { key: 'pendiente', type: 'number', label: 'Pendiente' },
];

export function ReporteVentasCliente({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const { visible, setVisible, isVisible } = useColumnVisibility(COLUMNS);
  const rawItems: any[] = data.ventasPorCliente ?? [];
  const getVal = (r: any, k: string) => {
    if (k === 'margen') return r.total > 0 ? ((r.utilidad ?? 0) / r.total) * 100 : 0;
    return r?.[k];
  };
  const { filtered, filters, setFilter, hasActive, clearAll, uniqueValues } = useSmartColumnFilters(rawItems, FILTER_DEFS, getVal);
  const { sorted, sort, toggle } = useSortableTable(filtered, getVal);
  const items = sorted;
  const totalVendido = items.reduce((s, c) => s + c.total, 0);
  const totalPendiente = items.reduce((s, c) => s + c.pendiente, 0);
  const totalUtilidad = items.reduce((s, c) => s + (c.utilidad ?? 0), 0);

  const filterFor = (key: string) => (
    <ColumnFilterButton
      columnKey={key}
      label={FILTER_DEFS.find(d => d.key === key)?.label ?? key}
      type={FILTER_DEFS.find(d => d.key === key)?.type ?? 'text'}
      filter={filters[key]}
      onChange={f => setFilter(key, f)}
      uniqueValues={uniqueValues[key]}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 flex-1">
          <div className="bg-card border border-border rounded-lg p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Clientes activos</div>
            <div className="text-base font-bold text-foreground">{items.length}{hasActive && rawItems.length !== items.length && <span className="text-[10px] font-normal text-muted-foreground"> / {rawItems.length}</span>}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total vendido</div>
            <div className="text-base font-bold text-foreground">{fmt(totalVendido)}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Utilidad</div>
            <div className="text-base font-bold text-foreground">{fmt(totalUtilidad)}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-2 text-center hidden sm:block">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Pendiente</div>
            <div className="text-base font-bold text-foreground">{fmt(totalPendiente)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button onClick={clearAll} className="text-[11px] text-primary hover:underline">Limpiar filtros</button>
          )}
          <ColumnChooser columns={COLUMNS} visible={visible} onChange={setVisible} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              {isVisible('#') && <th className="text-left py-2 px-3 w-8">#</th>}
              {isVisible('nombre') && (
                <th className="text-left py-2 px-3">
                  <span className="inline-flex items-center gap-1">
                    <SortableTh sortKey="nombre" sort={sort} onToggle={toggle} className="p-0 border-0 bg-transparent">Cliente</SortableTh>
                    {filterFor('nombre')}
                  </span>
                </th>
              )}
              {isVisible('ventas') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="ventas" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Ventas</SortableTh>
                    {filterFor('ventas')}
                  </span>
                </th>
              )}
              {isVisible('total') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="total" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Total</SortableTh>
                    {filterFor('total')}
                  </span>
                </th>
              )}
              {isVisible('costo') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="costo" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Costo</SortableTh>
                    {filterFor('costo')}
                  </span>
                </th>
              )}
              {isVisible('utilidad') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="utilidad" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Utilidad</SortableTh>
                    {filterFor('utilidad')}
                  </span>
                </th>
              )}
              {isVisible('margen') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="margen" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Margen</SortableTh>
                    {filterFor('margen')}
                  </span>
                </th>
              )}
              {isVisible('pendiente') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="pendiente" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Pendiente</SortableTh>
                    {filterFor('pendiente')}
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((c, i) => {
              const margen = c.total > 0 ? ((c.utilidad ?? 0) / c.total) * 100 : 0;
              return (
                <tr key={c.id} className="border-b border-border/50">
                  {isVisible('#') && <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>}
                  {isVisible('nombre') && <td className="py-1.5 px-3 font-medium">{c.nombre}</td>}
                  {isVisible('ventas') && <td className="py-1.5 px-3 text-right">{c.ventas}</td>}
                  {isVisible('total') && <td className="py-1.5 px-3 text-right font-semibold">{fmt(c.total)}</td>}
                  {isVisible('costo') && <td className="py-1.5 px-3 text-right">{fmt(c.costo ?? 0)}</td>}
                  {isVisible('utilidad') && <td className="py-1.5 px-3 text-right font-semibold">{fmt(c.utilidad ?? 0)}</td>}
                  {isVisible('margen') && <td className="py-1.5 px-3 text-right text-muted-foreground">{margen.toFixed(1)}%</td>}
                  {isVisible('pendiente') && <td className="py-1.5 px-3 text-right font-semibold">{fmt(c.pendiente)}</td>}
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{hasActive ? 'Sin resultados para el filtro' : 'Sin datos'}</td></tr>}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-bold text-[11px]">
                {isVisible('#') && <td className="py-2 px-3"></td>}
                {isVisible('nombre') && <td className="py-2 px-3 text-right text-muted-foreground">Total:</td>}
                {isVisible('ventas') && <td className="py-2 px-3 text-right">{items.reduce((s, c) => s + c.ventas, 0)}</td>}
                {isVisible('total') && <td className="py-2 px-3 text-right">{fmt(totalVendido)}</td>}
                {isVisible('costo') && <td className="py-2 px-3 text-right">{fmt(items.reduce((s, c) => s + (c.costo ?? 0), 0))}</td>}
                {isVisible('utilidad') && <td className="py-2 px-3 text-right">{fmt(totalUtilidad)}</td>}
                {isVisible('margen') && <td className="py-2 px-3 text-right">{totalVendido > 0 ? ((totalUtilidad / totalVendido) * 100).toFixed(1) : 0}%</td>}
                {isVisible('pendiente') && <td className="py-2 px-3 text-right">{fmt(totalPendiente)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
