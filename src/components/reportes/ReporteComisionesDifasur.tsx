import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileText, RefreshCw, Search } from 'lucide-react';
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
import { exportToExcel, exportToPDF, type ExportOptions } from '@/lib/exportUtils';
import { cn, fmtDate } from '@/lib/utils';
import {
  buildReporteComisionVenta,
  DIFASUR_LICENSE,
  ESTADO_COMISION_LABEL,
  ESTADO_CUENTA_LABEL,
  type ComisionVentaSource,
  type EstadoCuentaComision,
  type EstadoPagoComision,
} from '@/lib/reporteComisionesDifasur';

type FiscalFilter = 'todos' | 'fiscal' | 'no_fiscal' | 'rfc_pendiente';
type AccountFilter = 'todos' | EstadoCuentaComision;
type CommissionFilter = 'todos' | EstadoPagoComision;

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

export function ReporteComisionesDifasur({ desde, hasta, vendedorIds }: Props) {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const enabled = String(empresa?.licencia ?? '').trim() === DIFASUR_LICENSE;
  const [search, setSearch] = useState('');
  const [ruta, setRuta] = useState('todos');
  const [estadoCuenta, setEstadoCuenta] = useState<AccountFilter>('todos');
  const [estadoComision, setEstadoComision] = useState<CommissionFilter>('todos');
  const [fiscal, setFiscal] = useState<FiscalFilter>('todos');

  const query = useQuery({
    queryKey: ['reporte-comisiones-difasur', empresa?.id, desde, hasta, vendedorIds],
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
          .order('folio', { ascending: false })
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

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return rows.filter(row => {
      if (term && ![row.folio, row.cliente, row.vendedor, row.ruta, row.rfc].some(value => value.toLocaleLowerCase('es').includes(term))) return false;
      if (ruta !== 'todos' && row.ruta !== ruta) return false;
      if (estadoCuenta !== 'todos' && row.estadoCuenta !== estadoCuenta) return false;
      if (estadoComision !== 'todos' && row.estadoComision !== estadoComision) return false;
      if (fiscal === 'fiscal' && !row.requiereFactura) return false;
      if (fiscal === 'no_fiscal' && row.requiereFactura) return false;
      if (fiscal === 'rfc_pendiente' && (!row.requiereFactura || row.rfc)) return false;
      return true;
    });
  }, [rows, search, ruta, estadoCuenta, estadoComision, fiscal]);

  const totals = useMemo(() => filtered.reduce((acc, row) => {
    acc.ventas += 1;
    acc.vendido += row.total;
    acc.comision += row.comision;
    acc.comisionPendiente += row.comisionPendiente + row.comisionEnRecibo;
    acc.comisionPagada += row.comisionPagada;
    acc.saldo += row.saldo;
    return acc;
  }, { ventas: 0, vendido: 0, comision: 0, comisionPendiente: 0, comisionPagada: 0, saldo: 0 }), [filtered]);

  const pagination = useTablePagination(filtered, 'reporte-comisiones-difasur');
  const { resetPage } = pagination;
  useEffect(() => resetPage(), [resetPage, search, ruta, estadoCuenta, estadoComision, fiscal, desde, hasta, vendedorIds]);

  const exportOptions = (): ExportOptions => ({
    fileName: `Reporte_Comisiones_${desde}_${hasta}`,
    title: 'Reporte de Comisiones',
    subtitle: 'Comisiones consolidadas por venta',
    empresa: empresa?.nombre,
    empresaInfo: {
      nombre: empresa?.nombre ?? 'DIFASUR',
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
    data: filtered.map(row => ({
      ...row,
      estadoCuentaLabel: ESTADO_CUENTA_LABEL[row.estadoCuenta],
      estadoComisionLabel: ESTADO_COMISION_LABEL[row.estadoComision],
      tipoFiscal: row.requiereFactura ? 'Fiscal' : 'No fiscal',
      rfc: row.requiereFactura && !row.rfc ? 'RFC pendiente' : row.rfc,
    })),
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
      console.error('[ReporteComisionesDifasur] export', error);
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

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar folio, cliente, vendedor o RFC…" className="input-odoo h-8 w-full pl-8 text-xs" />
        </div>
        <select value={ruta} onChange={event => setRuta(event.target.value)} className="input-odoo h-8 min-w-36 text-xs">
          <option value="todos">Todas las rutas/zonas</option>
          {rutas.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={estadoCuenta} onChange={event => setEstadoCuenta(event.target.value as AccountFilter)} className="input-odoo h-8 min-w-32 text-xs">
          <option value="todos">Todas las cuentas</option>
          <option value="adeudo">Adeudo</option>
          <option value="liquidada">Liquidada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select value={estadoComision} onChange={event => setEstadoComision(event.target.value as CommissionFilter)} className="input-odoo h-8 min-w-36 text-xs">
          <option value="todos">Todas las comisiones</option>
          <option value="sin_comision">Sin comisión</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_recibo">En recibo</option>
          <option value="parcial">Pago parcial</option>
          <option value="pagada">Pagada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select value={fiscal} onChange={event => setFiscal(event.target.value as FiscalFilter)} className="input-odoo h-8 min-w-32 text-xs">
          <option value="todos">Fiscal y no fiscal</option>
          <option value="fiscal">Requiere factura</option>
          <option value="no_fiscal">No requiere factura</option>
          <option value="rfc_pendiente">RFC pendiente</option>
        </select>
        <ExportButton compact onExcel={() => void exportReport('excel')} onPDF={() => void exportReport('pdf')} />
        <button onClick={() => window.print()} className="btn-odoo-secondary h-7 gap-1 text-[11px]">
          <FileText className="h-3 w-3" /> Imprimir
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
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
            {pagination.paginatedItems.map(row => (
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
            {!pagination.paginatedItems.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">No hay ventas que coincidan con los filtros seleccionados.</td></tr>}
          </tbody>
          {!!filtered.length && (
            <tfoot className="border-t-2 border-border bg-muted/40 font-semibold">
              <tr>
                <td colSpan={8} className="px-3 py-2 text-right">Totales ({filtered.length})</td>
                <td className="px-3 py-2 text-right font-mono text-odoo-teal">{fmt(totals.comision)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(totals.vendido)}</td>
                <td className="px-3 py-2 text-right font-mono text-destructive">{fmt(totals.saldo)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <TablePagination
          from={pagination.from} to={pagination.to} total={pagination.total}
          page={pagination.page} totalPages={pagination.totalPages} pageSize={pagination.pageSize}
          onPageSizeChange={pagination.setPageSize} onFirst={pagination.goFirst}
          onPrev={pagination.goPrev} onNext={pagination.goNext} onLast={pagination.goLast}
        />
      </div>
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
