import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const motivoLabels: Record<string, string> = { no_vendido: 'No vendido', vencido: 'Vencido', danado: 'Dañado', cambio: 'Cambio', otro: 'Otro' };

export function ReporteDevoluciones({ data }: { data: any }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const devs = data.devData ?? [];
  const porMotivo = data.devPorMotivo ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total devoluciones</div>
          <div className="text-lg font-bold text-foreground">{data.totalDevoluciones}</div>
        </div>
        {Object.entries(porMotivo).map(([motivo, cant]) => (
          <div key={motivo} className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">{motivoLabels[motivo] ?? motivo}</div>
            <div className="text-lg font-bold text-foreground">{(cant as number).toLocaleString()} pzas</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              <th className="py-2 px-3 w-8"></th>
              <th className="text-left py-2 px-3">Fecha</th>
              <th className="text-left py-2 px-3">Tipo</th>
              <th className="text-left py-2 px-3">Vendedor</th>
              <th className="text-left py-2 px-3">Cliente</th>
              <th className="text-right py-2 px-3">Piezas</th>
            </tr>
          </thead>
          <tbody>
            {devs.map((d: any) => {
              const isOpen = expanded === d.id;
              return (
                <>
                  <tr key={d.id} className="border-b border-border/50 cursor-pointer hover:bg-accent/30" onClick={() => setExpanded(isOpen ? null : d.id)}>
                    <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</td>
                    <td className="py-2 px-3">{d.fecha}</td>
                    <td className="py-2 px-3">
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-accent text-foreground">
                        {d.tipo === 'almacen' ? 'Almacén' : 'Tienda'}
                      </span>
                    </td>
                    <td className="py-2 px-3">{d.vendedor}</td>
                    <td className="py-2 px-3">{d.cliente}</td>
                    <td className="py-2 px-3 text-right font-semibold">{d.totalPiezas}</td>
                  </tr>
                  {isOpen && d.lineas.length > 0 && (
                    <tr key={`${d.id}-d`}>
                      <td colSpan={6} className="p-0">
                        <div className="px-6 py-2 border-b border-border/50">
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-[9px] text-muted-foreground uppercase"><th className="py-1 text-left">Código</th><th className="py-1 text-left">Producto</th><th className="py-1 text-right">Cantidad</th><th className="py-1 text-left">Motivo</th></tr></thead>
                            <tbody>
                              {d.lineas.map((l: any, j: number) => (
                                <tr key={j} className="border-t border-border/30">
                                  <td className="py-1 font-mono text-muted-foreground">{l.codigo}</td>
                                  <td className="py-1">{l.nombre}</td>
                                  <td className="py-1 text-right font-semibold">{l.cantidad}</td>
                                  <td className="py-1 text-muted-foreground">{motivoLabels[l.motivo] ?? l.motivo}</td>
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
