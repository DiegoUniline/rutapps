import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

export function ReporteEntregas({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const [expandedRuta, setExpandedRuta] = useState<number | null>(null);
  const rutas = data.entregasPorRuta ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Total entregas</p>
          <p className="text-lg font-bold text-foreground">{data.totalEntregas}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Rutas con entregas</p>
          <p className="text-lg font-bold text-primary">{rutas.length}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 px-3 w-8"></th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Ruta / Vendedor</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Entregas</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rutas.map((r: any, i: number) => {
              const prods = Object.values(r.productos) as any[];
              const isOpen = expandedRuta === i;
              return (
                <>
                  <tr key={i} className="border-b border-border/50 cursor-pointer hover:bg-card" onClick={() => setExpandedRuta(isOpen ? null : i)}>
                    <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                    <td className="py-2 px-3 font-medium">{r.nombre}</td>
                    <td className="py-2 px-3 text-right">{r.entregas}</td>
                    <td className="py-2 px-3 text-right font-bold">{fmt(r.total)}</td>
                  </tr>
                  {isOpen && prods.length > 0 && (
                    <tr key={`${i}-detail`}>
                      <td colSpan={4} className="p-0">
                        <div className="bg-card/50 px-6 py-2">
                          <table className="w-full text-[12px]">
                            <thead><tr className="text-muted-foreground"><th className="py-1 text-left">Código</th><th className="py-1 text-left">Producto</th><th className="py-1 text-right">Cantidad</th></tr></thead>
                            <tbody>
                              {prods.map((p: any, j: number) => (
                                <tr key={j} className="border-t border-border/30">
                                  <td className="py-1">{p.codigo}</td>
                                  <td className="py-1">{p.nombre}</td>
                                  <td className="py-1 text-right font-medium">{p.cantidad}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {rutas.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sin entregas en el período</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
