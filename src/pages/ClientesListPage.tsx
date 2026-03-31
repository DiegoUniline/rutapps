import { useState, useMemo } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ImportDialog } from '@/components/ImportDialog';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { TablePagination } from '@/components/TablePagination';
import { OdooTabs } from '@/components/OdooTabs';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { MobileListCard } from '@/components/MobileListCard';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useClientesPaginated } from '@/hooks/useClientes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListPreferences, groupData } from '@/hooks/useListPreferences';
import CatalogCRUD from '@/components/CatalogCRUD';
import { cn } from '@/lib/utils';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { readStoredPageSize, type PageSizeOption } from '@/hooks/useTablePagination';

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

const STATIC_FILTER_OPTIONS = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { value: 'activo', label: 'Activo' },
      { value: 'inactivo', label: 'Inactivo' },
      { value: 'suspendido', label: 'Suspendido' },
    ],
  },
  {
    key: 'credito',
    label: 'Crédito',
    options: [
      { value: 'si', label: 'Con crédito' },
      { value: 'no', label: 'Sin crédito' },
    ],
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'zona', label: 'Zona' },
  { value: 'credito', label: 'Tipo crédito' },
];

function getNumericPageSize(ps: PageSizeOption): number {
  return ps === 'all' ? 10000 : ps;
}

function useDynamicFilterOptions() {
  const { empresa } = useAuth();
  const { data: vendedores } = useQuery({
    queryKey: ['vendedores-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('vendedores') as any).select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const { data: zonas } = useQuery({
    queryKey: ['zonas-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('zonas') as any).select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  return { vendedores, zonas };
}

function ClientesTable() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasPermiso } = usePermisos();
  const canCreate = hasPermiso('clientes', 'crear');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(readStoredPageSize);
  const [importOpen, setImportOpen] = useState(false);
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('clientes');
  const { vendedores, zonas } = useDynamicFilterOptions();

  const numericPageSize = getNumericPageSize(pageSize);

  const handlePageSizeChange = (size: PageSizeOption) => {
    setPageSizeState(size);
    setPage(1);
    try { localStorage.setItem('table-page-size', String(size)); } catch {}
  };

  const FILTER_OPTIONS = useMemo(() => [
    ...STATIC_FILTER_OPTIONS,
    { key: 'vendedor', label: 'Vendedor', options: (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre })) },
    { key: 'zona', label: 'Zona', options: (zonas ?? []).map(z => ({ value: z.id, label: z.nombre })) },
  ], [vendedores, zonas]);

  const statusFilter = filters.status?.length ? filters.status.join(',') : 'todos';
  const vendedorFilter = filters.vendedor?.length ? filters.vendedor.join(',') : 'todos';
  const zonaFilter = filters.zona?.length ? filters.zona.join(',') : 'todos';
  const { data: clientesData, isLoading } = useClientesPaginated(search, statusFilter, page, numericPageSize, vendedorFilter, zonaFilter);

  // Client-side credit filter
  const creditoFilter = filters.credito;
  const clientesRaw = clientesData?.rows ?? [];
  const clientes = useMemo(() => {
    if (!creditoFilter || creditoFilter.length === 0) return clientesRaw;
    return clientesRaw.filter(c => {
      const hasCredit = !!c.credito;
      return creditoFilter.includes(hasCredit ? 'si' : 'no');
    });
  }, [clientesRaw, creditoFilter]);
  const total = clientesData?.total ?? 0;
  const from = total === 0 ? 0 : Math.min((page - 1) * numericPageSize + 1, total);
  const to = Math.min(page * numericPageSize, total);
  const totalPages = numericPageSize > 0 ? Math.max(1, Math.ceil(total / numericPageSize)) : 1;
  const pageData = clientes;
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

  const groups = useMemo(() => groupData(pageData, groupBy, (item: any, key) => {
    if (key === 'status') return (item.status ?? 'activo').charAt(0).toUpperCase() + (item.status ?? 'activo').slice(1);
    if (key === 'vendedor') return item.vendedores?.nombre ?? 'Sin vendedor';
    if (key === 'zona') return item.zonas?.nombre ?? 'Sin zona';
    if (key === 'credito') return item.credito ? 'Con crédito' : 'Sin crédito';
    return '';
  }, groupByLevels), [pageData, groupBy, groupByLevels]);

  const renderTable = (items: any[]) => (
    <div className={cn(!groupBy && "bg-card border border-border rounded overflow-x-auto")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-table-border">
            <th className="th-odoo w-10 text-center">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
            </th>
            <th className="th-odoo text-left">Código</th>
            <th className="th-odoo text-left">Nombre</th>
            <th className="th-odoo text-left hidden md:table-cell">Contacto</th>
            <th className="th-odoo text-left hidden md:table-cell">Días de visita</th>
            <th className="th-odoo text-left hidden lg:table-cell">Teléfono</th>
            <th className="th-odoo text-left hidden lg:table-cell">Zona</th>
            <th className="th-odoo text-left hidden xl:table-cell">Vendedor</th>
            <th className="th-odoo text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">No hay clientes. Crea el primero.</td>
            </tr>
          )}
          {items.map((c: any) => (
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
              <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground">
                {c.dia_visita?.length > 0
                  ? c.dia_visita.map((d: string) => d.slice(0, 3)).join(', ')
                  : '—'}
              </td>
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
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por nombre o código..."
          filterOptions={FILTER_OPTIONS}
          activeFilters={filters}
          onToggleFilter={(key, val) => { toggleFilterValue(key, val); setPage(1); }}
          onSetFilter={(key, vals) => { setFilter(key, vals); setPage(1); }}
          onClearFilters={() => { clearFilters(); setPage(1); }}
          groupByOptions={GROUP_BY_OPTIONS}
          activeGroupBy={groupBy}
          onGroupByChange={setGroupBy}
          activeGroupByLevels={groupByLevels}
          onGroupByLevelChange={setGroupByLevel}
        />
        <div className="flex items-center gap-2 shrink-0">
          {!isMobile && (
            <>
              <ExportButton
                onExcel={() => exportToExcel({
                  fileName: 'Clientes', title: 'Catálogo de Clientes',
                  columns: CLIENTES_COLUMNS,
                  data: clientes.map(c => ({ ...c, credito: c.credito ? 'Sí' : 'No' })),
                })}
                onPDF={() => exportToPDF({
                  fileName: 'Clientes', title: 'Catálogo de Clientes',
                  columns: CLIENTES_COLUMNS,
                  data: clientes.map(c => ({ ...c, credito: c.credito ? 'Sí' : 'No' })),
                })}
              />
              {canCreate && (
                <button onClick={() => setImportOpen(true)} className="btn-odoo-secondary shrink-0 gap-1">
                  <Upload className="h-3.5 w-3.5" /> Importar
                </button>
              )}
            </>
          )}
          {canCreate && (
            <button onClick={() => navigate('/clientes/nuevo')} className="btn-odoo-primary shrink-0">
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </button>
          )}
        </div>
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} type="clientes" />
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={isMobile ? 3 : 7} /></div>
      ) : isMobile ? (
        <div className="space-y-2">
          {pageData.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No hay clientes. Crea el primero.</div>
          )}
          {pageData.map(c => (
            <MobileListCard
              key={c.id}
              title={c.nombre}
              subtitle={c.codigo ?? undefined}
              badge={<StatusChip status={c.status ?? 'activo'} />}
              onClick={() => navigate(`/clientes/${c.id}`)}
              fields={[
                ...(c.telefono ? [{ label: 'Tel', value: c.telefono }] : []),
                ...(c.contacto ? [{ label: 'Contacto', value: c.contacto }] : []),
                ...((c as any).zonas?.nombre ? [{ label: 'Zona', value: (c as any).zonas.nombre }] : []),
                ...((c as any).vendedores?.nombre ? [{ label: 'Vendedor', value: (c as any).vendedores.nombre }] : []),
              ]}
            />
          ))}
          {total > 0 && (
            <TablePagination
              from={from} to={to} total={total} page={page} totalPages={totalPages}
              pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
              onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)}
            />
          )}
        </div>
      ) : (
        <>
          <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} />
          {!groupBy && total > 0 && (
            <TablePagination
              from={from} to={to} total={total} page={page} totalPages={totalPages}
              pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
              onFirst={() => setPage(1)} onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))} onLast={() => setPage(totalPages)}
            />
          )}
        </>
      )}
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
        ]}
      />
    </div>
  );
}
