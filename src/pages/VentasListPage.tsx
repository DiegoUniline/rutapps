import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useVentas } from '@/hooks/useVentas';
import { cn } from '@/lib/utils';

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
    <div className="p-4 space-y-3 bg-secondary/50 min-h-full">
      <h1 className="text-xl font-semibold text-foreground">Ventas & Pedidos</h1>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <OdooFilterBar
            search={search}
            onSearchChange={val => { setSearch(val); setPage(1); }}
            placeholder="Buscar por folio o cliente..."
          >
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="input-odoo w-auto min-w-[120px]"
            >
              <option value="todos">Todos</option>
              <option value="borrador">Borrador</option>
              <option value="confirmado">Confirmado</option>
              <option value="entregado">Entregado</option>
              <option value="facturado">Facturado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select
              value={tipoFilter}
              onChange={e => { setTipoFilter(e.target.value); setPage(1); }}
              className="input-odoo w-auto min-w-[120px]"
            >
              <option value="todos">Todos los tipos</option>
              <option value="pedido">Pedido</option>
              <option value="venta_directa">Venta directa</option>
            </select>
          </OdooFilterBar>
          <button onClick={() => navigate('/ventas/nuevo')} className="btn-odoo-primary shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nueva Venta
          </button>
        </div>

        <div className="bg-card border border-border rounded overflow-x-auto">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-table-border">
                    <th className="th-odoo w-10 text-center">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
                    </th>
                    <th className="th-odoo text-left">Folio</th>
                    <th className="th-odoo text-left">Tipo</th>
                    <th className="th-odoo text-left">Cliente</th>
                    <th className="th-odoo text-left hidden md:table-cell">Vendedor</th>
                    <th className="th-odoo text-left hidden lg:table-cell">Condición</th>
                    <th className="th-odoo text-left hidden lg:table-cell">Fecha</th>
                    <th className="th-odoo text-right">Total</th>
                    <th className="th-odoo text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
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
                      <td className="py-1.5 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(v.id); }}>
                        <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleOne(v.id)} className="rounded border-input" />
                      </td>
                      <td className="py-1.5 px-3 font-mono text-xs">{v.folio || v.id.slice(0, 8)}</td>
                      <td className="py-1.5 px-3">
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          v.tipo === 'pedido' ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                        )}>
                          {TIPO_LABELS[v.tipo] || v.tipo}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 font-medium">{v.clientes?.nombre ?? '—'}</td>
                      <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground">{v.vendedores?.nombre ?? '—'}</td>
                      <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{CONDICION_LABELS[v.condicion_pago] || v.condicion_pago}</td>
                      <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{v.fecha}</td>
                      <td className="py-1.5 px-3 text-right font-medium">${v.total?.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-center">
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
