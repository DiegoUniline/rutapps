import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePagination } from '@/components/TablePagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { OdooFilterBar, type FilterOption } from '@/components/OdooFilterBar';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { groupData, useListPreferences, type GroupNode } from '@/hooks/useListPreferences';
import { exportToExcel, exportToPDF, type ExportGroup, type ExportOptions } from '@/lib/exportUtils';
import { cn, fmtDate } from '@/lib/utils';
import {
  AGRUPACION_COMISION_LABEL,
  buildReporteComisionVenta,
  ESTADO_COMISION_LABEL,
  ESTADO_CUENTA_LABEL,
  etiquetaAgrupacionComision,
  filtrarReporteComisiones,
  ordenAgrupacionComision,
  totalizarComisiones,
  type AgrupacionComision,
  type ComisionVentaSource,
  type EstadoCuentaComision,
  type EstadoPagoComision,
  type ReporteComisionVenta,
  type TotalesComisiones,
} from '@/lib/reporteComisionesVentas';

const GROUP_BY_OPTIONS = (Object.keys(AGRUPACION_COMISION_LABEL) as AgrupacionComision[])
  .map(value => ({ value, label: AGRUPACION_COMISION_LABEL[value] }));

const STATIC_FILTERS: FilterOption[] = [
  { key: 'estadoCuenta', label: 'Cuenta', options: (Object.keys(ESTADO_CUENTA_LABEL) as EstadoCuentaComision[]).map(value => ({ value, label: ESTADO_CUENTA_LABEL[value] })) },
  { key: 'estadoComision', label: 'Comisión', options: (Object.keys(ESTADO_COMISION_LABEL) as EstadoPagoComision[]).map(value => ({ value, label: ESTADO_COMISION_LABEL[value] })) },
  { key: 'fiscal', label: 'Fiscal', options: [
    { value: 'fiscal', label: 'Requiere factura' },
    { value: 'no_fiscal', label: 'No requiere factura' },
    { value: 'rfc_pendiente', label: 'RFC pendiente' },
  ] },
];

interface Props {
  desde: string;
  hasta: string;
  vendedorIds?: string[];
}

const accountTone: Record<EstadoCuentaComision, string> = {
  adeudo: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  liquidada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelada: 'bg-muted text-muted-foreground',
};

const commissionTone: Record<EstadoPagoComision, string> = {
  sin_comision: 'bg-muted text-muted-foreground',
  pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  en_recibo: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  parcial: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelada: 'bg-muted text-muted-foreground',
};

export function ReporteComisionesVentas({ desde, hasta, vendedorIds }: Props) {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const enabled = !!empresa?.id;
  const [search, setSearch] = useState('');
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('reporte-comisiones-ventas');

  const query = useQuery({
    queryKey: ['reporte-comisiones-ventas', empresa?.id, desde, hasta, vendedorIds],
    enabled: enabled && !!empresa?.id && !!desde && !!hasta,
    queryFn: async () => {
      const empresaId = empresa!.id;
      return fetchAllPages<ComisionVentaSource>((from, to) => {
        let request = supabase
          .from('ventas')
          .select(`
            id, folio, fecha, total, saldo_pendiente, status, requiere_factura,
            cliente_id, vendedor_id,
            clientes(nombre, rfc, zonas(nombre)),
            vendedores:profiles!ventas_vendedor_id_profiles_fkey(nombre),
            venta_comisiones(comision_monto, pagada, pago_comision_id)
          `)
          .eq('empresa_id', empresaId)
          .eq('es_saldo_inicial', false)
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: false })
          // Desempate por creación, no por folio: como texto, PED-9999 queda antes que PED-10000.
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);
        if (vendedorIds?.length) request = request.in('vendedor_id', vendedorIds);
        return request;
      });
    },
    staleTime: 60_000,
  });

  const rows = useMemo(
    () => (query.data ?? []).map(buildReporteComisionVenta),
    [query.data],
  );

  const rutas = useMemo(
    () => Array.from(new Set(rows.map(row => row.ruta))).sort((a, b) => a.localeCompare(b, 'es')),
    [rows],
  );

  const filterOptions = useMemo<FilterOption[]>(() => [
    { key: 'ruta', label: 'Ruta/Zona', options: rutas.map(item => ({ value: item, label: item })) },
    ...STATIC_FILTERS,
  ], [rutas]);

  const filtered = useMemo(() => filtrarReporteComisiones(rows, filters, search), [rows, filters, search]);

  const totals = useMemo(() => totalizarComisiones(filtered), [filtered]);

  const groups = useMemo(
    () => groupData(filtered, groupBy, etiquetaAgrupacionComision, groupByLevels, ordenAgrupacionComision),
    [filtered, groupBy, groupByLevels],
  );

  const pagination = useTablePagination(filtered, 'reporte-comisiones-ventas');
  const { resetPage } = pagination;
  useEffect(() => resetPage(), [resetPage, search, filters, desde, hasta, vendedorIds]);

  const exportRow = (row: ReporteComisionVenta) => ({
    ...row,
    estadoCuentaLabel: ESTADO_CUENTA_LABEL[row.estadoCuenta],
    estadoComisionLabel: ESTADO_COMISION_LABEL[row.estadoComision],
    tipoFiscal: row.requiereFactura ? 'Fiscal' : 'No fiscal',
    rfc: row.requiereFactura && !row.rfc ? 'RFC pendiente' : row.rfc,
  });

  // Excel solo agrupa en un nivel: cada combinación de niveles es un grupo ("Vendedor › Ruta").
  const exportGroups = (): ExportGroup[] | undefined => {
    if (!groupByLevels.length) return undefined;
    const leaves: ExportGroup[] = [];
    const walk = (nodes: GroupNode<ReporteComisionVenta>[], path: string[]) => {
      for (const node of nodes) {
        const labels = [...path, node.label];
        if (node.subGroups?.length) { walk(node.subGroups, labels); continue; }
        const subtotal = totalizarComisiones(node.items);
        leaves.push({
          key: labels.join('__'),
          label: labels.join(' › '),
          rows: node.items.map(exportRow),
          subtotals: { comision: subtotal.comision, total: subtotal.vendido, saldo: subtotal.saldo },
        });
      }
    };
    walk(groups, []);
    return leaves;
  };

  const exportOptions = (): ExportOptions => ({
    fileName: `Reporte_Comisiones_${desde}_${hasta}`,
    title: 'Reporte de Comisiones',
    subtitle: 'Comisiones consolidadas por venta',
    empresa: empresa?.nombre,
    empresaInfo: {
      nombre: empresa?.nombre ?? 'Empresa',
      rfc: empresa?.rfc,
      email: empresa?.email,
      logo_url: empresa?.logo_url,
    },
    currencyCode: empresa?.moneda,
    dateRange: { from: desde, to: hasta },
    columns: [
      { key: 'folio', header: 'Folio', width: 14 },
      { key: 'cliente', header: 'Cliente', width: 30 },
      { key: 'vendedor', header: 'Vendedor', width: 24 },
      { key: 'fecha', header: 'Fecha', format: 'date', width: 13 },
      { key: 'ruta', header: 'Ruta/Zona', width: 20 },
      { key: 'estadoCuentaLabel', header: 'Estado cuenta', width: 14 },
      { key: 'tipoFiscal', header: 'Tipo', width: 12 },
      { key: 'rfc', header: 'RFC', width: 16 },
      { key: 'estadoComisionLabel', header: 'Estado comisión', width: 16 },
      { key: 'comision', header: 'Comisión', format: 'currency', width: 14 },
      { key: 'total', header: 'Total venta', format: 'currency', width: 14 },
      { key: 'saldo', header: 'Saldo cliente', format: 'currency', width: 14 },
    ],
    data: filtered.map(exportRow),
    groups: exportGroups(),
    groupByLabel: groupByLevels.length ? groupByLevels.map(level => AGRUPACION_COMISION_LABEL[level as AgrupacionComision] ?? level).join(' › ') : undefined,
    totals: { comision: totals.comision, total: totals.vendido, saldo: totals.saldo },
  });

  const exportReport = async (format: 'excel' | 'pdf') => {
    if (!filtered.length) {
      toast.info('No hay ventas para exportar con los filtros actuales');
      return;
    }
    try {
      if (format === 'excel') await exportToExcel(exportOptions());
      else await exportToPDF(exportOptions());
    } catch (error) {
      console.error('[ReporteComisionesVentas] export', error);
      toast.error('No se pudo generar el archivo');
    }
  };

  if (!enabled) return null;

  if (query.isLoading) return <TableSkeleton />;

  if (query.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertCircle className="mx-auto h-7 w-7 text-destructive" />
        <p className="mt-2 text-sm font-medium">No se pudo cargar el reporte de comisiones</p>
        <p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : 'Error desconocido'}</p>
        <button onClick={() => query.refetch()} className="btn-odoo-secondary mt-3 inline-flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Summary label="Ventas" value={totals.ventas.toLocaleString('es-MX')} />
        <Summary label="Vendido" value={fmt(totals.vendido)} />
        <Summary label="Comisión total" value={fmt(totals.comision)} tone="teal" />
        <Summary label="Comisión pendiente" value={fmt(totals.comisionPendiente)} tone="amber" />
        <Summary label="Comisión pagada" value={fmt(totals.comisionPagada)} tone="green" />
        <Summary label="Por cobrar clientes" value={fmt(totals.saldo)} tone={totals.saldo > 0 ? 'red' : 'default'} />
      </div>

      <div className="print:hidden">
        <OdooFilterBar
          compact
          search={search}
          onSearchChange={setSearch}
          placeholder="Folio, cliente, vendedor…"
          filterOptions={filterOptions}
          activeFilters={filters}
          onToggleFilter={toggleFilterValue}
          onSetFilter={setFilter}
          groupByOptions={GROUP_BY_OPTIONS}
          activeGroupBy={groupBy}
          onGroupByChange={setGroupBy}
          activeGroupByLevels={groupByLevels}
          onGroupByLevelChange={setGroupByLevel}
          onClearFilters={clearFilters}
        >
          <ExportButton compact onExcel={() => void exportReport('excel')} onPDF={() => void exportReport('pdf')} />
          <button onClick={() => window.print()} className="btn-odoo-secondary h-7 gap-1 text-[11px]">
            <FileText className="h-3 w-3" /> Imprimir
          </button>
        </OdooFilterBar>
      </div>

      {groupByLevels.length > 0 ? (
        <GroupedTableWrapper
          groupBy={groupBy}
          groups={groups}
          renderTable={items => <ComisionesTable rows={items} fmt={fmt} />}
          renderSummary={items => <GroupSummary totals={totalizarComisiones(items)} fmt={fmt} />}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <ComisionesTable rows={pagination.paginatedItems} fmt={fmt} footer={filtered.length ? { count: filtered.length, totals } : undefined} />
          <TablePagination
            from={pagination.from} to={pagination.to} total={pagination.total}
            page={pagination.page} totalPages={pagination.totalPages} pageSize={pagination.pageSize}
            onPageSizeChange={pagination.setPageSize} onFirst={pagination.goFirst}
            onPrev={pagination.goPrev} onNext={pagination.goNext} onLast={pagination.goLast}
          />
        </div>
      )}
    </div>
  );
}

interface ComisionesTableProps {
  rows: ReporteComisionVenta[];
  fmt: (value: number) => string;
  footer?: { count: number; totals: TotalesComisiones };
}

function ComisionesTable({ rows, fmt, footer }: ComisionesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1320px] text-xs">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className="th-odoo text-left">Folio</th>
            <th className="th-odoo text-left">Cliente</th>
            <th className="th-odoo text-left">Vendedor</th>
            <th className="th-odoo text-left">Fecha</th>
            <th className="th-odoo text-left">Ruta/Zona</th>
            <th className="th-odoo text-center">Cuenta</th>
            <th className="th-odoo text-left">Facturación</th>
            <th className="th-odoo text-center">Comisión</th>
            <th className="th-odoo text-right">Comisión $</th>
            <th className="th-odoo text-right">Total</th>
            <th className="th-odoo text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 font-mono">
                <Link to={`/ventas/${row.id}`} className="text-primary hover:underline">{row.folio}</Link>
              </td>
              <td className="max-w-[260px] truncate px-3 py-2 font-medium" title={row.cliente}>{row.cliente}</td>
              <td className="max-w-[190px] truncate px-3 py-2" title={row.vendedor}>{row.vendedor}</td>
              <td className="whitespace-nowrap px-3 py-2">{fmtDate(row.fecha)}</td>
              <td className="max-w-[170px] truncate px-3 py-2" title={row.ruta}>{row.ruta}</td>
              <td className="px-3 py-2 text-center"><Badge className={accountTone[row.estadoCuenta]}>{ESTADO_CUENTA_LABEL[row.estadoCuenta]}</Badge></td>
              <td className="px-3 py-2">
                {row.requiereFactura ? (
                  <div><Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Fiscal</Badge><div className={cn('mt-0.5 font-mono text-[10px]', !row.rfc && 'font-semibold text-destructive')}>{row.rfc || 'RFC pendiente'}</div></div>
                ) : <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">No fiscal</Badge>}
              </td>
              <td className="px-3 py-2 text-center"><Badge className={commissionTone[row.estadoComision]}>{ESTADO_COMISION_LABEL[row.estadoComision]}</Badge></td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-odoo-teal">{fmt(row.comision)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(row.total)}</td>
              <td className={cn('px-3 py-2 text-right font-mono font-semibold', row.saldo > 0 && 'text-destructive')}>{fmt(row.saldo)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">No hay ventas que coincidan con los filtros seleccionados.</td></tr>}
        </tbody>
        {footer && (
          <tfoot className="border-t-2 border-border bg-muted/40 font-semibold">
            <tr>
              <td colSpan={8} className="px-3 py-2 text-right">Totales ({footer.count})</td>
              <td className="px-3 py-2 text-right font-mono text-odoo-teal">{fmt(footer.totals.comision)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(footer.totals.vendido)}</td>
              <td className="px-3 py-2 text-right font-mono text-destructive">{fmt(footer.totals.saldo)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function GroupSummary({ totals, fmt }: { totals: TotalesComisiones; fmt: (value: number) => string }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px]">
      <span>Vendido <b>{fmt(totals.vendido)}</b></span>
      <span className="text-odoo-teal">Comisión <b>{fmt(totals.comision)}</b></span>
      <span className={cn(totals.saldo > 0 && 'text-destructive')}>Saldo <b>{fmt(totals.saldo)}</b></span>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium', className)}>{children}</span>;
}

function Summary({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'teal' | 'amber' | 'green' | 'red' }) {
  const tones = {
    default: 'text-foreground',
    teal: 'text-odoo-teal',
    amber: 'text-amber-600',
    green: 'text-emerald-600',
    red: 'text-destructive',
  };
  return <div className="rounded-lg border border-border bg-card px-3 py-2"><p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={cn('mt-0.5 truncate font-mono text-base font-bold', tones[tone])}>{value}</p></div>;
}
