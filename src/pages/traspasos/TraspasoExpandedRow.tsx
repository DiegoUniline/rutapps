import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Pencil, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { fmtDate, fmtNum } from '@/lib/utils';
import { ProductoLink } from '@/components/links/EntityLinks';
import { useLotesPorReferencia } from '@/hooks/useLotesPorReferencia';
import { LoteCell } from '@/components/lotes/LoteCell';
import { useManejaLotes } from '@/hooks/useManejaLotes';

interface Props {
  traspaso: any;
  colSpan: number;
  origenLabel: string;
  destinoLabel: string;
  tipoLabel: string;
  onCollapse: () => void;
}

export function TraspasoExpandedRow({ traspaso, colSpan, origenLabel, destinoLabel, tipoLabel, onCollapse }: Props) {
  const navigate = useNavigate();
  const [lineas, setLineas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('traspaso_lineas')
        .select('id, cantidad, producto_id, productos(codigo, nombre)')
        .eq('traspaso_id', traspaso.id)
        .order('created_at');
      if (!cancelled) {
        setLineas(data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [traspaso.id]);

  const { data: lotesMap } = useLotesPorReferencia(traspaso.id, ['traspaso']);
  const totalCant = lineas.reduce((s, l) => s + (l.cantidad ?? 0), 0);

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-card border-b border-border px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm font-bold">{traspaso.folio || traspaso.id.slice(0, 8)}</span>
              <StatusChip status={traspaso.status} />
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{tipoLabel}</span>
              <span className="text-muted-foreground text-xs">{origenLabel} → {destinoLabel}</span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-muted-foreground text-xs">{fmtDate(traspaso.fecha)}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => navigate(`/almacen/traspasos/${traspaso.id}`)}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
              <button onClick={onCollapse} className="p-1 rounded hover:bg-accent text-muted-foreground">
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Productos</h4>
            {loading ? (
              <p className="text-xs text-muted-foreground py-2">Cargando...</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1 font-medium">Código</th>
                    <th className="text-left py-1 font-medium">Producto</th>
                    {manejaLotes && <th className="text-left py-1 font-medium">Lote</th>}
                    <th className="text-right py-1 font-medium w-20">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l: any) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="py-1.5 font-mono text-[11px] text-muted-foreground">{(l.productos as any)?.codigo ?? ''}</td>
                      <td className="py-1.5"><ProductoLink id={l.producto_id}>{(l.productos as any)?.nombre ?? '—'}</ProductoLink></td>
                      {manejaLotes && <td className="py-1.5"><LoteCell lotes={lotesMap?.[l.producto_id]} /></td>}
                      <td className="text-right py-1.5 tabular-nums font-medium">{fmtNum(l.cantidad)}</td>
                    </tr>
                  ))}
                  {lineas.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-3 text-muted-foreground text-xs">Sin productos</td></tr>
                  )}
                </tbody>
                {lineas.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td colSpan={3} className="py-1.5">Total</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtNum(totalCant)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
