import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Pencil, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { fmtNum } from '@/lib/utils';
import { ProductoLink } from '@/components/links/EntityLinks';

interface Props {
  cotizacion: any;
  colSpan: number;
  estadoClass: string;
  onCollapse: () => void;
}

export function CotizacionExpandedRow({ cotizacion, colSpan, estadoClass, onCollapse }: Props) {
  const navigate = useNavigate();
  const [lineas, setLineas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('cotizacion_lineas')
        .select('id, cantidad, precio_unitario, subtotal, impuesto, total, producto_id, descripcion, producto_snapshot, productos(codigo, nombre)')
        .eq('cotizacion_id', cotizacion.id)
        .order('orden', { ascending: true });
      if (!cancelled) {
        setLineas(data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cotizacion.id]);

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-card border-b border-border px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm font-bold">{cotizacion.folio || cotizacion.id.slice(0, 8)}</span>
              <Badge className={estadoClass}>{cotizacion.estado}</Badge>
              <span className="text-muted-foreground text-xs">{cotizacion.clientes?.nombre || 'Sin cliente'}</span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="font-semibold text-sm">{formatCurrency(cotizacion.total, cotizacion.moneda)}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => navigate(`/cotizaciones/${cotizacion.id}`)}>
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
                    <th className="text-right py-1 font-medium w-20">Cantidad</th>
                    <th className="text-right py-1 font-medium w-24">Precio</th>
                    <th className="text-right py-1 font-medium w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l: any) => {
                    const snap = l.producto_snapshot || {};
                    const codigo = l.productos?.codigo ?? snap.codigo ?? '';
                    const nombre = l.productos?.nombre ?? snap.nombre ?? l.descripcion ?? '—';
                    return (
                      <tr key={l.id} className="border-b border-border/40">
                        <td className="py-1.5 font-mono text-[11px] text-muted-foreground">{codigo}</td>
                        <td className="py-1.5">
                          {l.producto_id ? <ProductoLink id={l.producto_id}>{nombre}</ProductoLink> : nombre}
                        </td>
                        <td className="text-right py-1.5 tabular-nums">{fmtNum(l.cantidad)}</td>
                        <td className="text-right py-1.5 tabular-nums">{formatCurrency(l.precio_unitario, cotizacion.moneda)}</td>
                        <td className="text-right py-1.5 tabular-nums font-medium">{formatCurrency(l.total, cotizacion.moneda)}</td>
                      </tr>
                    );
                  })}
                  {lineas.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-3 text-muted-foreground text-xs">Sin productos</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
