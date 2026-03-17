import { useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { ImportDialog } from '@/components/ImportDialog';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { OdooTabs } from '@/components/OdooTabs';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useClientes } from '@/hooks/useClientes';
import CatalogCRUD from '@/components/CatalogCRUD';
import { cn } from '@/lib/utils';

const CLIENTES_COLUMNS: ExportColumn[] = [
  { key: 'codigo', header: 'Código', width: 10 },
  { key: 'nombre', header: 'Nombre', width: 30 },
  { key: 'contacto', header: 'Contacto', width: 20 },
  { key: 'telefono', header: 'Teléfono', width: 14 },
  { key: 'email', header: 'Email', width: 22 },
  { key: 'direccion', header: 'Dirección', width: 30 },
  { key: 'colonia', header: 'Colonia', width: 16 },
  { key: 'credito', header: 'Crédito', width: 8 },
  { key: 'limite_credito', header: 'Límite crédito', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 10 },
];

const PAGE_SIZE = 80;

function ClientesTable() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const { data: clientes, isLoading } = useClientes(search, statusFilter);

  const total = clientes?.length ?? 0;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = clientes?.slice(from - 1, to) ?? [];
  const allSelected = pageData.length > 0 && pageData.every(c => selected.has(c.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map(c => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por nombre o código..."
        >
          <SearchableSelect
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'activo', label: 'Activo' },
              { value: 'inactivo', label: 'Inactivo' },
              { value: 'suspendido', label: 'Suspendido' },
            ]}
            value={statusFilter}
            onChange={val => { setStatusFilter(val); setPage(1); }}
            placeholder="Estado..."
          />
        </OdooFilterBar>
        <div className="flex items-center gap-2 shrink-0">
          <ExportButton
            onExcel={() => exportToExcel({
              fileName: 'Clientes', title: 'Catálogo de Clientes',
              columns: CLIENTES_COLUMNS,
              data: (clientes ?? []).map((c: any) => ({ ...c, credito: c.credito ? 'Sí' : 'No' })),
            })}
            onPDF={() => exportToPDF({
              fileName: 'Clientes', title: 'Catálogo de Clientes',
              columns: CLIENTES_COLUMNS,
              data: (clientes ?? []).map((c: any) => ({ ...c, credito: c.credito ? 'Sí' : 'No' })),
            })}
          />
          <button onClick={() => setImportOpen(true)} className="btn-odoo-secondary shrink-0 gap-1">
            <Upload className="h-3.5 w-3.5" /> Importar
          </button>
          <button onClick={() => navigate('/clientes/nuevo')} className="btn-odoo-primary shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo
          </button>
        </div>
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} type="clientes" />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={7} /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo w-10 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
                  </th>
                  <th className="th-odoo text-left">Código</th>
                  <th className="th-odoo text-left">Nombre</th>
                  <th className="th-odoo text-left hidden md:table-cell">Contacto</th>
                  <th className="th-odoo text-left hidden lg:table-cell">Teléfono</th>
                  <th className="th-odoo text-left hidden lg:table-cell">Zona</th>
                  <th className="th-odoo text-left hidden xl:table-cell">Vendedor</th>
                  <th className="th-odoo text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      No hay clientes. Crea el primero.
                    </td>
                  </tr>
                )}
                {pageData.map(c => (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-table-border cursor-pointer transition-colors",
                      selected.has(c.id) ? "bg-primary/5" : "hover:bg-table-hover"
                    )}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <td className="py-1.5 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(c.id); }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} className="rounded border-input" />
                    </td>
                    <td className="py-1.5 px-3 font-mono text-xs">{c.codigo ?? '—'}</td>
                    <td className="py-1.5 px-3 font-medium">{c.nombre}</td>
                    <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground">{c.contacto ?? '—'}</td>
                    <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{c.telefono ?? '—'}</td>
                    <td className="py-1.5 px-3 hidden lg:table-cell text-muted-foreground">{c.zonas?.nombre ?? '—'}</td>
                    <td className="py-1.5 px-3 hidden xl:table-cell text-muted-foreground">{c.vendedores?.nombre ?? '—'}</td>
                    <td className="py-1.5 px-3 text-center">
                      <StatusChip status={c.status ?? 'activo'} />
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

export default function ClientesListPage() {
  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Clientes <HelpButton title={HELP.clientes.title} sections={HELP.clientes.sections} /></h1>
      <OdooTabs
        tabs={[
          { key: 'clientes', label: 'Clientes', content: <ClientesTable /> },
          { key: 'zonas', label: 'Zonas', content: <CatalogCRUD title="Zonas" tableName="zonas" queryKey="zonas" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
          { key: 'vendedores', label: 'Vendedores', content: <CatalogCRUD title="Vendedores" tableName="vendedores" queryKey="vendedores" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
          { key: 'cobradores', label: 'Cobradores', content: <CatalogCRUD title="Cobradores" tableName="cobradores" queryKey="cobradores" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
        ]}
      />
    </div>
  );
}
