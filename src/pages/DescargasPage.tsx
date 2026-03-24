import { useState, useEffect } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useDescargasListDesktop, useDescargaLineas, useDescargaCalculos, DescargaLinea } from '@/hooks/useDescargaRuta';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, CheckCircle2, XCircle, Clock, Eye, AlertTriangle, DollarSign, Plus, ArrowLeft, ShoppingCart, RotateCcw, CreditCard, Receipt, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pendiente: { label: 'Pendiente', icon: Clock, color: 'bg-amber-100 text-amber-700' },
  aprobada: { label: 'Aprobada', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  rechazada: { label: 'Rechazada', icon: XCircle, color: 'bg-destructive/10 text-destructive' },
};

const MOTIVO_LABELS: Record<string, string> = {
  error_entrega: 'Error de entrega',
  merma: 'Merma',
  danado: 'Dañado',
  faltante: 'Faltante',
  sobrante: 'Sobrante',
  otro: 'Otro',
};

const MOTIVOS = [
  { value: 'error_entrega', label: 'Error de entrega' },
  { value: 'merma', label: 'Merma' },
  { value: 'danado', label: 'Dañado' },
  { value: 'faltante', label: 'Faltante' },
  { value: 'sobrante', label: 'Sobrante' },
  { value: 'otro', label: 'Otro' },
];

/* ─── Section Card helper ─── */
function SectionCard({ title, icon: Icon, children, className }: { title: string; icon: React.ElementType; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border-t border-border", className)}>
      <div className="px-5 py-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4" /> {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

/* ─── Detail / Approve panel — Full activity breakdown ─── */

function DescargaDetalle({ descarga, onClose }: { descarga: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: lineas } = useDescargaLineas(descarga.id);
  const [notasSupervisor, setNotasSupervisor] = useState('');

  const fInicio = descarga.fecha_inicio || descarga.fecha;
  const fFin = descarga.fecha_fin || descarga.fecha;

  // All ventas (including cancelled)
  const { data: ventasDia } = useQuery({
    queryKey: ['descarga-ventas-full', descarga.vendedor_id, descarga.empresa_id, fInicio, fFin],
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, total, condicion_pago, status, clientes(nombre), venta_lineas(producto_id, cantidad, precio_unitario, total, productos(nombre, codigo))')
        .eq('empresa_id', descarga.empresa_id)
        .gte('fecha', fInicio)
        .lte('fecha', fFin)
        .order('created_at', { ascending: true });
      if (descarga.vendedor_id) q = q.eq('vendedor_id', descarga.vendedor_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Devoluciones
  const { data: devoluciones } = useQuery({
    queryKey: ['descarga-devoluciones', descarga.vendedor_id, descarga.empresa_id, fInicio, fFin],
    queryFn: async () => {
      let q = supabase
        .from('devoluciones')
        .select('id, fecha, tipo, notas, clientes(nombre), devolucion_lineas(producto_id, cantidad, motivo, productos(nombre, codigo))')
        .eq('empresa_id', descarga.empresa_id)
        .gte('fecha', fInicio)
        .lte('fecha', fFin);
      if (descarga.vendedor_id) q = q.eq('vendedor_id', descarga.vendedor_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Cobros recibidos
  const { data: cobros } = useQuery({
    queryKey: ['descarga-cobros', descarga.vendedor_id, descarga.empresa_id, fInicio, fFin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobros')
        .select('id, monto, metodo_pago, fecha, clientes(nombre), referencia')
        .eq('empresa_id', descarga.empresa_id)
        .gte('fecha', fInicio)
        .lte('fecha', fFin)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Gastos
  const { data: gastos } = useQuery({
    queryKey: ['descarga-gastos-full', descarga.vendedor_id, descarga.empresa_id, fInicio, fFin],
    queryFn: async () => {
      let q = supabase
        .from('gastos')
        .select('id, monto, concepto, fecha, notas')
        .eq('empresa_id', descarga.empresa_id)
        .gte('fecha', fInicio)
        .lte('fecha', fFin);
      if (descarga.vendedor_id) q = q.eq('vendedor_id', descarga.vendedor_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Computed values
  const ventasActivas = (ventasDia || []).filter((v: any) => v.status !== 'cancelado');
  const ventasCanceladas = (ventasDia || []).filter((v: any) => v.status === 'cancelado');
  const ventasContado = ventasActivas.filter((v: any) => v.condicion_pago === 'contado');
  const ventasCredito = ventasActivas.filter((v: any) => v.condicion_pago === 'credito');

  const totalContado = ventasContado.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalCredito = ventasCredito.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalCancelado = ventasCanceladas.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalVentasGeneral = ventasActivas.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);

  const totalGastos = (gastos || []).reduce((s: number, g: any) => s + (Number(g.monto) || 0), 0);
  const totalCobros = (cobros || []).reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0);

  // Cobros by payment method
  const cobrosPorMetodo: Record<string, number> = {};
  (cobros || []).forEach((c: any) => {
    const m = c.metodo_pago || 'efectivo';
    cobrosPorMetodo[m] = (cobrosPorMetodo[m] || 0) + Number(c.monto);
  });

  // Aggregate products sold
  const productosSold: Record<string, { nombre: string; codigo: string; cantidad: number; total: number }> = {};
  ventasActivas.forEach((v: any) => {
    (v.venta_lineas || []).forEach((l: any) => {
      const pid = l.producto_id;
      if (!pid) return;
      if (!productosSold[pid]) {
        productosSold[pid] = {
          nombre: l.productos?.nombre || '—',
          codigo: l.productos?.codigo || '',
          cantidad: 0,
          total: 0,
        };
      }
      productosSold[pid].cantidad += Number(l.cantidad) || 0;
      productosSold[pid].total += Number(l.total) || 0;
    });
  });
  const productosArr = Object.values(productosSold).sort((a, b) => b.total - a.total);

  // Devoluciones summary
  const devLineas: { nombre: string; codigo: string; cantidad: number; motivo: string }[] = [];
  (devoluciones || []).forEach((d: any) => {
    (d.devolucion_lineas || []).forEach((l: any) => {
      devLineas.push({
        nombre: l.productos?.nombre || '—',
        codigo: l.productos?.codigo || '',
        cantidad: Number(l.cantidad),
        motivo: l.motivo || '—',
      });
    });
  });

  const conDiferencias = (lineas || []).filter((l: any) => Number(l.diferencia) !== 0);
  const isPendiente = descarga.status === 'pendiente';
  const dif = Number(descarga.diferencia_efectivo);

  // Effective cash expected: contado sales + cobros efectivo - gastos
  const efectivoSistema = totalContado + (cobrosPorMetodo['efectivo'] || 0) - totalGastos;

  const aprobarMutation = useMutation({
    mutationFn: async (accion: 'aprobada' | 'rechazada') => {
      if (accion === 'rechazada' && !notasSupervisor.trim()) {
        throw new Error('Agrega una nota antes de rechazar');
      }
      const { error } = await supabase
        .from('descarga_ruta')
        .update({
          status: accion,
          aprobado_por: user!.id,
          fecha_aprobacion: new Date().toISOString(),
          notas_supervisor: notasSupervisor || null,
        } as any)
        .eq('id', descarga.id);
      if (error) throw error;
    },
    onSuccess: (_, accion) => {
      toast.success(accion === 'aprobada' ? 'Liquidación aprobada' : 'Liquidación rechazada');
      qc.invalidateQueries({ queryKey: ['descargas-list'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg max-w-5xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <PackageCheck className="h-5 w-5" /> Revisión completa de liquidación
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(descarga as any).vendedores?.nombre ?? 'Sin vendedor'} — {
                descarga.fecha_inicio && descarga.fecha_fin && descarga.fecha_inicio !== descarga.fecha_fin
                  ? `${descarga.fecha_inicio} al ${descarga.fecha_fin}`
                  : descarga.fecha
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const s = STATUS_MAP[descarga.status] || STATUS_MAP.pendiente;
              return (
                <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold", s.color)}>
                  <s.icon className="h-3 w-3" /> {s.label}
                </span>
              );
            })()}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg px-2">✕</button>
          </div>
        </div>

        {/* ═══ RESUMEN GENERAL ═══ */}
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Ventas contado</div>
              <div className="text-lg font-bold text-foreground">${totalContado.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">{ventasContado.length} ventas</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Ventas crédito</div>
              <div className="text-lg font-bold text-foreground">${totalCredito.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">{ventasCredito.length} ventas</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Cobros recibidos</div>
              <div className="text-lg font-bold text-foreground">${totalCobros.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">{(cobros || []).length} cobros</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Gastos</div>
              <div className="text-lg font-bold text-destructive">-${totalGastos.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">{(gastos || []).length} gastos</div>
            </div>
            {ventasCanceladas.length > 0 && (
              <div className="bg-destructive/5 rounded-lg p-3 text-center border border-destructive/20">
                <div className="text-[10px] text-muted-foreground uppercase">Canceladas</div>
                <div className="text-lg font-bold text-destructive">${totalCancelado.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">{ventasCanceladas.length} ventas</div>
              </div>
            )}
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Devoluciones</div>
              <div className="text-lg font-bold text-foreground">{devLineas.length}</div>
              <div className="text-[10px] text-muted-foreground">productos devueltos</div>
            </div>
          </div>
        </div>

        {/* ═══ CUADRE DE EFECTIVO ═══ */}
        <SectionCard title="Cuadre de efectivo" icon={DollarSign}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Vendor declared */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase">Declarado por vendedor</div>
              <div className="bg-muted/50 rounded-md p-3">
                <div className="text-[10px] text-muted-foreground">Efectivo entregado</div>
                <div className="text-xl font-bold text-foreground">${Number(descarga.efectivo_entregado).toFixed(2)}</div>
              </div>
              {descarga.notas && (
                <div className="bg-muted/30 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Observaciones</div>
                  <p className="text-[13px] text-foreground">{descarga.notas}</p>
                </div>
              )}
            </div>
            {/* System calculated */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase">Calculado por sistema</div>
              <div className="bg-muted/50 rounded-md p-3 space-y-1.5 text-[12px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Ventas contado</span><span className="font-semibold">${totalContado.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">+ Cobros en efectivo</span><span className="font-semibold">${(cobrosPorMetodo['efectivo'] || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">− Gastos</span><span className="font-semibold text-destructive">-${totalGastos.toFixed(2)}</span></div>
                <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                  <span>Efectivo esperado</span>
                  <span>${efectivoSistema.toFixed(2)}</span>
                </div>
              </div>
              {/* Difference */}
              {(() => {
                const d = Number(descarga.efectivo_entregado) - efectivoSistema;
                return (
                  <div className={cn(
                    "rounded-md p-3 text-center",
                    d > 0 ? "bg-green-50 border border-green-200" : d < 0 ? "bg-destructive/5 border border-destructive/20" : "bg-muted/50"
                  )}>
                    <div className="text-[10px] text-muted-foreground uppercase">Diferencia</div>
                    <div className={cn("text-lg font-bold", d > 0 ? "text-green-600" : d < 0 ? "text-destructive" : "text-foreground")}>
                      {d > 0 ? '+' : ''}${d.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{d > 0 ? 'Sobra' : d < 0 ? 'Falta' : 'Cuadra'}</div>
                  </div>
                );
              })()}
            </div>
          </div>
        </SectionCard>

        {/* ═══ VENTAS DEL PERIODO ═══ */}
        <SectionCard title={`Ventas del periodo (${ventasActivas.length})`} icon={ShoppingCart}>
          {ventasActivas.length > 0 ? (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2">Folio</th>
                  <th className="text-left py-2">Cliente</th>
                  <th className="text-left py-2">Pago</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {ventasActivas.map((v: any) => (
                  <tr key={v.id} className="border-b border-border/50">
                    <td className="py-1.5 font-mono text-foreground">{v.folio ?? '—'}</td>
                    <td className="py-1.5">{v.clientes?.nombre ?? '—'}</td>
                    <td className="py-1.5">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                        v.condicion_pago === 'contado' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                      )}>{v.condicion_pago}</span>
                    </td>
                    <td className="py-1.5 text-[10px] text-muted-foreground">{v.status}</td>
                    <td className="py-1.5 text-right font-semibold">${Number(v.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-bold text-[12px]">
                  <td colSpan={4} className="py-2 text-right text-muted-foreground">Total ventas activas:</td>
                  <td className="py-2 text-right">${totalVentasGeneral.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          ) : <p className="text-sm text-muted-foreground">Sin ventas en este periodo</p>}

          {/* Cancelled sales */}
          {ventasCanceladas.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-semibold text-destructive uppercase mb-2">Ventas canceladas ({ventasCanceladas.length})</div>
              <div className="space-y-1">
                {ventasCanceladas.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between bg-destructive/5 rounded px-3 py-1.5 text-[12px]">
                    <span className="font-mono">{v.folio ?? '—'}</span>
                    <span>{v.clientes?.nombre ?? '—'}</span>
                    <span className="font-semibold text-destructive line-through">${Number(v.total).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ═══ PRODUCTOS VENDIDOS (AGREGADO) ═══ */}
        {productosArr.length > 0 && (
          <SectionCard title={`Productos vendidos (${productosArr.length})`} icon={PackageCheck}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2">Producto</th>
                  <th className="text-left py-2">Código</th>
                  <th className="text-right py-2">Cantidad</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {productosArr.map((p, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 font-medium">{p.nombre}</td>
                    <td className="py-1.5 font-mono text-muted-foreground">{p.codigo}</td>
                    <td className="py-1.5 text-right">{p.cantidad}</td>
                    <td className="py-1.5 text-right font-semibold">${p.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}

        {/* ═══ COBROS RECIBIDOS ═══ */}
        {(cobros || []).length > 0 && (
          <SectionCard title={`Cobros recibidos (${(cobros || []).length})`} icon={CreditCard}>
            {/* By method summary */}
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(cobrosPorMetodo).map(([metodo, total]) => (
                <div key={metodo} className="bg-muted/50 rounded-md px-3 py-2 text-[12px]">
                  <span className="text-muted-foreground capitalize">{metodo}:</span>{' '}
                  <span className="font-bold">${total.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2">Cliente</th>
                  <th className="text-left py-2">Método</th>
                  <th className="text-left py-2">Referencia</th>
                  <th className="text-right py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {(cobros || []).map((c: any) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="py-1.5">{c.clientes?.nombre ?? '—'}</td>
                    <td className="py-1.5 capitalize">{c.metodo_pago}</td>
                    <td className="py-1.5 text-muted-foreground font-mono">{c.referencia || '—'}</td>
                    <td className="py-1.5 text-right font-semibold">${Number(c.monto).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-bold">
                  <td colSpan={3} className="py-2 text-right text-muted-foreground">Total cobros:</td>
                  <td className="py-2 text-right">${totalCobros.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </SectionCard>
        )}

        {/* ═══ GASTOS ═══ */}
        {(gastos || []).length > 0 && (
          <SectionCard title={`Gastos (${(gastos || []).length})`} icon={TrendingDown}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2">Concepto</th>
                  <th className="text-left py-2">Notas</th>
                  <th className="text-right py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {(gastos || []).map((g: any) => (
                  <tr key={g.id} className="border-b border-border/50">
                    <td className="py-1.5 font-medium">{g.concepto}</td>
                    <td className="py-1.5 text-muted-foreground">{g.notas || '—'}</td>
                    <td className="py-1.5 text-right font-semibold text-destructive">-${Number(g.monto).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-bold">
                  <td colSpan={2} className="py-2 text-right text-muted-foreground">Total gastos:</td>
                  <td className="py-2 text-right text-destructive">-${totalGastos.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </SectionCard>
        )}

        {/* ═══ DEVOLUCIONES ═══ */}
        {devLineas.length > 0 && (
          <SectionCard title={`Devoluciones (${devLineas.length} productos)`} icon={RotateCcw}>
            <div className="space-y-1">
              {devLineas.map((d, i) => (
                <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 text-[12px]">
                  <div>
                    <span className="font-medium">{d.nombre}</span>
                    <span className="text-muted-foreground font-mono ml-2">{d.codigo}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{d.motivo}</span>
                    <span className="font-bold">{d.cantidad}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ═══ PRODUCTOS DEVUELTOS (Descarga lineas) ═══ */}
        {(lineas || []).length > 0 && (
          <SectionCard title="Cuadre de productos (carga)" icon={PackageCheck}>
            <div className="space-y-1">
              {(lineas || []).map((l: any) => {
                const d = Number(l.diferencia);
                return (
                  <div key={l.id} className={cn(
                    "flex items-center justify-between rounded px-3 py-1.5 text-[12px]",
                    d !== 0 ? "bg-amber-50 border border-amber-200" : "bg-muted/30"
                  )}>
                    <span className="font-medium">{(l as any).productos?.nombre}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">Esp: {Number(l.cantidad_esperada)}</span>
                      <span className="font-bold">Real: {Number(l.cantidad_real)}</span>
                      {d !== 0 && (
                        <span className={cn("font-bold", d > 0 ? "text-green-600" : "text-destructive")}>
                          {d > 0 ? '+' : ''}{d}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ═══ ADMIN ACTIONS ═══ */}
        {isPendiente && (
          <div className="p-5 border-t border-border space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Notas del administrador</label>
              <textarea
                value={notasSupervisor}
                onChange={e => setNotasSupervisor(e.target.value)}
                placeholder="Observaciones sobre esta liquidación..."
                className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => aprobarMutation.mutate('aprobada')} disabled={aprobarMutation.isPending} className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar liquidación
              </Button>
              <Button variant="outline" onClick={() => aprobarMutation.mutate('rechazada')} disabled={aprobarMutation.isPending}
                className="flex-1 border-destructive text-destructive hover:bg-destructive/10">
                <XCircle className="h-4 w-4 mr-1" /> Rechazar con nota
              </Button>
            </div>
          </div>
        )}

        {descarga.notas_supervisor && !isPendiente && (
          <div className="px-5 py-3 border-t border-border">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">Notas del administrador</div>
            <p className="text-[13px] text-foreground">{descarga.notas_supervisor}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── New Descarga Form (Desktop) ─── */

function NuevaDescargaForm({ onClose }: { onClose: () => void }) {
  const { user, empresa } = useAuth();
  const qc = useQueryClient();
  const [selectedCargaId, setSelectedCargaId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<DescargaLinea[]>([]);
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [notas, setNotas] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Fetch cargas en_ruta / completada
  const { data: cargas } = useQuery({
    queryKey: ['cargas-para-descarga', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargas')
        .select('*, vendedores!cargas_vendedor_id_fkey(nombre)')
        .eq('empresa_id', empresa!.id)
        .in('status', ['en_ruta', 'completada'])
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { lineas: lineasBase, efectivoEsperado, ventasContado, gastosTotal } = useDescargaCalculos(selectedCargaId);

  const lineasBaseJson = JSON.stringify(lineasBase.map(l => l.producto_id));
  useEffect(() => {
    if (lineasBase.length > 0) {
      setLineas(lineasBase);
    } else {
      setLineas([]);
    }
  }, [lineasBaseJson]);

  const updateLinea = (idx: number, field: keyof DescargaLinea, value: any) => {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === 'cantidad_real') {
        updated.diferencia = Number(value) - updated.cantidad_esperada;
      }
      return updated;
    }));
  };

  const hayDiferencias = lineas.some(l => l.diferencia !== 0) ||
    (efectivoEntregado !== '' && Number(efectivoEntregado) !== efectivoEsperado);

  const selectedCarga = cargas?.find((c: any) => c.id === selectedCargaId);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (selectedCargaId) {
        const sinMotivo = lineas.filter(l => l.diferencia !== 0 && !l.motivo);
        if (sinMotivo.length > 0) throw new Error('Todas las diferencias necesitan un motivo');
      }

      const efectivoReal = efectivoEntregado !== '' ? Number(efectivoEntregado) : efectivoEsperado;

      const insertData: any = {
        empresa_id: empresa!.id,
        user_id: user!.id,
        efectivo_esperado: efectivoEsperado,
        efectivo_entregado: efectivoReal,
        diferencia_efectivo: efectivoReal - efectivoEsperado,
        notas: notas || null,
      };

      if (selectedCargaId) {
        insertData.carga_id = selectedCargaId;
        insertData.vendedor_id = (selectedCarga as any)?.vendedor_id ?? null;
      }

      if (fechaInicio) insertData.fecha_inicio = fechaInicio;
      if (fechaFin) insertData.fecha_fin = fechaFin;

      const { data: descarga, error } = await supabase
        .from('descarga_ruta')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;

      if (lineas.length > 0) {
        const lineItems = lineas.map(l => ({
          descarga_id: descarga.id,
          producto_id: l.producto_id,
          cantidad_esperada: l.cantidad_esperada,
          cantidad_real: l.cantidad_real,
          diferencia: l.diferencia,
          motivo: l.diferencia !== 0 ? l.motivo : null,
          notas: l.notas || null,
        }));
        const { error: lErr } = await supabase.from('descarga_ruta_lineas').insert(lineItems as any);
        if (lErr) throw lErr;
      }
    },
    onSuccess: () => {
      toast.success(hayDiferencias ? 'Descarga enviada para aprobación' : 'Descarga completada');
      qc.invalidateQueries({ queryKey: ['descargas-list'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const diferenciaEfectivo = efectivoEntregado !== '' ? Number(efectivoEntregado) - efectivoEsperado : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-bold text-foreground">Nueva liquidación de ruta</h2>
      </div>

      {/* Step 1: Select carga (optional) */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">1. Selecciona la carga (opcional)</h3>
        <p className="text-xs text-muted-foreground mb-3">Si no hay carga o solo liquidas efectivo, puedes dejarlo sin seleccionar.</p>
        {!cargas || cargas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cargas activas</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cargas.map((c: any) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCargaId(prev => prev === c.id ? null : c.id);
                  setLineas([]);
                  setEfectivoEntregado('');
                }}
                className={cn(
                  "border rounded-lg p-3 text-left transition-colors",
                  selectedCargaId === c.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="text-[13px] font-semibold text-foreground">{(c as any).vendedores?.nombre ?? 'Sin vendedor'}</div>
                <div className="text-[11px] text-muted-foreground">Fecha: {c.fecha} — {c.status}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Date range (optional) */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Periodo (opcional)</h3>
        <p className="text-xs text-muted-foreground mb-3">Para liquidaciones semanales o por rango de fechas.</p>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Desde</label>
            <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Hasta</label>
            <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Cash reconciliation — always visible */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> 2. Cuadre de efectivo
        </h3>
        {selectedCargaId && (
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <div className="bg-muted/50 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Ventas contado</div>
              <div className="font-bold text-foreground">${ventasContado.toFixed(2)}</div>
            </div>
            <div className="bg-muted/50 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Gastos</div>
              <div className="font-bold text-destructive">-${gastosTotal.toFixed(2)}</div>
            </div>
            <div className="bg-primary/5 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Esperado</div>
              <div className="font-bold text-primary">${efectivoEsperado.toFixed(2)}</div>
            </div>
          </div>
        )}
        <div className="max-w-xs">
          <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Efectivo entregado</label>
          <Input
            type="number"
            value={efectivoEntregado}
            onChange={e => setEfectivoEntregado(e.target.value)}
            placeholder={selectedCargaId ? efectivoEsperado.toFixed(2) : '0.00'}
          />
        </div>
        {diferenciaEfectivo !== 0 && (
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-md text-[12px] font-semibold max-w-xs",
            diferenciaEfectivo > 0 ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"
          )}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Diferencia: {diferenciaEfectivo > 0 ? '+' : ''}${diferenciaEfectivo.toFixed(2)}
          </div>
        )}
      </div>

      {/* Product reconciliation — only when carga selected */}
      {selectedCargaId && lineas.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> 3. Cuadre de productos
          </h3>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                <th className="text-left py-2 px-2">Producto</th>
                <th className="text-center py-2 px-1 w-16">Cargado</th>
                <th className="text-center py-2 px-1 w-16">Vendido</th>
                <th className="text-center py-2 px-1 w-16">Devuelto</th>
                <th className="text-center py-2 px-1 w-16">Esperado</th>
                <th className="text-center py-2 px-1 w-20">Real</th>
                <th className="text-center py-2 px-1 w-14">Dif.</th>
                <th className="text-left py-2 px-1 w-32">Motivo</th>
                <th className="text-left py-2 px-1">Notas</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, idx) => (
                <tr key={l.producto_id} className={cn("border-b border-border/50", l.diferencia !== 0 && "bg-amber-50/50")}>
                  <td className="py-2 px-2">
                    <div className="font-medium text-foreground">{l.producto_nombre}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{l.producto_codigo}</div>
                  </td>
                  <td className="py-2 px-1 text-center text-muted-foreground">{l.cantidad_cargada}</td>
                  <td className="py-2 px-1 text-center text-muted-foreground">{l.cantidad_vendida}</td>
                  <td className="py-2 px-1 text-center text-muted-foreground">{l.cantidad_devuelta}</td>
                  <td className="py-2 px-1 text-center font-semibold">{l.cantidad_esperada}</td>
                  <td className="py-2 px-1">
                    <Input
                      type="number"
                      value={l.cantidad_real}
                      onChange={e => updateLinea(idx, 'cantidad_real', Number(e.target.value) || 0)}
                      className="h-7 text-[12px] text-center w-16 mx-auto"
                    />
                  </td>
                  <td className={cn(
                    "py-2 px-1 text-center font-bold",
                    l.diferencia > 0 ? "text-green-600" : l.diferencia < 0 ? "text-destructive" : ""
                  )}>
                    {l.diferencia > 0 ? '+' : ''}{l.diferencia}
                  </td>
                  <td className="py-2 px-1">
                    {l.diferencia !== 0 ? (
                      <SearchableSelect
                        options={MOTIVOS}
                        value={l.motivo || ''}
                        onChange={val => updateLinea(idx, 'motivo', val || null)}
                        placeholder="Motivo..."
                      />
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 px-1">
                    {l.diferencia !== 0 ? (
                      <Input
                        value={l.notas || ''}
                        onChange={e => updateLinea(idx, 'notas', e.target.value)}
                        placeholder="Detalle..."
                        className="h-7 text-[11px]"
                      />
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes & submit */}
      <div className="bg-card border border-border rounded-lg p-5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Notas generales</label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Observaciones sobre la descarga..."
          className="input-odoo min-h-[60px] text-[13px] w-full"
        />
      </div>

      <Button
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || efectivoEntregado === ''}
        className="w-full sm:w-auto"
      >
        <PackageCheck className="h-4 w-4 mr-2" />
        {hayDiferencias ? 'Enviar para aprobación' : 'Completar descarga'}
      </Button>
    </div>
  );
}

/* ─── Main Page ─── */

export default function DescargasPage() {
  const { data: descargas, isLoading } = useDescargasListDesktop();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<'liquidaciones' | 'reporte'>('liquidaciones');

  const filtered = (descargas || []).filter((d: any) =>
    filterStatus === 'all' || d.status === filterStatus
  );

  const selectedDescarga = descargas?.find((d: any) => d.id === selectedId);

  if (showNew) {
    return (
      <div className="p-4">
        <NuevaDescargaForm onClose={() => setShowNew(false)} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <PackageCheck className="h-5 w-5" /> Liquidar Ruta
          <HelpButton title={HELP.descargas.title} sections={HELP.descargas.sections} />
        </h1>
        {tab === 'liquidaciones' && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {['all', 'pendiente', 'aprobada', 'rechazada'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                    filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s === 'all' ? 'Todas' : STATUS_MAP[s]?.label || s}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Nueva liquidación
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('liquidaciones')}
          className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px",
            tab === 'liquidaciones' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <PackageCheck className="h-3.5 w-3.5 inline mr-1.5" />Liquidaciones
        </button>
        <button
          onClick={() => setTab('reporte')}
          className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px",
            tab === 'reporte' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <FileBarChart className="h-3.5 w-3.5 inline mr-1.5" />Reporte diario
        </button>
      </div>

      {tab === 'reporte' ? (
        <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>}>
          <ReporteDiarioRuta />
        </Suspense>
      ) : (
        <>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <PackageCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay liquidaciones</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowNew(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Crear primera liquidación
              </Button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-2.5 px-4">Fecha / Periodo</th>
                    <th className="text-left py-2.5 px-4">Vendedor</th>
                    <th className="text-left py-2.5 px-4">Tipo</th>
                    <th className="text-right py-2.5 px-4">Esperado</th>
                    <th className="text-right py-2.5 px-4">Entregado</th>
                    <th className="text-right py-2.5 px-4">Diferencia</th>
                    <th className="text-center py-2.5 px-4">Status</th>
                    <th className="text-center py-2.5 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d: any) => {
                    const s = STATUS_MAP[d.status] || STATUS_MAP.pendiente;
                    const dif = Number(d.diferencia_efectivo);
                    const hasRange = d.fecha_inicio && d.fecha_fin && d.fecha_inicio !== d.fecha_fin;
                    const tipoLabel = d.carga_id ? 'Carga' : hasRange ? 'Periodo' : 'Efectivo';
                    return (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-4">
                          {hasRange ? `${d.fecha_inicio} → ${d.fecha_fin}` : d.fecha}
                        </td>
                        <td className="py-2.5 px-4 font-medium">{(d as any).vendedores?.nombre ?? '—'}</td>
                        <td className="py-2.5 px-4">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted font-medium">{tipoLabel}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right">${Number(d.efectivo_esperado).toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold">${Number(d.efectivo_entregado).toFixed(2)}</td>
                        <td className={cn(
                          "py-2.5 px-4 text-right font-bold",
                          dif > 0 ? "text-green-600" : dif < 0 ? "text-destructive" : ""
                        )}>
                          {dif > 0 ? '+' : ''}${dif.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", s.color)}>
                            <s.icon className="h-3 w-3" /> {s.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedId(d.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selectedDescarga && (
        <DescargaDetalle descarga={selectedDescarga} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
