import { useState } from 'react';
import { BarChart3, ShoppingCart, Package, Users, TrendingUp, Truck, BoxIcon, RotateCcw, DollarSign, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReportesData } from '@/hooks/useReportesData';
import { ReporteResumen } from '@/components/reportes/ReporteResumen';
import { ReporteVentasProducto } from '@/components/reportes/ReporteVentasProducto';
import { ReporteVentasCliente } from '@/components/reportes/ReporteVentasCliente';
import { ReporteVendedores } from '@/components/reportes/ReporteVendedores';
import { ReporteEntregas } from '@/components/reportes/ReporteEntregas';
import { ReporteCargas } from '@/components/reportes/ReporteCargas';
import { ReporteDevoluciones } from '@/components/reportes/ReporteDevoluciones';
import { ReporteUtilidad } from '@/components/reportes/ReporteUtilidad';
import { ReportePromociones } from '@/components/reportes/ReportePromociones';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF, type ExportColumn, type ExportOptions } from '@/lib/exportUtils';

type ReportTab = 'resumen' | 'ventas_producto' | 'ventas_cliente' | 'vendedores' | 'entregas' | 'cargas' | 'devoluciones' | 'utilidad' | 'promociones';

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
    default: return null;
  }
}

export default function ReportesPage() {
  const now = new Date();
  const mesActual = now.toISOString().slice(0, 7);
  const [desde, setDesde] = useState(mesActual + '-01');
  const [hasta, setHasta] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
  const { data, isLoading } = useReportesData(desde, hasta);
  const [tab, setTab] = useState<ReportTab>('resumen');

  const tabs: { key: ReportTab; label: string; icon: React.ElementType }[] = [
    { key: 'resumen', label: 'Resumen', icon: BarChart3 },
    { key: 'ventas_producto', label: 'Ventas x Producto', icon: Package },
    { key: 'ventas_cliente', label: 'Ventas x Cliente', icon: Users },
    { key: 'vendedores', label: 'Vendedores', icon: TrendingUp },
    { key: 'entregas', label: 'Entregas', icon: Truck },
    { key: 'cargas', label: 'Cargas', icon: BoxIcon },
    { key: 'devoluciones', label: 'Devoluciones', icon: RotateCcw },
    { key: 'utilidad', label: 'Utilidad', icon: DollarSign },
  ];

  const handleExport = (format: 'excel' | 'pdf') => {
    if (!data) return;
    const config = getExportConfig(tab, data, desde, hasta);
    if (!config) return;
    if (format === 'excel') exportToExcel(config);
    else exportToPDF(config);
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Reportes
        </h1>
        <div className="flex items-center gap-2">
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="input-odoo text-[13px] w-36" />
          <span className="text-muted-foreground text-[13px]">a</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="input-odoo text-[13px] w-36" />
          <ExportButton
            onExcel={() => handleExport('excel')}
            onPDF={() => handleExport('pdf')}
          />
          <button onClick={() => window.print()} className="btn-odoo-secondary flex items-center gap-1 print:hidden">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
        </div>
      </div>

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

      {data && (
        <>
          {tab === 'resumen' && <ReporteResumen data={data} />}
          {tab === 'ventas_producto' && <ReporteVentasProducto data={data} />}
          {tab === 'ventas_cliente' && <ReporteVentasCliente data={data} />}
          {tab === 'vendedores' && <ReporteVendedores data={data} />}
          {tab === 'entregas' && <ReporteEntregas data={data} />}
          {tab === 'cargas' && <ReporteCargas data={data} />}
          {tab === 'devoluciones' && <ReporteDevoluciones data={data} />}
          {tab === 'utilidad' && <ReporteUtilidad data={data} />}
        </>
      )}
    </div>
  );
}
