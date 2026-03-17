import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { StatusChip } from '@/components/StatusChip';
import SearchableSelect from '@/components/SearchableSelect';
import { fmtDate, cn } from '@/lib/utils';

const TIPO_LABELS: Record<string, string> = {
  almacen_almacen: 'Almacén → Almacén',
  almacen_ruta: 'Almacén → Ruta',
  ruta_almacen: 'Ruta → Almacén',
};

const PAGE_SIZE = 80;

export default function TraspasosListPage() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: traspasos, isLoading } = useQuery({
    queryKey: ['traspasos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traspasos')
        .select('*, almacen_origen:almacenes!traspasos_almacen_origen_id_fkey(nombre), almacen_destino:almacenes!traspasos_almacen_destino_id_fkey(nombre), vendedor_origen:vendedores!traspasos_vendedor_origen_id_fkey(nombre), vendedor_destino:vendedores!traspasos_vendedor_destino_id_fkey(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = traspasos ?? [];
    if (statusFilter !== 'todos') list = list.filter((t: any) => t.status === statusFilter);
    if (search) list = list.filter((t: any) => t.folio?.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [traspasos, search, statusFilter]);

  const total = filtered.length;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = filtered.slice(from - 1, to);
  const allSelected = pageData.length > 0 && pageData.every((t: any) => selected.has(t.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map((t: any) => t.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const getOrigenLabel = (t: any) => t.almacen_origen?.nombre || t.vendedor_origen?.nombre || '—';
  const getDestinoLabel = (t: any) => t.almacen_destino?.nombre || t.vendedor_destino?.nombre || '—';

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Traspasos <HelpButton title={HELP.traspasos.title} sections={HELP.traspasos.sections} /></h1>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por folio..."
        >
          <SearchableSelect
            options={[
              { value: 'todos', label: 'Todos los estados' },
              { value: 'borrador', label: 'Borrador' },
              { value: 'confirmado', label: 'Confirmado' },
              { value: 'cancelado', label: 'Cancelado' },
            ]}
            value={statusFilter}
            onChange={val => { setStatusFilter(val); setPage(1); }}
            placeholder="Estado..."
          />
        </OdooFilterBar>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => navigate('/almacen/traspasos/nuevo')} className="btn-odoo-primary shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo traspaso
          </button>
        </div>
      </div>

      {!isLoading && total > 0 && (
        <div className="flex items-center gap-6 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
          <span><strong className="text-foreground">{total}</strong> traspasos</span>
        </div>
      )}

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={7} /></div>
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
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Origen</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Destino</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Fecha</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      No hay traspasos. Crea el primero.
                    </td>
                  </tr>
                )}
                {pageData.map((t: any) => (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-table-border cursor-pointer transition-colors",
                      selected.has(t.id) ? "bg-primary/5" : "hover:bg-table-hover"
                    )}
                    onClick={() => navigate(`/almacen/traspasos/${t.id}`)}
                  >
                    <td className="py-2 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(t.id); }}>
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} className="rounded border-input" />
                    </td>
                    <td className="py-2 px-3 font-mono text-xs font-medium">{t.folio || t.id.slice(0, 8)}</td>
                    <td className="py-2 px-3">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {TIPO_LABELS[t.tipo] || t.tipo}
                      </span>
                    </td>
                    <td className="py-2 px-3">{getOrigenLabel(t)}</td>
                    <td className="py-2 px-3">{getDestinoLabel(t)}</td>
                    <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{fmtDate(t.fecha)}</td>
                    <td className="py-2 px-3 text-center">
                      <StatusChip status={t.status} />
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
  );
}
