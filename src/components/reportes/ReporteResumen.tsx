import { ShoppingCart, Banknote, Receipt, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

function KPI({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-[11px] text-muted-foreground uppercase">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ReporteResumen({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const maxDaily = Math.max(...data.dailyVentas.map((d: any) => d.total), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={ShoppingCart} label="Ventas" value={fmt(data.totalVentas)} sub={`${data.numVentas} ventas`} color="text-primary" />
        <KPI icon={Banknote} label="Cobros" value={fmt(data.totalCobros)} sub={`${data.numCobros} cobros`} color="text-success" />
        <KPI icon={Receipt} label="Gastos" value={fmt(data.totalGastos)} sub="" color="text-destructive" />
        <KPI icon={DollarSign} label="Utilidad bruta" value={fmt(data.utilidad)} sub={data.totalVentas > 0 ? `${Math.round((data.utilidad / data.totalVentas) * 100)}% margen` : ''} color={data.utilidad >= 0 ? "text-success" : "text-destructive"} />
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Ventas diarias</h3>
        <div className="flex items-end gap-1 h-32">
          {data.dailyVentas.map((d: any) => (
            <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1" title={`${d.fecha}: ${fmt(d.total)}`}>
              <div className="w-full bg-primary/80 rounded-t-sm min-h-[2px] transition-all hover:bg-primary" style={{ height: `${(d.total / maxDaily) * 100}%` }} />
              <span className="text-[8px] text-muted-foreground rotate-45 origin-left">{d.fecha.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Por cobrar</p>
          <p className="text-xl font-bold text-warning">{fmt(data.totalPendiente)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Flujo neto</p>
          <p className={cn("text-xl font-bold", (data.totalCobros - data.totalGastos) >= 0 ? "text-success" : "text-destructive")}>
            {fmt(data.totalCobros - data.totalGastos)}
          </p>
        </div>
      </div>
    </div>
  );
}
