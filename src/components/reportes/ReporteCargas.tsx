import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusLabels: Record<string, string> = { pendiente: 'Pendiente', en_ruta: 'En ruta', completada: 'Completada', cancelada: 'Cancelada' };
const statusColors: Record<string, string> = { pendiente: 'bg-warning/20 text-warning', en_ruta: 'bg-primary/20 text-primary', completada: 'bg-success/20 text-success', cancelada: 'bg-destructive/20 text-destructive' };

export function ReporteCargas({ data }: { data: any }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const cargas = data.cargasData ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Total cargas</p>
          <p className="text-lg font-bold text-foreground">{cargas.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Piezas cargadas</p>
          <p className="text-lg font-bold text-primary">{cargas.reduce((s: number, c: any) => s + c.totalCargado, 0).toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Piezas vendidas</p>
          <p className="text-lg font-bold text-success">{cargas.reduce((s: number, c: any) => s + c.totalVendido, 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 px-3 w-8"></th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Fecha</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Vendedor</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground">Status</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Cargado</th>
              <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Vendido</th>
            </tr>
          </thead>
          <tbody>
            {cargas.map((c: any) => {
              const isOpen = expanded === c.id;
              return (
                <>
                  <tr key={c.id} className="border-b border-border/50 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(isOpen ? null : c.id)}>
                    <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                    <td className="py-2 px-3">{c.fecha}</td>
                    <td className="py-2 px-3 font-medium">{c.vendedor}</td>
                    <td className="py-2 px-3"><span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", statusColors[c.status] ?? '')}>{statusLabels[c.status] ?? c.status}</span></td>
                    <td className="py-2 px-3 text-right font-bold">{c.totalCargado}</td>
                    <td className="py-2 px-3 text-right font-bold text-success">{c.totalVendido}</td>
                  </tr>
                  {isOpen && c.lineas.length > 0 && (
                    <tr key={`${c.id}-d`}>
                      <td colSpan={6} className="p-0">
                        <div className="bg-muted/20 px-6 py-2">
                          <table className="w-full text-[12px]">
                            <thead><tr className="text-muted-foreground"><th className="py-1 text-left">Código</th><th className="py-1 text-left">Producto</th><th className="py-1 text-right">Cargado</th><th className="py-1 text-right">Vendido</th><th className="py-1 text-right">Devuelto</th></tr></thead>
                            <tbody>
                              {c.lineas.map((l: any, j: number) => (
                                <tr key={j} className="border-t border-border/30">
                                  <td className="py-1">{l.codigo}</td>
                                  <td className="py-1">{l.nombre}</td>
                                  <td className="py-1 text-right">{l.cargada}</td>
                                  <td className="py-1 text-right text-success">{l.vendida}</td>
                                  <td className="py-1 text-right text-warning">{l.devuelta}</td>
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
            {cargas.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin cargas en el período</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
