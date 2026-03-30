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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Ventas" value={fmt(data.totalVentas)} sub={`${data.numVentas} ventas`} />
        <KPI label="Cobros" value={fmt(data.totalCobros)} sub={`${data.numCobros} cobros`} />
        <KPI label="Gastos" value={fmt(data.totalGastos)} />
        <KPI label="Utilidad bruta" value={fmt(data.utilidad)} sub={data.totalVentas > 0 ? `${Math.round((data.utilidad / data.totalVentas) * 100)}% margen` : ''} />
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase mb-4 border-b border-border pb-1">Ventas diarias</h3>
        <div className="flex items-end gap-1 h-32">
          {data.dailyVentas.map((d: any) => (
            <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1" title={`${fmtDate(d.fecha)}: ${fmt(d.total)}`}>
              <div className="w-full bg-foreground/20 rounded-t-sm min-h-[2px] transition-all hover:bg-foreground/40" style={{ height: `${(d.total / maxDaily) * 100}%` }} />
              <span className="text-[8px] text-muted-foreground rotate-45 origin-left">{fmtDate(d.fecha).slice(0, 5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KPI label="Por cobrar" value={fmt(data.totalPendiente)} />
        <KPI label="Flujo neto" value={fmt(data.totalCobros - data.totalGastos)} />
      </div>
    </div>
  );
}
