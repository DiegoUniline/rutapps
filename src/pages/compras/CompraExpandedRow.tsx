import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Pencil, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { fmtDate, fmtNum } from '@/lib/utils';
import { getNombreCompra } from '@/lib/productoNombres';
import { ProductoLink } from '@/components/links/EntityLinks';
import { useLotesPorReferencia } from '@/hooks/useLotesPorReferencia';
import { LoteCell } from '@/components/lotes/LoteCell';

interface Props {
  compra: any;
  colSpan: number;
  fmt: (v: number | null | undefined) => string;
  onCollapse: () => void;
}

export function CompraExpandedRow({ compra, colSpan, fmt, onCollapse }: Props) {
  const navigate = useNavigate();
  const [lineas, setLineas] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [lRes, pRes] = await Promise.all([
        supabase
          .from('compra_lineas')
          .select('id, cantidad, precio_unitario, subtotal, total, producto_id, productos(codigo, nombre, nombre_compra)')
          .eq('compra_id', compra.id)
          .order('created_at'),
        supabase
          .from('pago_compras')
          .select('id, fecha, metodo_pago, referencia, monto, notas')
          .eq('compra_id', compra.id)
          .order('fecha', { ascending: false }),
      ]);
      if (!cancelled) {
        setLineas(lRes.data ?? []);
        setPagos(pRes.data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [compra.id]);

  const { data: lotesMap } = useLotesPorReferencia(compra.id, ['compra']);
  const totalPagado = pagos.reduce((s, p) => s + (p.monto ?? 0), 0);

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-card border-b border-border px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm font-bold">{compra.folio || compra.id.slice(0, 8)}</span>
              <StatusChip status={compra.status} />
              <span className="text-muted-foreground text-xs">{compra.proveedores?.nombre ?? '—'}</span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-muted-foreground text-xs">{fmtDate(compra.fecha)}</span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-muted-foreground text-xs">{compra.condicion_pago === 'credito' ? 'Crédito' : 'Contado'}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => navigate(`/almacen/compras/${compra.id}`)}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
              <button onClick={onCollapse} className="p-1 rounded hover:bg-accent text-muted-foreground">
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground py-2">Cargando detalles...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Productos</h4>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-1 font-medium">Código</th>
                      <th className="text-left py-1 font-medium">Producto</th>
                      <th className="text-left py-1 font-medium">Lote</th>
                      <th className="text-right py-1 font-medium w-16">Cant</th>
                      <th className="text-right py-1 font-medium w-20">P. Unit.</th>
                      <th className="text-right py-1 font-medium w-20">Subtotal</th>
                      <th className="text-right py-1 font-medium w-20">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l: any) => (
                      <tr key={l.id} className="border-b border-border/40">
                        <td className="py-1.5 font-mono text-[11px] text-muted-foreground">{(l.productos as any)?.codigo ?? ''}</td>
                        <td className="py-1.5"><ProductoLink id={l.producto_id}>{getNombreCompra(l.productos as any)}</ProductoLink></td>
                        <td className="py-1.5"><LoteCell lotes={lotesMap?.[l.producto_id]} /></td>
                        <td className="text-right py-1.5 tabular-nums">{fmtNum(l.cantidad)}</td>
                        <td className="text-right py-1.5 tabular-nums">{fmt(l.precio_unitario)}</td>
                        <td className="text-right py-1.5 tabular-nums">{fmt(l.subtotal)}</td>
                        <td className="text-right py-1.5 tabular-nums font-medium">{fmt(l.total ?? l.subtotal)}</td>
                      </tr>
                    ))}
                    {lineas.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-3 text-muted-foreground text-xs">Sin productos</td></tr>
                    )}
                  </tbody>
                </table>

                <div className="flex justify-end mt-2">
                  <div className="text-[12px] space-y-0.5 min-w-[200px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmt(compra.subtotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="tabular-nums">{fmt(compra.iva_total)}</span></div>
                    <div className="flex justify-between font-bold border-t border-border pt-0.5"><span>Total</span><span className="tabular-nums">{fmt(compra.total)}</span></div>
                    {(compra.saldo_pendiente ?? 0) > 0 && (
                      <div className="flex justify-between text-destructive font-medium"><span>Saldo pendiente</span><span className="tabular-nums">{fmt(compra.saldo_pendiente)}</span></div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Pagos realizados</h4>
                {pagos.length > 0 ? (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1 font-medium">Método</th>
                        <th className="text-left py-1 font-medium">Referencia</th>
                        <th className="text-left py-1 font-medium">Fecha</th>
                        <th className="text-right py-1 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagos.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/40">
                          <td className="py-1.5 capitalize">{p.metodo_pago ?? '—'}</td>
                          <td className="py-1.5 text-muted-foreground">{p.referencia || '—'}</td>
                          <td className="py-1.5 text-muted-foreground">{fmtDate(p.fecha)}</td>
                          <td className="py-1.5 text-right font-medium tabular-nums">{fmt(p.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border font-semibold">
                        <td colSpan={3} className="py-1.5">Total pagado</td>
                        <td className="py-1.5 text-right text-success tabular-nums">{fmt(totalPagado)}</td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">Sin pagos registrados</p>
                )}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
