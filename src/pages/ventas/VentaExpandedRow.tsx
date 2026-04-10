import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Pencil, Trash2, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { fmtDate } from '@/lib/utils';
import { CONDICION_LABELS } from './ventasConstants';

interface Props {
  venta: any;
  fmt: (v: number | null | undefined) => string;
  canDelete: boolean;
  onDeleteTarget: (id: string) => void;
  onCollapse: () => void;
}

export function VentaExpandedRow({ venta, fmt, canDelete, onDeleteTarget, onCollapse }: Props) {
  const navigate = useNavigate();
  const [lineas, setLineas] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [lRes, pRes] = await Promise.all([
        supabase
          .from('venta_lineas')
          .select('id, cantidad, precio_unitario, descuento_pct, subtotal, iva_monto, ieps_monto, total, producto_id, productos(nombre, unidad_granel)')
          .eq('venta_id', venta.id)
          .order('created_at'),
        supabase
          .from('cobro_aplicaciones')
          .select('id, monto_aplicado, cobros(fecha, metodo_pago, referencia)')
          .eq('venta_id', venta.id)
          .order('created_at'),
      ]);
      if (!cancelled) {
        setLineas(lRes.data ?? []);
        setPagos(pRes.data ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [venta.id]);

  const clienteNombre = venta.clientes?.nombre || (venta.cliente_id ? '—' : 'Público en general');

  return (
    <tr>
      <td colSpan={13} className="p-0">
        <div className="bg-card border-b border-border px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm font-bold">{venta.folio || venta.id.slice(0, 8)}</span>
              <StatusChip status={venta.status} />
              <span className="text-muted-foreground text-xs">{clienteNombre}</span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-muted-foreground text-xs">{fmtDate(venta.fecha)}</span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-muted-foreground text-xs">{CONDICION_LABELS[venta.condicion_pago] || venta.condicion_pago}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => navigate(`/ventas/${venta.id}`)}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
              {(venta.status === 'borrador' || (venta.status === 'cancelado' && canDelete)) && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1.5" onClick={() => onDeleteTarget(venta.id)}>
                  <Trash2 className="h-3 w-3" /> Eliminar
                </Button>
              )}
              <button onClick={onCollapse} className="p-1 rounded hover:bg-accent text-muted-foreground">
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground py-2">Cargando detalles...</p>
          ) : (
            <div className="space-y-4">
              {/* Líneas */}
              <div>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Productos</h4>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-1 font-medium">Producto</th>
                      <th className="text-right py-1 font-medium w-16">Precio</th>
                      <th className="text-right py-1 font-medium w-14">Cant</th>
                      <th className="text-center py-1 font-medium w-10">Ud</th>
                      <th className="text-right py-1 font-medium w-16">Monto</th>
                      <th className="text-right py-1 font-medium w-16">Desc</th>
                      <th className="text-right py-1 font-medium w-20">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l: any) => {
                      const descMonto = (l.subtotal ?? 0) * ((l.descuento_pct ?? 0) / 100);
                      return (
                        <tr key={l.id} className="border-b border-border/40">
                          <td className="py-1.5">{(l.productos as any)?.nombre ?? '—'}</td>
                          <td className="text-right py-1.5 tabular-nums">{fmt(l.precio_unitario)}</td>
                          <td className="text-right py-1.5 tabular-nums">{l.cantidad}</td>
                          <td className="text-center py-1.5 text-muted-foreground">{(l.productos as any)?.unidad_granel || 'Pzs'}</td>
                          <td className="text-right py-1.5 tabular-nums">{fmt(l.subtotal)}</td>
                          <td className="text-right py-1.5 tabular-nums">{descMonto > 0 ? <span className="text-destructive">-{fmt(descMonto)}</span> : '—'}</td>
                          <td className="text-right py-1.5 tabular-nums font-medium">{fmt(l.total)}</td>
                        </tr>
                      );
                    })}
                    {lineas.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-3 text-muted-foreground text-xs">Sin productos</td></tr>
                    )}
                  </tbody>
                </table>

                {/* Totals summary below lines */}
                <div className="flex justify-end mt-2">
                  <div className="text-[12px] space-y-0.5 min-w-[200px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmt(venta.subtotal)}</span></div>
                    {(venta.descuento_total ?? 0) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Descuento</span><span className="tabular-nums text-destructive">-{fmt(venta.descuento_total)}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="tabular-nums">{fmt(venta.iva_total)}</span></div>
                    <div className="flex justify-between font-bold border-t border-border pt-0.5"><span>Total</span><span className="tabular-nums">{fmt(venta.total)}</span></div>
                    {(venta.saldo_pendiente ?? 0) > 0 && (
                      <div className="flex justify-between text-warning font-medium"><span>Saldo pendiente</span><span className="tabular-nums">{fmt(venta.saldo_pendiente)}</span></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pagos */}
              <div>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Pagos recibidos</h4>
                {pagos.length > 0 ? (
                  <div className="space-y-1.5">
                    {pagos.map((p: any) => {
                      const cobro = p.cobros as any;
                      return (
                        <div key={p.id} className="bg-background border border-border rounded px-3 py-2 text-[12px]">
                          <div className="flex justify-between">
                            <span className="font-medium capitalize">{cobro?.metodo_pago ?? '—'}</span>
                            <span className="font-bold tabular-nums">{fmt(p.monto_aplicado)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-[11px]">
                            <span>{cobro?.referencia || '—'}</span>
                            <span>{fmtDate(cobro?.fecha)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-[12px] font-semibold pt-1 border-t border-border">
                      <span>Total pagado</span>
                      <span className="text-success tabular-nums">{fmt(pagos.reduce((s: number, p: any) => s + (p.monto_aplicado ?? 0), 0))}</span>
                    </div>
                  </div>
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
