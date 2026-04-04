import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';

const COLUMNS: ColumnDef[] = [
  { key: 'expand', label: 'Expandir' },
  { key: 'nombre', label: 'Ruta / Vendedor' },
  { key: 'entregas', label: 'Entregas' },
  { key: 'total', label: 'Total' },
];

export function ReporteEntregas({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const { visible, setVisible, isVisible } = useColumnVisibility(COLUMNS);
  const [expandedRuta, setExpandedRuta] = useState<number | null>(null);
  const rutas = data.entregasPorRuta ?? [];

  const colCount = COLUMNS.filter(c => visible.has(c.key)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-2 gap-3 flex-1">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total entregas</div>
            <div className="text-lg font-bold text-foreground">{data.totalEntregas}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Rutas</div>
            <div className="text-lg font-bold text-foreground">{rutas.length}</div>
          </div>
        </div>
        <ColumnChooser columns={COLUMNS} visible={visible} onChange={setVisible} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              {isVisible('expand') && <th className="py-2 px-3 w-8"></th>}
              {isVisible('nombre') && <th className="text-left py-2 px-3">Ruta / Vendedor</th>}
              {isVisible('entregas') && <th className="text-right py-2 px-3">Entregas</th>}
              {isVisible('total') && <th className="text-right py-2 px-3">Total</th>}
            </tr>
          </thead>
          <tbody>
            {rutas.map((r: any, i: number) => {
              const prods = Object.values(r.productos) as any[];
              const isOpen = expandedRuta === i;
              return (
                <>
                  <tr key={i} className="border-b border-border/50 cursor-pointer hover:bg-accent/30" onClick={() => setExpandedRuta(isOpen ? null : i)}>
                    {isVisible('expand') && <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</td>}
                    {isVisible('nombre') && <td className="py-2 px-3 font-medium">{r.nombre}</td>}
                    {isVisible('entregas') && <td className="py-2 px-3 text-right">{r.entregas}</td>}
                    {isVisible('total') && <td className="py-2 px-3 text-right font-semibold">{fmt(r.total)}</td>}
                  </tr>
                  {isOpen && prods.length > 0 && (
                    <tr key={`${i}-detail`}>
                      <td colSpan={colCount} className="p-0">
                        <div className="px-6 py-2 border-b border-border/50">
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-[9px] text-muted-foreground uppercase"><th className="py-1 text-left">Código</th><th className="py-1 text-left">Producto</th><th className="py-1 text-right">Cantidad</th></tr></thead>
                            <tbody>
                              {prods.map((p: any, j: number) => (
                                <tr key={j} className="border-t border-border/30">
                                  <td className="py-1 font-mono text-muted-foreground">{p.codigo}</td>
                                  <td className="py-1">{p.nombre}</td>
                                  <td className="py-1 text-right font-semibold">{p.cantidad}</td>
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
            {rutas.length === 0 && <tr><td colSpan={colCount} className="text-center py-8 text-muted-foreground">Sin entregas en el período</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
