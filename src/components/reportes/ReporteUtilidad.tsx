import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

export function ReporteUtilidad({ data }: { data: any }) {
  const { symbol: s, fmt } = useCurrency();
  const { totalVentas, costoTotal, totalGastos, utilidadBruta, utilidadNeta, gastosDesglose } = data;
  const margenBruto = totalVentas > 0 ? Math.round((utilidadBruta / totalVentas) * 100) : 0;
  const margenNeto = totalVentas > 0 ? Math.round((utilidadNeta / totalVentas) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Estado de resultados simplificado */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Estado de resultados</h3>
        <div className="space-y-1 text-[13px]">
          <Row label="Ventas totales" value={totalVentas} bold />
          <Row label="(-) Costo de ventas" value={-costoTotal} negative />
          <div className="border-t border-border pt-1 mt-1">
            <Row label="= Utilidad bruta" value={utilidadBruta} bold color={utilidadBruta >= 0 ? 'text-success' : 'text-destructive'} sub={`${margenBruto}% margen`} />
          </div>
          <div className="pt-2">
            <Row label="(-) Gastos operativos" value={-totalGastos} negative />
          </div>
          <div className="border-t-2 border-border pt-1 mt-1">
            <Row label="= Utilidad neta" value={utilidadNeta} bold color={utilidadNeta >= 0 ? 'text-success' : 'text-destructive'} sub={`${margenNeto}% margen neto`} />
          </div>
        </div>
      </div>

      {/* Desglose de gastos */}
      {gastosDesglose.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Desglose de gastos</h3>
          <div className="space-y-2">
            {gastosDesglose.map((g: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[13px]">
                <span className="text-foreground">{g.concepto}</span>
                <span className="font-bold text-destructive">{s} {fmt(g.monto)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 flex items-center justify-between text-[13px] font-bold">
              <span>Total gastos</span>
              <span className="text-destructive">{s} {fmt(totalGastos)}</span>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ventas" value={`${s} ${fmt(totalVentas)}`} color="text-primary" />
        <KpiCard label="Costo mercancía" value={`${s} ${fmt(costoTotal)}`} color="text-muted-foreground" />
        <KpiCard label="Utilidad bruta" value={`${s} ${fmt(utilidadBruta)}`} color={utilidadBruta >= 0 ? 'text-success' : 'text-destructive'} />
        <KpiCard label="Utilidad neta" value={`${s} ${fmt(utilidadNeta)}`} color={utilidadNeta >= 0 ? 'text-success' : 'text-destructive'} />
      </div>
    </div>
  );
}

function Row({ label, value, bold, negative, color, sub }: { label: string; value: number; bold?: boolean; negative?: boolean; color?: string; sub?: string }) {
  const fmt2 = (n: number) => `${n < 0 ? '-' : ''} $ ${Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-foreground", bold && "font-semibold")}>{label}</span>
      <div className="text-right">
        <span className={cn(bold ? "font-bold" : "", negative ? "text-destructive" : "", color ?? '')}>{fmt2(value)}</span>
        {sub && <span className="text-[11px] text-muted-foreground ml-2">({sub})</span>}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <p className="text-[11px] text-muted-foreground uppercase">{label}</p>
      <p className={cn("text-lg font-bold", color)}>{value}</p>
    </div>
  );
}
