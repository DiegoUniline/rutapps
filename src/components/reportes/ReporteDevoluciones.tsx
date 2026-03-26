import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const motivoLabels: Record<string, string> = { no_vendido: 'No vendido', vencido: 'Vencido', danado: 'Dañado', cambio: 'Cambio', otro: 'Otro' };

export function ReporteDevoluciones({ data }: { data: any }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const devs = data.devData ?? [];
  const porMotivo = data.devPorMotivo ?? {};

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Total devoluciones</p>
          <p className="text-lg font-bold text-foreground">{data.totalDevoluciones}</p>
        </div>
        {Object.entries(porMotivo).map(([motivo, cant]) => (
          <div key={motivo} className="bg-card border border-border rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground uppercase">{motivoLabels[motivo] ?? motivo}</p>
            <p className="text-lg font-bold text-warning">{(cant as number).toLocaleString()} pzas</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 px-3 w-8"></th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Fecha</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Tipo</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Vendedor</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Cliente</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Piezas</th>
            </tr>
          </thead>
          <tbody>
            {devs.map((d: any) => {
              const isOpen = expanded === d.id;
              return (
                <>
                  <tr key={d.id} className="border-b border-border/50 cursor-pointer hover:bg-card" onClick={() => setExpanded(isOpen ? null : d.id)}>
                    <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                    <td className="py-2 px-3">{d.fecha}</td>
                    <td className="py-2 px-3"><span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", d.tipo === 'almacen' ? 'bg-primary/20 text-primary' : 'bg-warning/20 text-warning')}>{d.tipo === 'almacen' ? 'Almacén' : 'Tienda'}</span></td>
                    <td className="py-2 px-3">{d.vendedor}</td>
                    <td className="py-2 px-3">{d.cliente}</td>
                    <td className="py-2 px-3 text-right font-bold">{d.totalPiezas}</td>
                  </tr>
                  {isOpen && d.lineas.length > 0 && (
                    <tr key={`${d.id}-d`}>
                      <td colSpan={6} className="p-0">
                        <div className="bg-card/50 px-6 py-2">
                          <table className="w-full text-[12px]">
                            <thead><tr className="text-muted-foreground"><th className="py-1 text-left">Código</th><th className="py-1 text-left">Producto</th><th className="py-1 text-right">Cantidad</th><th className="py-1 text-left">Motivo</th></tr></thead>
                            <tbody>
                              {d.lineas.map((l: any, j: number) => (
                                <tr key={j} className="border-t border-border/30">
                                  <td className="py-1">{l.codigo}</td>
                                  <td className="py-1">{l.nombre}</td>
                                  <td className="py-1 text-right font-medium">{l.cantidad}</td>
                                  <td className="py-1">{motivoLabels[l.motivo] ?? l.motivo}</td>
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
            {devs.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin devoluciones en el período</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
