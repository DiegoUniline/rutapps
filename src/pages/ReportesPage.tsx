import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { BarChart3, ShoppingCart, Package, Users, TrendingUp, Truck, BoxIcon, RotateCcw, DollarSign, Printer, X, ChevronDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReportesData } from '@/hooks/useReportesData';
import { useVendedores } from '@/hooks/useClientes';
import { ReporteResumen } from '@/components/reportes/ReporteResumen';
import { ReporteVentasProducto } from '@/components/reportes/ReporteVentasProducto';
import { ReporteVentasCliente } from '@/components/reportes/ReporteVentasCliente';
import { ReporteVendedores } from '@/components/reportes/ReporteVendedores';
import { ReporteEntregas } from '@/components/reportes/ReporteEntregas';
import { ReporteCargas } from '@/components/reportes/ReporteCargas';
import { ReporteDevoluciones } from '@/components/reportes/ReporteDevoluciones';
import { ReporteUtilidad } from '@/components/reportes/ReporteUtilidad';
import { ReportePromociones } from '@/components/reportes/ReportePromociones';
import { ReporteProductoCliente } from '@/components/reportes/ReporteProductoCliente';
import { ReportLayout } from '@/components/reportes/ReportLayout';
import { ResumenGeneralVentas } from '@/components/reportes/ResumenGeneralVentas';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF, type ExportColumn, type ExportOptions } from '@/lib/exportUtils';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

type ReportTab = 'resumen' | 'ventas_producto' | 'ventas_cliente' | 'producto_cliente' | 'vendedores' | 'entregas' | 'cargas' | 'devoluciones' | 'utilidad' | 'promociones' | 'no_visitados';

function getExportConfig(tab: ReportTab, data: any, desde: string, hasta: string): ExportOptions | null {
  const dateRange = { from: desde, to: hasta };

  switch (tab) {
    case 'resumen': {
      const columns: ExportColumn[] = [
        { key: 'concepto', header: 'Concepto', width: 20 },
        { key: 'valor', header: 'Valor', format: 'currency', width: 16 },
      ];
      return {
        fileName: 'Reporte_Resumen', title: 'Resumen General', columns, dateRange,
        data: [
          { concepto: 'Ventas', valor: data.totalVentas },
          { concepto: 'Cobros', valor: data.totalCobros },
          { concepto: 'Gastos', valor: data.totalGastos },
          { concepto: 'Utilidad bruta', valor: data.utilidad },
          { concepto: 'Por cobrar', valor: data.totalPendiente },
          { concepto: 'Flujo neto', valor: data.totalCobros - data.totalGastos },
        ],
      };
    }
    case 'ventas_producto': {
      const items = data.ventasPorProducto ?? [];
      return {
        fileName: 'Ventas_por_Producto', title: 'Ventas por Producto', dateRange,
        columns: [
          { key: 'codigo', header: 'Código', width: 12 },
          { key: 'nombre', header: 'Producto', width: 30 },
          { key: 'cantidad', header: 'Unidades', format: 'number', width: 10 },
          { key: 'total', header: 'Total', format: 'currency', width: 14 },
          { key: 'utilidad', header: 'Utilidad', format: 'currency', width: 14 },
        ],
        data: items,
        totals: {
          cantidad: items.reduce((s: number, p: any) => s + p.cantidad, 0),
          total: items.reduce((s: number, p: any) => s + p.total, 0),
          utilidad: items.reduce((s: number, p: any) => s + p.utilidad, 0),
        },
      };
    }
    case 'ventas_cliente': {
      const items = data.ventasPorCliente ?? [];
      return {
        fileName: 'Ventas_por_Cliente', title: 'Ventas por Cliente', dateRange,
        columns: [
          { key: 'nombre', header: 'Cliente', width: 30 },
          { key: 'ventas', header: 'Ventas', format: 'number', width: 10 },
          { key: 'total', header: 'Total', format: 'currency', width: 14 },
          { key: 'pendiente', header: 'Pendiente', format: 'currency', width: 14 },
        ],
        data: items,
        totals: {
          ventas: items.reduce((s: number, c: any) => s + c.ventas, 0),
          total: items.reduce((s: number, c: any) => s + c.total, 0),
          pendiente: items.reduce((s: number, c: any) => s + c.pendiente, 0),
        },
      };
    }
    case 'vendedores': {
      const items = data.topVendedores ?? [];
      return {
        fileName: 'Reporte_Vendedores', title: 'Reporte de Vendedores', dateRange,
        columns: [
          { key: 'nombre', header: 'Vendedor', width: 25 },
          { key: 'ventas', header: 'Ventas', format: 'number', width: 10 },
          { key: 'total', header: 'Total', format: 'currency', width: 14 },
        ],
        data: items,
        totals: {
          ventas: items.reduce((s: number, v: any) => s + v.ventas, 0),
          total: items.reduce((s: number, v: any) => s + v.total, 0),
        },
      };
    }
    case 'entregas': {
      const items = data.entregas ?? [];
      return {
        fileName: 'Reporte_Entregas', title: 'Reporte de Entregas', dateRange,
        columns: [
          { key: 'folio', header: 'Folio', width: 12 },
          { key: 'fecha', header: 'Fecha', format: 'date', width: 14 },
          { key: 'cliente', header: 'Cliente', width: 25 },
          { key: 'total', header: 'Total', format: 'currency', width: 14 },
          { key: 'status', header: 'Estado', width: 12 },
        ],
        data: items,
      };
    }
    case 'cargas': {
      const items = data.cargas ?? [];
      return {
        fileName: 'Reporte_Cargas', title: 'Reporte de Cargas', dateRange,
        columns: [
          { key: 'fecha', header: 'Fecha', format: 'date', width: 14 },
          { key: 'vendedor', header: 'Vendedor', width: 25 },
          { key: 'productos', header: 'Productos', format: 'number', width: 10 },
          { key: 'status', header: 'Estado', width: 12 },
        ],
        data: items,
      };
    }
    case 'devoluciones': {
      const items = data.devoluciones ?? [];
      return {
        fileName: 'Reporte_Devoluciones', title: 'Reporte de Devoluciones', dateRange,
        columns: [
          { key: 'fecha', header: 'Fecha', format: 'date', width: 14 },
          { key: 'cliente', header: 'Cliente', width: 25 },
          { key: 'producto', header: 'Producto', width: 25 },
          { key: 'cantidad', header: 'Cantidad', format: 'number', width: 10 },
          { key: 'motivo', header: 'Motivo', width: 14 },
        ],
        data: items,
      };
    }
    case 'utilidad': {
      const items = data.utilidadPorProducto ?? data.ventasPorProducto ?? [];
      return {
        fileName: 'Reporte_Utilidad', title: 'Reporte de Utilidad', dateRange,
        columns: [
          { key: 'codigo', header: 'Código', width: 12 },
          { key: 'nombre', header: 'Producto', width: 30 },
          { key: 'costo_total', header: 'Costo', format: 'currency', width: 14 },
          { key: 'total', header: 'Venta', format: 'currency', width: 14 },
          { key: 'utilidad', header: 'Utilidad', format: 'currency', width: 14 },
          { key: 'margen', header: 'Margen %', format: 'percent', width: 10 },
        ],
        data: items.map((p: any) => ({
          ...p,
          costo_total: p.costo_total ?? 0,
          margen: p.total > 0 ? (p.utilidad / p.total) * 100 : 0,
        })),
        totals: {
          total: items.reduce((s: number, p: any) => s + p.total, 0),
          utilidad: items.reduce((s: number, p: any) => s + p.utilidad, 0),
        },
      };
    }
    case 'producto_cliente': {
      const ventaLineas: any[] = data.ventaLineas ?? [];
      // Flatten: one row per client+product
      const map: Record<string, any> = {};
      for (const l of ventaLineas) {
        const cid = l.ventas?.cliente_id ?? 'sin-cliente';
        const pid = l.producto_id ?? '';
        const key = `${cid}__${pid}`;
        if (!map[key]) {
          map[key] = {
            cliente: (l.ventas?.clientes as any)?.nombre ?? 'Sin cliente',
            vendedor: (l.ventas?.vendedores as any)?.nombre ?? '—',
            codigo: (l.productos as any)?.codigo ?? '',
            producto: (l.productos as any)?.nombre ?? '',
            cantidad: 0,
            total: 0,
          };
        }
        map[key].cantidad += l.cantidad ?? 0;
        map[key].total += l.total ?? 0;
      }
      const items = Object.values(map).sort((a: any, b: any) => a.cliente.localeCompare(b.cliente) || b.total - a.total);
      return {
        fileName: 'Producto_por_Cliente', title: 'Producto por Cliente', dateRange,
        columns: [
          { key: 'cliente', header: 'Cliente', width: 25 },
          { key: 'vendedor', header: 'Vendedor', width: 20 },
          { key: 'codigo', header: 'Código', width: 12 },
          { key: 'producto', header: 'Producto', width: 28 },
          { key: 'cantidad', header: 'Uds', format: 'number' as const, width: 10 },
          { key: 'total', header: 'Total', format: 'currency' as const, width: 14 },
        ],
        data: items,
        totals: {
          cantidad: items.reduce((s: number, i: any) => s + i.cantidad, 0),
          total: items.reduce((s: number, i: any) => s + i.total, 0),
        },
      };
    }
    default: return null;
  }
}

export default function ReportesPage() {
  const { empresa } = useAuth();
  const now = new Date();
  const mesActual = now.toISOString().slice(0, 7);
  const [desde, setDesde] = useState(mesActual + '-01');
  const [hasta, setHasta] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const { data: vendedoresList } = useVendedores();
  const { data, isLoading } = useReportesData(desde, hasta, selectedVendedores.length > 0 ? selectedVendedores : undefined, selectedStatuses.length > 0 ? selectedStatuses : undefined);
  const [tab, setTab] = useState<ReportTab>('resumen');

  const statusOptions = [
    { value: 'borrador', label: 'Borrador' },
    { value: 'confirmado', label: 'Confirmado' },
    { value: 'entregado', label: 'Entregado' },
    { value: 'facturado', label: 'Facturado' },
    { value: 'cancelado', label: 'Cancelado' },
  ];

  const tabs: { key: ReportTab; label: string; icon: React.ElementType }[] = [
    { key: 'resumen', label: 'Resumen', icon: BarChart3 },
    { key: 'ventas_producto', label: 'Ventas x Producto', icon: Package },
    { key: 'ventas_cliente', label: 'Ventas x Cliente', icon: Users },
    { key: 'producto_cliente', label: 'Producto x Cliente', icon: ShoppingCart },
    { key: 'vendedores', label: 'Vendedores', icon: TrendingUp },
    { key: 'entregas', label: 'Entregas', icon: Truck },
    { key: 'cargas', label: 'Cargas', icon: BoxIcon },
    { key: 'devoluciones', label: 'Devoluciones', icon: RotateCcw },
    { key: 'utilidad', label: 'Utilidad', icon: DollarSign },
    { key: 'promociones', label: 'Promociones', icon: TrendingUp },
  ];

  const toggleVendedor = (id: string) => {
    setSelectedVendedores(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const toggleStatus = (val: string) => {
    setSelectedStatuses(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const handleExport = (format: 'excel' | 'pdf') => {
    if (!data) return;
    const config = getExportConfig(tab, data, desde, hasta);
    if (!config) return;

    // Attach resumen general to all exports
    config.resumenGeneral = {
      totalVentas: data.totalVentas ?? 0,
      totalContado: data.totalContado ?? 0,
      totalCredito: data.totalCredito ?? 0,
      vendedores: (data.topVendedores ?? []).map((v: any) => ({
        nombre: v.nombre,
        total: v.total,
        pct: data.totalVentas > 0 ? (v.total / data.totalVentas) * 100 : 0,
      })),
      metodosPago: data.metodosPago ?? [],
    };
    config.empresa = empresa?.nombre;

    if (format === 'excel') exportToExcel(config);
    else exportToPDF(config);
  };

  const vendedorNames = selectedVendedores
    .map(id => vendedoresList?.find(v => v.id === id)?.nombre)
    .filter(Boolean);

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Reportes
          <HelpButton title={HELP.reportes.title} sections={HELP.reportes.sections} />
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="input-odoo text-[13px] w-36" />
          <span className="text-muted-foreground text-[13px]">a</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="input-odoo text-[13px] w-36" />

          {/* Vendedor multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "input-odoo text-[13px] flex items-center gap-1.5 min-w-[140px] max-w-[220px] truncate",
                selectedVendedores.length > 0 && "border-primary/60 bg-primary/5"
              )}>
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {selectedVendedores.length === 0
                    ? 'Todos los usuarios'
                    : selectedVendedores.length === 1
                      ? vendedorNames[0]
                      : `${selectedVendedores.length} usuarios`}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 ml-auto text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="end">
              <div className="max-h-60 overflow-y-auto p-1">
                {vendedoresList?.map(v => (
                  <label
                    key={v.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent cursor-pointer text-[13px]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVendedores.includes(v.id)}
                      onChange={() => toggleVendedor(v.id)}
                      className="rounded border-input"
                    />
                    <span className="truncate">{v.nombre}</span>
                  </label>
                ))}
                {(!vendedoresList || vendedoresList.length === 0) && (
                  <p className="text-[12px] text-muted-foreground p-3 text-center">Sin usuarios</p>
                )}
              </div>
              {selectedVendedores.length > 0 && (
                <div className="border-t border-border p-1.5">
                  <button
                    onClick={() => setSelectedVendedores([])}
                    className="w-full text-[12px] text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1"
                  >
                    <X className="h-3 w-3" /> Limpiar filtro
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Status filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "input-odoo text-[13px] flex items-center gap-1.5 min-w-[120px] max-w-[200px] truncate",
                selectedStatuses.length > 0 && "border-primary/60 bg-primary/5"
              )}>
                <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {selectedStatuses.length === 0
                    ? 'Todos los estados'
                    : `${selectedStatuses.length} estado${selectedStatuses.length > 1 ? 's' : ''}`}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 ml-auto text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0" align="end">
              <div className="p-1">
                {statusOptions.map(o => (
                  <label
                    key={o.value}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent cursor-pointer text-[13px]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(o.value)}
                      onChange={() => toggleStatus(o.value)}
                      className="rounded border-input"
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
              {selectedStatuses.length > 0 && (
                <div className="border-t border-border p-1.5">
                  <button
                    onClick={() => setSelectedStatuses([])}
                    className="w-full text-[12px] text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1"
                  >
                    <X className="h-3 w-3" /> Limpiar
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <ExportButton
            onExcel={() => handleExport('excel')}
            onPDF={() => handleExport('pdf')}
          />
          <button onClick={() => window.print()} className="btn-odoo-secondary flex items-center gap-1 print:hidden">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {(selectedVendedores.length > 0 || selectedStatuses.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap print:hidden">
          <span className="text-[11px] text-muted-foreground">Filtrando por:</span>
          {vendedorNames.map((name, i) => (
            <span key={selectedVendedores[i]} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
              {name}
              <button onClick={() => toggleVendedor(selectedVendedores[i])} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {selectedStatuses.map(st => (
            <span key={st} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[11px] font-medium">
              {statusOptions.find(o => o.value === st)?.label ?? st}
              <button onClick={() => toggleStatus(st)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border overflow-x-auto print:hidden">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap",
            tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="py-12 text-center text-muted-foreground">Cargando reportes...</div>}

      {data && (() => {
        const tabTitles: Record<ReportTab, string> = {
          resumen: 'Resumen General',
          ventas_producto: 'Ventas por Producto',
          ventas_cliente: 'Ventas por Cliente',
          producto_cliente: 'Producto por Cliente',
          vendedores: 'Reporte de Vendedores',
          entregas: 'Reporte de Entregas',
          cargas: 'Reporte de Cargas',
          devoluciones: 'Reporte de Devoluciones',
          utilidad: 'Reporte de Utilidad',
          promociones: 'Reporte de Promociones',
        };

        const activeFilters: { label: string; value: string }[] = [];
        if (vendedorNames.length > 0) activeFilters.push({ label: 'Vendedor', value: vendedorNames.join(', ') });
        if (selectedStatuses.length > 0) activeFilters.push({ label: 'Estado', value: selectedStatuses.map(st => statusOptions.find(o => o.value === st)?.label ?? st).join(', ') });

        const resumenFooter = (
          <ResumenGeneralVentas
            totalVentas={data.totalVentas}
            totalContado={data.totalContado ?? 0}
            totalCredito={data.totalCredito ?? 0}
            vendedores={(data.topVendedores ?? []).map((v: any) => ({
              nombre: v.nombre,
              total: v.total,
              pct: data.totalVentas > 0 ? (v.total / data.totalVentas) * 100 : 0,
            }))}
            metodosPago={data.metodosPago ?? []}
          />
        );

        return (
          <ReportLayout
            title={tabTitles[tab]}
            desde={desde}
            hasta={hasta}
            filters={activeFilters.length > 0 ? activeFilters : undefined}
            footer={resumenFooter}
          >
            {tab === 'resumen' && <ReporteResumen data={data} />}
            {tab === 'ventas_producto' && <ReporteVentasProducto data={data} />}
            {tab === 'ventas_cliente' && <ReporteVentasCliente data={data} />}
            {tab === 'producto_cliente' && <ReporteProductoCliente data={data} />}
            {tab === 'vendedores' && <ReporteVendedores data={data} />}
            {tab === 'entregas' && <ReporteEntregas data={data} />}
            {tab === 'cargas' && <ReporteCargas data={data} />}
            {tab === 'devoluciones' && <ReporteDevoluciones data={data} />}
            {tab === 'utilidad' && <ReporteUtilidad data={data} />}
            {tab === 'promociones' && <ReportePromociones desde={desde} hasta={hasta} />}
          </ReportLayout>
        );
      })()}
    </div>
  );
}
