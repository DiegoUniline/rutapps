import { useState } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { TableSkeleton } from '@/components/TableSkeleton';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { useTarifas } from '@/hooks/useData';
import { cn } from '@/lib/utils';

const tipoLabel: Record<string, string> = { general: 'General', por_cliente: 'Por Cliente', por_ruta: 'Por Ruta' };

export default function TarifasListPage() {
  const navigate = useNavigate();
  const { data: tarifas, isLoading } = useTarifas();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = tarifas?.filter(t =>
    !search || t.nombre.toLowerCase().includes(search.toLowerCase())
  ) ?? [];
  const total = filtered.length;
  const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(t => t.id)));
  };

  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Tarifas <HelpButton title={HELP.tarifas.title} sections={HELP.tarifas.sections} /></h1>
        <button onClick={() => navigate('/tarifas/nueva')} className="btn-odoo-primary shrink-0">
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </button>
      </div>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar tarifa..." />

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={5} cols={5} /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo w-10 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
                  </th>
                  <th className="th-odoo text-left">Nombre</th>
                  <th className="th-odoo text-left">Tipo</th>
                  <th className="th-odoo text-left">Vigencia</th>
                  <th className="th-odoo text-center"># Productos</th>
                  <th className="th-odoo text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">No hay tarifas.</td>
                  </tr>
                )}
                {filtered.map(t => (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-table-border cursor-pointer transition-colors",
                      selected.has(t.id) ? "bg-primary/5" : "hover:bg-table-hover"
                    )}
                    onClick={() => navigate(`/tarifas/${t.id}`)}
                  >
                    <td className="py-1.5 px-3 text-center" onClick={e => { e.stopPropagation(); const next = new Set(selected); next.has(t.id) ? next.delete(t.id) : next.add(t.id); setSelected(next); }}>
                      <input type="checkbox" checked={selected.has(t.id)} readOnly className="rounded border-input" />
                    </td>
                    <td className="py-1.5 px-3 font-medium">{t.nombre}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">{tipoLabel[t.tipo] ?? t.tipo}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">
                      {t.vigencia_inicio && t.vigencia_fin ? `${t.vigencia_inicio} — ${t.vigencia_fin}` : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-center">{t.tarifa_lineas?.length ?? 0}</td>
                    <td className="py-1.5 px-3 text-center">
                      {t.activa
                        ? <span className="status-pill status-activo">Activa</span>
                        : <span className="status-pill status-borrador">Inactiva</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > 0 && <OdooPagination from={1} to={total} total={total} />}
          </>
        )}
      </div>
    </div>
  );
}
