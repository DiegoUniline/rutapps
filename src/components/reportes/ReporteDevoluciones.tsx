import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';

const motivoLabels: Record<string, string> = { no_vendido: 'No vendido', vencido: 'Vencido', danado: 'Dañado', cambio: 'Cambio', otro: 'Otro' };

const COLUMNS: ColumnDef[] = [
  { key: 'expand', label: 'Expandir' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'vendedor', label: 'Vendedor' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'piezas', label: 'Piezas' },
];

export function ReporteDevoluciones({ data }: { data: any }) {
  const { visible, setVisible, isVisible } = useColumnVisibility(COLUMNS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const devs = data.devData ?? [];
  const porMotivo = data.devPorMotivo ?? {};
  const colCount = COLUMNS.filter(c => visible.has(c.key)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
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
        <ColumnChooser columns={COLUMNS} visible={visible} onChange={setVisible} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              {isVisible('expand') && <th className="py-2 px-3 w-8"></th>}
              {isVisible('fecha') && <th className="text-left py-2 px-3">Fecha</th>}
              {isVisible('tipo') && <th className="text-left py-2 px-3">Tipo</th>}
              {isVisible('vendedor') && <th className="text-left py-2 px-3">Vendedor</th>}
              {isVisible('cliente') && <th className="text-left py-2 px-3">Cliente</th>}
              {isVisible('piezas') && <th className="text-right py-2 px-3">Piezas</th>}
            </tr>
          </thead>
          <tbody>
            {devs.map((d: any) => {
              const isOpen = expanded === d.id;
              return (
                <>
                  <tr key={d.id} className="border-b border-border/50 cursor-pointer hover:bg-accent/30" onClick={() => setExpanded(isOpen ? null : d.id)}>
                    {isVisible('expand') && <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</td>}
                    {isVisible('fecha') && <td className="py-2 px-3">{fmtDate(d.fecha)}</td>}
                    {isVisible('tipo') && <td className="py-2 px-3"><span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-accent text-foreground">{d.tipo === 'almacen' ? 'Almacén' : 'Tienda'}</span></td>}
                    {isVisible('vendedor') && <td className="py-2 px-3">{d.vendedor}</td>}
                    {isVisible('cliente') && <td className="py-2 px-3">{d.cliente}</td>}
                    {isVisible('piezas') && <td className="py-2 px-3 text-right font-semibold">{d.totalPiezas}</td>}
                  </tr>
                  {isOpen && d.lineas.length > 0 && (
                    <tr key={`${d.id}-d`}>
                      <td colSpan={colCount} className="p-0">
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
            {devs.length === 0 && <tr><td colSpan={colCount} className="text-center py-8 text-muted-foreground">Sin devoluciones en el período</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
