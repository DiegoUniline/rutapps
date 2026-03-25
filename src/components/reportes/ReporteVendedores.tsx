import { useCurrency } from '@/hooks/useCurrency';

export function ReporteVendedores({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const items = data.topVendedores ?? [];
  const maxVal = items[0]?.total ?? 1;

  return (
    <div className="bg-card border border-border rounded overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 px-3 text-[11px] text-muted-foreground w-8">#</th>
            <th className="py-2 px-3 text-[11px] text-muted-foreground">Vendedor</th>
            <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Ventas</th>
            <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Total</th>
            <th className="py-2 px-3 text-[11px] text-muted-foreground w-28">%</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v: any, i: number) => (
            <tr key={v.id} className="border-b border-border/50">
              <td className="py-1.5 px-3 font-bold text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 px-3 font-medium">{v.nombre}</td>
              <td className="py-1.5 px-3 text-right">{v.ventas}</td>
              <td className="py-1.5 px-3 text-right font-bold">{fmt(v.total)}</td>
              <td className="py-1.5 px-3">
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(v.total / maxVal) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
