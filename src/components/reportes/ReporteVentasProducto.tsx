import { useCurrency } from '@/hooks/useCurrency';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';
import { useSortableTable, SortableTh } from '@/hooks/useSortableTable';
import { useSmartColumnFilters, ColumnFilterButton, type ColumnFilterDef } from '@/hooks/useColumnFilters';

const COLUMNS: ColumnDef[] = [
  { key: '#', label: '#' },
  { key: 'codigo', label: 'Código' },
  { key: 'nombre', label: 'Producto' },
  { key: 'cantidad', label: 'Unidades' },
  { key: 'costo', label: 'Costo', defaultVisible: false },
  { key: 'total', label: 'Total' },
  { key: 'utilidad', label: 'Utilidad' },
  { key: 'margen', label: 'Margen %', defaultVisible: false },
];

const FILTER_DEFS: ColumnFilterDef[] = [
  { key: 'codigo', type: 'text', label: 'Código' },
  { key: 'nombre', type: 'text', label: 'Producto' },
  { key: 'cantidad', type: 'number', label: 'Uds' },
  { key: 'costo', type: 'number', label: 'Costo' },
  { key: 'total', type: 'number', label: 'Total' },
  { key: 'utilidad', type: 'number', label: 'Utilidad' },
  { key: 'margen', type: 'number', label: 'Margen %' },
];

export function ReporteVentasProducto({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const { visible, setVisible, isVisible } = useColumnVisibility(COLUMNS);
  const rawItems: any[] = data.ventasPorProducto ?? [];
  const getVal = (r: any, k: string) => {
    if (k === 'margen') return r.total > 0 ? ((r.utilidad ?? 0) / r.total) * 100 : 0;
    if (k === 'costo') return (r.costo ?? 0) * (r.cantidad ?? 0);
    return r?.[k];
  };
  const { filtered, filters, setFilter, hasActive, clearAll, uniqueValues } = useSmartColumnFilters(rawItems, FILTER_DEFS, getVal);
  const { sorted, sort, toggle } = useSortableTable(filtered, getVal);
  const items = sorted;
  const totalGeneral = items.reduce((s, p) => s + p.total, 0);
  const totalUnidades = items.reduce((s, p) => s + p.cantidad, 0);
  const totalUtilidad = items.reduce((s, p) => s + (p.utilidad ?? 0), 0);
  const totalCosto = items.reduce((s, p) => s + ((p.costo ?? 0) * (p.cantidad ?? 0)), 0);

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
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Productos</div>
            <div className="text-base font-bold text-foreground">{items.length}{hasActive && rawItems.length !== items.length && <span className="text-[10px] font-normal text-muted-foreground"> / {rawItems.length}</span>}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Unidades</div>
            <div className="text-base font-bold text-foreground">{totalUnidades.toLocaleString()}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Venta total</div>
            <div className="text-base font-bold text-foreground">{fmt(totalGeneral)}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-2 text-center hidden sm:block">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Utilidad</div>
            <div className="text-base font-bold text-foreground">{fmt(totalUtilidad)}</div>
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
              {isVisible('codigo') && (
                <th className="text-left py-2 px-3">
                  <span className="inline-flex items-center gap-1">
                    <SortableTh sortKey="codigo" sort={sort} onToggle={toggle} className="p-0 border-0 bg-transparent">Código</SortableTh>
                    {filterFor('codigo')}
                  </span>
                </th>
              )}
              {isVisible('nombre') && (
                <th className="text-left py-2 px-3">
                  <span className="inline-flex items-center gap-1">
                    <SortableTh sortKey="nombre" sort={sort} onToggle={toggle} className="p-0 border-0 bg-transparent">Producto</SortableTh>
                    {filterFor('nombre')}
                  </span>
                </th>
              )}
              {isVisible('cantidad') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="cantidad" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Uds</SortableTh>
                    {filterFor('cantidad')}
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
              {isVisible('total') && (
                <th className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    <SortableTh sortKey="total" sort={sort} onToggle={toggle} align="right" className="p-0 border-0 bg-transparent">Total</SortableTh>
                    {filterFor('total')}
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
            </tr>
          </thead>
          <tbody>
            {items.map((p, i) => {
              const margen = p.total > 0 ? ((p.utilidad ?? 0) / p.total) * 100 : 0;
              return (
                <tr key={p.id} className="border-b border-border/50">
                  {isVisible('#') && <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>}
                  {isVisible('codigo') && <td className="py-1.5 px-3 font-mono text-muted-foreground">{p.codigo}</td>}
                  {isVisible('nombre') && <td className="py-1.5 px-3 font-medium">{p.nombre}</td>}
                  {isVisible('cantidad') && <td className="py-1.5 px-3 text-right">{p.cantidad}</td>}
                  {isVisible('costo') && <td className="py-1.5 px-3 text-right">{fmt((p.costo ?? 0) * (p.cantidad ?? 0))}</td>}
                  {isVisible('total') && <td className="py-1.5 px-3 text-right font-semibold">{fmt(p.total)}</td>}
                  {isVisible('utilidad') && <td className="py-1.5 px-3 text-right font-semibold">{fmt(p.utilidad ?? 0)}</td>}
                  {isVisible('margen') && <td className="py-1.5 px-3 text-right text-muted-foreground">{margen.toFixed(1)}%</td>}
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{hasActive ? 'Sin resultados para el filtro' : 'Sin datos'}</td></tr>}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-bold text-[11px]">
                {isVisible('#') && <td className="py-2 px-3"></td>}
                {isVisible('codigo') && <td className="py-2 px-3"></td>}
                {isVisible('nombre') && <td className="py-2 px-3 text-right text-muted-foreground">Total:</td>}
                {isVisible('cantidad') && <td className="py-2 px-3 text-right">{totalUnidades}</td>}
                {isVisible('costo') && <td className="py-2 px-3 text-right">{fmt(totalCosto)}</td>}
                {isVisible('total') && <td className="py-2 px-3 text-right">{fmt(totalGeneral)}</td>}
                {isVisible('utilidad') && <td className="py-2 px-3 text-right">{fmt(totalUtilidad)}</td>}
                {isVisible('margen') && <td className="py-2 px-3 text-right">{totalGeneral > 0 ? ((totalUtilidad / totalGeneral) * 100).toFixed(1) : 0}%</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
