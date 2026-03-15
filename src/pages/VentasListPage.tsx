import { useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useVentas } from '@/hooks/useVentas';
import { cn, fmtDate } from '@/lib/utils';

const VENTAS_COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 14 },
  { key: 'cliente_nombre', header: 'Cliente', width: 25 },
  { key: 'tipo', header: 'Tipo', width: 14 },
  { key: 'condicion_pago', header: 'Condición', width: 12 },
  { key: 'subtotal', header: 'Subtotal', format: 'currency', width: 14 },
  { key: 'iva_total', header: 'IVA', format: 'currency', width: 12 },
  { key: 'total', header: 'Total', format: 'currency', width: 14 },
  { key: 'saldo_pendiente', header: 'Saldo', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 12 },
];

const PAGE_SIZE = 80;

const CONDICION_LABELS: Record<string, string> = {
  contado: 'Contado',
  credito: 'Crédito',
  por_definir: 'Por definir',
};

const TIPO_LABELS: Record<string, string> = {
  pedido: 'Pedido',
  venta_directa: 'Venta directa',
};

export default function VentasListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const { data: ventas, isLoading } = useVentas(search, statusFilter, tipoFilter);

  const total = ventas?.length ?? 0;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = ventas?.slice(from - 1, to) ?? [];
  const allSelected = pageData.length > 0 && pageData.every(v => selected.has(v.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map(v => v.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground">Ventas y pedidos</h1>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <OdooFilterBar
            search={search}
            onSearchChange={val => { setSearch(val); setPage(1); }}
            placeholder="Buscar por folio o cliente..."
          >
            <SearchableSelect
              options={[
                { value: 'todos', label: 'Todos los estados' },
                { value: 'borrador', label: 'Borrador' },
                { value: 'confirmado', label: 'Confirmado' },
                { value: 'entregado', label: 'Entregado' },
                { value: 'facturado', label: 'Facturado' },
                { value: 'cancelado', label: 'Cancelado' },
              ]}
              value={statusFilter}
              onChange={val => { setStatusFilter(val); setPage(1); }}
              placeholder="Estado..."
            />
            <SearchableSelect
              options={[
                { value: 'todos', label: 'Todos los tipos' },
                { value: 'pedido', label: 'Pedido' },
                { value: 'venta_directa', label: 'Venta directa' },
              ]}
              value={tipoFilter}
              onChange={val => { setTipoFilter(val); setPage(1); }}
              placeholder="Tipo..."
            />
          </OdooFilterBar>
          <div className="flex items-center gap-2 shrink-0">
            <ExportButton
              onExcel={() => exportToExcel({
                fileName: 'Ventas', title: 'Reporte de Ventas',
                columns: VENTAS_COLUMNS,
                data: (ventas ?? []).map((v: any) => ({ ...v, cliente_nombre: v.clientes?.nombre || '' })),
                totals: { total: ventas?.reduce((s: number, v: any) => s + (v.total ?? 0), 0) ?? 0, saldo_pendiente: ventas?.reduce((s: number, v: any) => s + (v.saldo_pendiente ?? 0), 0) ?? 0 },
              })}
              onPDF={() => exportToPDF({
                fileName: 'Ventas', title: 'Reporte de Ventas',
                columns: VENTAS_COLUMNS,
                data: (ventas ?? []).map((v: any) => ({ ...v, cliente_nombre: v.clientes?.nombre || '' })),
                totals: { total: ventas?.reduce((s: number, v: any) => s + (v.total ?? 0), 0) ?? 0, saldo_pendiente: ventas?.reduce((s: number, v: any) => s + (v.saldo_pendiente ?? 0), 0) ?? 0 },
              })}
            />
            <button onClick={() => navigate('/ventas/nuevo')} className="btn-odoo-primary shrink-0">
              <Plus className="h-3.5 w-3.5" /> Nueva venta
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded overflow-x-auto">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
          ) : (
            <>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-table-border text-left">
                    <th className="py-2 px-3 w-10 text-center">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
                    </th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Vendedor</th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Condición</th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>
                    <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-muted-foreground">
                        No hay ventas. Crea la primera.
                      </td>
                    </tr>
                  )}
                  {pageData.map(v => (
                    <tr
                      key={v.id}
                      className={cn(
                        "border-b border-table-border cursor-pointer transition-colors",
                        selected.has(v.id) ? "bg-primary/5" : "hover:bg-table-hover"
                      )}
                      onClick={() => navigate(`/ventas/${v.id}`)}
                    >
                      <td className="py-2 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(v.id); }}>
                        <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleOne(v.id)} className="rounded border-input" />
                      </td>
                      <td className="py-2 px-3 font-mono text-xs font-medium">{v.folio || v.id.slice(0, 8)}</td>
                      <td className="py-2 px-3">
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded",
                          v.tipo === 'pedido' ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
                        )}>
                          {TIPO_LABELS[v.tipo] || v.tipo}
                        </span>
                      </td>
                      <td className="py-2 px-3">{v.clientes?.nombre ?? '—'}</td>
                      <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{v.vendedores?.nombre ?? '—'}</td>
                      <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{CONDICION_LABELS[v.condicion_pago] || v.condicion_pago}</td>
                      <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDate(v.fecha)}</td>
                      <td className="py-2 px-3 text-right font-medium">${v.total?.toFixed(2)}</td>
                      <td className="py-2 px-3 text-center">
                        <StatusChip status={v.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {total > 0 && (
                <OdooPagination
                  from={from}
                  to={to}
                  total={total}
                  onPrev={() => setPage(p => Math.max(1, p - 1))}
                  onNext={() => setPage(p => p + 1)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
