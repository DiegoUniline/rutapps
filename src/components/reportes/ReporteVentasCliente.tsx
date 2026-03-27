import { useCurrency } from '@/hooks/useCurrency';

export function ReporteVentasCliente({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const items = data.ventasPorCliente ?? [];
  const totalVendido = items.reduce((s: number, c: any) => s + c.total, 0);
  const totalPendiente = items.reduce((s: number, c: any) => s + c.pendiente, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Clientes activos</div>
          <div className="text-lg font-bold text-foreground">{items.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total vendido</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalVendido)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Pendiente cobro</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalPendiente)}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              <th className="text-left py-2 px-3 w-8">#</th>
              <th className="text-left py-2 px-3">Cliente</th>
              <th className="text-right py-2 px-3">Ventas</th>
              <th className="text-right py-2 px-3">Total</th>
              <th className="text-right py-2 px-3">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((c: any, i: number) => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>
                <td className="py-1.5 px-3 font-medium">{c.nombre}</td>
                <td className="py-1.5 px-3 text-right">{c.ventas}</td>
                <td className="py-1.5 px-3 text-right font-semibold">{fmt(c.total)}</td>
                <td className="py-1.5 px-3 text-right font-semibold">{fmt(c.pendiente)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-bold text-[11px]">
                <td colSpan={2} className="py-2 px-3 text-right text-muted-foreground">Total:</td>
                <td className="py-2 px-3 text-right">{items.reduce((s: number, c: any) => s + c.ventas, 0)}</td>
                <td className="py-2 px-3 text-right">{fmt(totalVendido)}</td>
                <td className="py-2 px-3 text-right">{fmt(totalPendiente)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
