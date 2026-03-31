import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDateFilter } from '@/hooks/useDateFilter';
import { Plus, Truck, Package, ChevronRight } from 'lucide-react';
import { useCargas } from '@/hooks/useCargas';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { fmtDate } from '@/lib/utils';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';

const CARGAS_COLUMNS: ExportColumn[] = [
  { key: 'fecha', header: 'Fecha', format: 'date', width: 14 },
  { key: 'origen', header: 'Origen', width: 20 },
  { key: 'destino', header: 'Destino', width: 20 },
  { key: 'vendedor_nombre', header: 'Responsable', width: 25 },
  { key: 'status', header: 'Estado', width: 12 },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'outline' },
  en_ruta: { label: 'En ruta', variant: 'default' },
  completada: { label: 'Completada', variant: 'secondary' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
};

const FILTER_OPTIONS = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { value: 'pendiente', label: 'Pendiente' },
      { value: 'en_ruta', label: 'En ruta' },
      { value: 'completada', label: 'Completada' },
      { value: 'cancelada', label: 'Cancelada' },
    ],
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'vendedor', label: 'Responsable' },
  { value: 'fecha', label: 'Fecha (día)' },
  { value: 'fecha_anio_mes', label: 'Año-Mes' },
  { value: 'fecha_anio', label: 'Año' },
  { value: 'fecha_mes', label: 'Mes' },
];

export default function CargasListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('cargas');

  const { desde, hasta, setDesde, setHasta, filterByDate } = useDateFilter();
  const statusFilter = filters.status?.length ? filters.status.join(',') : 'todos';
  const { data: cargas, isLoading } = useCargas(search, statusFilter);

  const filtered = useMemo(() => filterByDate(cargas ?? [], 'fecha'), [cargas, filterByDate]);

  const groups = useMemo(() => groupData(filtered, groupBy, (item: any, key) => {
    if (key === 'status') return statusConfig[item.status]?.label ?? item.status;
    if (key === 'vendedor') return item.vendedores?.nombre ?? 'Sin responsable';
    if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
    return '';
  }, groupByLevels), [filtered, groupBy, groupByLevels]);

  const renderTable = (items: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Origen</TableHead>
          <TableHead>Destino</TableHead>
          <TableHead>Responsable</TableHead>
          <TableHead>Productos</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && (
          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin cargas registradas</TableCell></TableRow>
        )}
        {items.map((c: any) => {
          const sc = statusConfig[c.status] ?? statusConfig.pendiente;
          const totalItems = (c.carga_lineas ?? []).reduce((s: number, l: any) => s + (l.cantidad_cargada ?? 0), 0);
          const origen = c.almacen_origen?.nombre ?? '—';
          const destino = c.almacen_destino?.nombre ?? '—';
          return (
            <TableRow key={c.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/almacen/cargas/${c.id}`)}>
              <TableCell className="font-medium">{fmtDate(c.fecha)}</TableCell>
              <TableCell className="text-[13px]">{origen}</TableCell>
              <TableCell className="text-[13px]">{destino}</TableCell>
              <TableCell>{(c.vendedores as any)?.nombre ?? '—'}</TableCell>
              <TableCell>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Package className="h-3.5 w-3.5" /> {(c.carga_lineas ?? []).length} productos · {totalItems} uds
                </span>
              </TableCell>
              <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
              <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5" /> Cargas / Traspasos
            <HelpButton title={HELP.cargas.title} sections={HELP.cargas.sections} />
          </h1>
          <p className="text-sm text-muted-foreground">Transfiere producto entre almacenes y camionetas</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            onExcel={() => exportToExcel({
              fileName: 'Cargas', title: 'Listado de Cargas / Traspasos',
              columns: CARGAS_COLUMNS,
              data: (cargas ?? []).map((c: any) => ({ ...c, vendedor_nombre: c.vendedores?.nombre || '', origen: c.almacen_origen?.nombre || '—', destino: c.almacen_destino?.nombre || '—' })),
            })}
            onPDF={() => exportToPDF({
              fileName: 'Cargas', title: 'Listado de Cargas / Traspasos',
              columns: CARGAS_COLUMNS,
              data: (cargas ?? []).map((c: any) => ({ ...c, vendedor_nombre: c.vendedores?.nombre || '', origen: c.almacen_origen?.nombre || '—', destino: c.almacen_destino?.nombre || '—' })),
            })}
          />
          <button onClick={() => navigate('/almacen/cargas/nuevo')} className="btn-odoo-primary shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nueva carga
          </button>
        </div>
      </div>

      <OdooFilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar..."
        filterOptions={FILTER_OPTIONS}
        activeFilters={filters}
        onToggleFilter={toggleFilterValue}
        onSetFilter={setFilter}
        onClearFilters={clearFilters}
        groupByOptions={GROUP_BY_OPTIONS}
        activeGroupBy={groupBy}
        onGroupByChange={setGroupBy}
        activeGroupByLevels={groupByLevels}
        onGroupByLevelChange={setGroupByLevel}
        desde={desde}
        hasta={hasta}
        onDesdeChange={setDesde}
        onHastaChange={setHasta}
        dateFrom={desde}
        dateTo={hasta}
        onDateFromChange={setDesde}
        onDateToChange={setHasta}
      />

      {isLoading ? <TableSkeleton /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} />
        </div>
      )}
    </div>
  );
}
