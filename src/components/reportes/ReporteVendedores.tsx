import { useCurrency } from '@/hooks/useCurrency';

export function ReporteVendedores({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const items = data.topVendedores ?? [];
  const totalGeneral = items.reduce((s: number, v: any) => s + v.total, 0);

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
            <th className="text-left py-2 px-3 w-8">#</th>
            <th className="text-left py-2 px-3">Vendedor</th>
            <th className="text-right py-2 px-3">Ventas</th>
            <th className="text-right py-2 px-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v: any, i: number) => (
            <tr key={v.id} className="border-b border-border/50">
              <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 px-3 font-medium">{v.nombre}</td>
              <td className="py-1.5 px-3 text-right">{v.ventas}</td>
              <td className="py-1.5 px-3 text-right font-semibold">{fmt(v.total)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="border-t border-border font-bold text-[11px]">
              <td colSpan={2} className="py-2 px-3 text-right text-muted-foreground">Total:</td>
              <td className="py-2 px-3 text-right">{items.reduce((s: number, v: any) => s + v.ventas, 0)}</td>
              <td className="py-2 px-3 text-right">{fmt(totalGeneral)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
