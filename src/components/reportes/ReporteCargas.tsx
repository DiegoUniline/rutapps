import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';

const statusLabels: Record<string, string> = { pendiente: 'Pendiente', en_ruta: 'En ruta', completada: 'Completada', cancelada: 'Cancelada' };

const COLUMNS: ColumnDef[] = [
  { key: 'expand', label: 'Expandir' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'vendedor', label: 'Vendedor' },
  { key: 'status', label: 'Status' },
  { key: 'cargado', label: 'Cargado' },
  { key: 'vendido', label: 'Vendido' },
];

export function ReporteCargas({ data }: { data: any }) {
  const { visible, setVisible, isVisible } = useColumnVisibility(COLUMNS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cargas = data.cargasData ?? [];
  const colCount = COLUMNS.filter(c => visible.has(c.key)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total cargas</div>
            <div className="text-lg font-bold text-foreground">{cargas.length}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Piezas cargadas</div>
            <div className="text-lg font-bold text-foreground">{cargas.reduce((s: number, c: any) => s + c.totalCargado, 0).toLocaleString()}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Piezas vendidas</div>
            <div className="text-lg font-bold text-foreground">{cargas.reduce((s: number, c: any) => s + c.totalVendido, 0).toLocaleString()}</div>
          </div>
        </div>
        <ColumnChooser columns={COLUMNS} visible={visible} onChange={setVisible} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              {isVisible('expand') && <th className="py-2 px-3 w-8"></th>}
              {isVisible('fecha') && <th className="text-left py-2 px-3">Fecha</th>}
              {isVisible('vendedor') && <th className="text-left py-2 px-3">Vendedor</th>}
              {isVisible('status') && <th className="text-left py-2 px-3">Status</th>}
              {isVisible('cargado') && <th className="text-right py-2 px-3">Cargado</th>}
              {isVisible('vendido') && <th className="text-right py-2 px-3">Vendido</th>}
            </tr>
          </thead>
          <tbody>
            {cargas.map((c: any) => {
              const isOpen = expanded === c.id;
              return (
                <>
                  <tr key={c.id} className="border-b border-border/50 cursor-pointer hover:bg-accent/30" onClick={() => setExpanded(isOpen ? null : c.id)}>
                    {isVisible('expand') && <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</td>}
                    {isVisible('fecha') && <td className="py-2 px-3">{fmtDate(c.fecha)}</td>}
                    {isVisible('vendedor') && <td className="py-2 px-3 font-medium">{c.vendedor}</td>}
                    {isVisible('status') && <td className="py-2 px-3"><span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-accent text-foreground">{statusLabels[c.status] ?? c.status}</span></td>}
                    {isVisible('cargado') && <td className="py-2 px-3 text-right font-semibold">{c.totalCargado}</td>}
                    {isVisible('vendido') && <td className="py-2 px-3 text-right font-semibold">{c.totalVendido}</td>}
                  </tr>
                  {isOpen && c.lineas.length > 0 && (
                    <tr key={`${c.id}-d`}>
                      <td colSpan={colCount} className="p-0">
                        <div className="px-6 py-2 border-b border-border/50">
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-[9px] text-muted-foreground uppercase"><th className="py-1 text-left">Código</th><th className="py-1 text-left">Producto</th><th className="py-1 text-right">Cargado</th><th className="py-1 text-right">Vendido</th><th className="py-1 text-right">Devuelto</th></tr></thead>
                            <tbody>
                              {c.lineas.map((l: any, j: number) => (
                                <tr key={j} className="border-t border-border/30">
                                  <td className="py-1 font-mono text-muted-foreground">{l.codigo}</td>
                                  <td className="py-1">{l.nombre}</td>
                                  <td className="py-1 text-right">{l.cargada}</td>
                                  <td className="py-1 text-right font-semibold">{l.vendida}</td>
                                  <td className="py-1 text-right">{l.devuelta}</td>
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
            {cargas.length === 0 && <tr><td colSpan={colCount} className="text-center py-8 text-muted-foreground">Sin cargas en el período</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
