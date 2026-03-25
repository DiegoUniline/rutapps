import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

export function ReporteVentasCliente({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const items = data.ventasPorCliente ?? [];
  const maxVal = items[0]?.total ?? 1;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Clientes activos</p>
          <p className="text-lg font-bold text-foreground">{items.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Total vendido</p>
          <p className="text-lg font-bold text-primary">{fmt(items.reduce((s: number, c: any) => s + c.total, 0))}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Pendiente cobro</p>
          <p className="text-lg font-bold text-warning">{fmt(items.reduce((s: number, c: any) => s + c.pendiente, 0))}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 px-3 text-[11px] text-muted-foreground w-8">#</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Cliente</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Ventas</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Total</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Pendiente</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground w-28">%</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((c: any, i: number) => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="py-1.5 px-3 font-bold text-muted-foreground">{i + 1}</td>
                <td className="py-1.5 px-3 font-medium">{c.nombre}</td>
                <td className="py-1.5 px-3 text-right">{c.ventas}</td>
                <td className="py-1.5 px-3 text-right font-bold">{fmt(c.total)}</td>
                <td className={cn("py-1.5 px-3 text-right", c.pendiente > 0 ? "text-warning font-bold" : "text-muted-foreground")}>{fmt(c.pendiente)}</td>
                <td className="py-1.5 px-3">
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(c.total / maxVal) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
