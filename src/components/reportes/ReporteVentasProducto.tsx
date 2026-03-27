import { useCurrency } from '@/hooks/useCurrency';

export function ReporteVentasProducto({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const items = data.ventasPorProducto ?? [];
  const totalGeneral = items.reduce((s: number, p: any) => s + p.total, 0);
  const totalUnidades = items.reduce((s: number, p: any) => s + p.cantidad, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Productos vendidos</div>
          <div className="text-lg font-bold text-foreground">{items.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Unidades totales</div>
          <div className="text-lg font-bold text-foreground">{totalUnidades.toLocaleString()}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Venta total</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalGeneral)}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              <th className="text-left py-2 px-3 w-8">#</th>
              <th className="text-left py-2 px-3">Código</th>
              <th className="text-left py-2 px-3">Producto</th>
              <th className="text-right py-2 px-3">Uds</th>
              <th className="text-right py-2 px-3">Total</th>
              <th className="text-right py-2 px-3">Utilidad</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((p: any, i: number) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>
                <td className="py-1.5 px-3 font-mono text-muted-foreground">{p.codigo}</td>
                <td className="py-1.5 px-3 font-medium">{p.nombre}</td>
                <td className="py-1.5 px-3 text-right">{p.cantidad}</td>
                <td className="py-1.5 px-3 text-right font-semibold">{fmt(p.total)}</td>
                <td className="py-1.5 px-3 text-right font-semibold">{fmt(p.utilidad)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-bold text-[11px]">
                <td colSpan={3} className="py-2 px-3 text-right text-muted-foreground">Total:</td>
                <td className="py-2 px-3 text-right">{totalUnidades}</td>
                <td className="py-2 px-3 text-right">{fmt(totalGeneral)}</td>
                <td className="py-2 px-3 text-right">{fmt(items.reduce((s: number, p: any) => s + p.utilidad, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
