import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate } from '@/lib/utils';

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-center">
      <div className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-lg font-bold text-foreground">{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function ReporteResumen({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const maxDaily = Math.max(...data.dailyVentas.map((d: any) => d.total), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KPI label="Ventas" value={fmt(data.totalVentas)} sub={`${data.numVentas} ventas`} />
        <KPI label="Costo mercancía" value={fmt(data.costoTotal)} />
        <KPI label="Utilidad bruta" value={fmt(data.utilidadBruta)} sub={data.totalVentas > 0 ? `${Math.round((data.utilidadBruta / data.totalVentas) * 100)}% margen` : ''} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Gastos" value={fmt(data.totalGastos)} />
        <KPI label="Utilidad neta" value={fmt(data.utilidadNeta)} sub={data.totalVentas > 0 ? `${Math.round((data.utilidadNeta / data.totalVentas) * 100)}% margen` : ''} />
        <KPI label="Cobros" value={fmt(data.totalCobros)} sub={`${data.numCobros} cobros`} />
        <KPI label="Por cobrar" value={fmt(data.totalPendiente)} />
      </div>
    </div>
  );
}
