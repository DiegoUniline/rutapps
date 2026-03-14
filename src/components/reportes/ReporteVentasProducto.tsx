import { cn } from '@/lib/utils';
const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

export function ReporteVentasProducto({ data }: { data: any }) {
  const items = data.ventasPorProducto ?? [];
  const maxVal = items[0]?.total ?? 1;
  const totalGeneral = items.reduce((s: number, p: any) => s + p.total, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Productos vendidos</p>
          <p className="text-lg font-bold text-foreground">{items.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Unidades totales</p>
          <p className="text-lg font-bold text-foreground">{items.reduce((s: number, p: any) => s + p.cantidad, 0).toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Venta total</p>
          <p className="text-lg font-bold text-primary">$ {fmt(totalGeneral)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 px-3 text-[11px] text-muted-foreground w-8">#</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Código</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Producto</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Uds</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Total</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Utilidad</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground w-28">%</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((p: any, i: number) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="py-1.5 px-3 font-bold text-muted-foreground">{i + 1}</td>
                <td className="py-1.5 px-3 text-muted-foreground">{p.codigo}</td>
                <td className="py-1.5 px-3 font-medium">{p.nombre}</td>
                <td className="py-1.5 px-3 text-right">{p.cantidad}</td>
                <td className="py-1.5 px-3 text-right font-bold">$ {fmt(p.total)}</td>
                <td className={cn("py-1.5 px-3 text-right font-bold", p.utilidad >= 0 ? "text-success" : "text-destructive")}>$ {fmt(p.utilidad)}</td>
                <td className="py-1.5 px-3">
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(p.total / maxVal) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
