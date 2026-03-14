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

type ReportTab = 'resumen' | 'ventas_producto' | 'ventas_cliente' | 'vendedores' | 'entregas' | 'cargas' | 'devoluciones' | 'utilidad';

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

  const handlePrint = () => {
    window.print();
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
          <button onClick={handlePrint} className="btn-odoo-secondary flex items-center gap-1 print:hidden">
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
