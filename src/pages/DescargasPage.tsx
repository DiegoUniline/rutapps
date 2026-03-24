import { useState, useEffect } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useDescargasListDesktop, useDescargaDetalle, useDescargaLineas, useDescargaCalculos, DescargaLinea } from '@/hooks/useDescargaRuta';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, CheckCircle2, XCircle, Clock, Eye, AlertTriangle, DollarSign, Plus, ArrowLeft, ShoppingCart, RotateCcw, CreditCard, Receipt, TrendingDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';
import { generarLiquidacionPdf, type LiquidacionPdfParams } from '@/lib/liquidacionPdf';
import { loadLogoBase64 } from '@/lib/pdfStyleOdoo';
import { buildLiquidacionTicketHTML } from '@/lib/liquidacionTicketHtml';
import { toPng } from 'html-to-image';

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
  const { user, empresa } = useAuth();
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

  // Cobros recibidos — filter by user_id (auth uuid from profile)
  const { data: vendedorProfile } = useQuery({
    queryKey: ['vendedor-profile', descarga.vendedor_id],
    enabled: !!descarga.vendedor_id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id').eq('id', descarga.vendedor_id).single();
      return data;
    },
  });

  const { data: cobros } = useQuery({
    queryKey: ['descarga-cobros', descarga.vendedor_id, descarga.empresa_id, fInicio, fFin, vendedorProfile?.user_id],
    enabled: !!vendedorProfile?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobros')
        .select('id, monto, metodo_pago, fecha, clientes(nombre), referencia')
        .eq('empresa_id', descarga.empresa_id)
        .eq('user_id', vendedorProfile!.user_id)
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
                  ? `${fmtDate(descarga.fecha_inicio)} al ${fmtDate(descarga.fecha_fin)}`
                  : fmtDate(descarga.fecha)
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
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={async () => {
              try {
                const logo = empresa?.logo_url ? await loadLogoBase64(empresa.logo_url) : null;
                const blob = generarLiquidacionPdf({
                  empresa: {
                    nombre: empresa?.nombre ?? '', razon_social: empresa?.razon_social, rfc: empresa?.rfc,
                    direccion: empresa?.direccion, colonia: empresa?.colonia, ciudad: empresa?.ciudad,
                    estado: empresa?.estado, cp: empresa?.cp, telefono: empresa?.telefono, email: empresa?.email,
                  },
                  logoBase64: logo,
                  vendedorNombre: (descarga as any).vendedores?.nombre ?? 'Sin vendedor',
                  fecha: descarga.fecha,
                  fechaInicio: fInicio,
                  fechaFin: fFin,
                  status: descarga.status,
                  efectivoEntregado: Number(descarga.efectivo_entregado) || 0,
                  notas: descarga.notas,
                  notasSupervisor: descarga.notas_supervisor,
                  ventas: ventasActivas.map((v: any) => ({
                    folio: v.folio ?? '—', cliente: v.clientes?.nombre ?? '—',
                    condicion: v.condicion_pago, status: v.status, total: Number(v.total) || 0,
                  })),
                  ventasCanceladas: ventasCanceladas.map((v: any) => ({
                    folio: v.folio ?? '—', cliente: v.clientes?.nombre ?? '—', total: Number(v.total) || 0,
                  })),
                  productos: productosArr.map(p => ({
                    codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad, total: p.total,
                  })),
                  cobros: (cobros || []).map((c: any) => ({
                    cliente: c.clientes?.nombre ?? '—', metodo: c.metodo_pago ?? 'efectivo',
                    referencia: c.referencia || '', monto: Number(c.monto) || 0,
                  })),
                  gastos: (gastos || []).map((g: any) => ({
                    concepto: g.concepto ?? '—', notas: g.notas || '', monto: Number(g.monto) || 0,
                  })),
                  devoluciones: devLineas,
                  cuadre: {
                    totalContado, totalCredito,
                    cobrosEfectivo: cobrosPorMetodo['efectivo'] || 0,
                    totalGastos, efectivoEsperado: efectivoSistema,
                    diferencia: Number(descarga.efectivo_entregado) - efectivoSistema,
                  },
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Liquidacion-${(descarga as any).vendedores?.nombre ?? 'vendedor'}-${fInicio}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Documento generado');
              } catch (e: any) {
                toast.error('Error al generar documento: ' + e.message);
              }
            }}>
              <FileText className="h-3.5 w-3.5" /> Documento
            </Button>
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
        <SectionCard title={`Productos vendidos (${productosArr.length})`} icon={PackageCheck}>
          {productosArr.length > 0 ? (
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
          ) : <p className="text-sm text-muted-foreground">Sin productos vendidos en este periodo</p>}
        </SectionCard>

        {/* ═══ COBROS RECIBIDOS ═══ */}
        <SectionCard title={`Cobros recibidos (${(cobros || []).length})`} icon={CreditCard}>
          {(cobros || []).length > 0 ? (
            <>
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
            </>
          ) : <p className="text-sm text-muted-foreground">Sin cobros en este periodo</p>}
        </SectionCard>

        {/* ═══ GASTOS ═══ */}
        <SectionCard title={`Gastos (${(gastos || []).length})`} icon={TrendingDown}>
          {(gastos || []).length > 0 ? (
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
          ) : <p className="text-sm text-muted-foreground">Sin gastos en este periodo</p>}
        </SectionCard>

        {/* ═══ DEVOLUCIONES ═══ */}
        <SectionCard title={`Devoluciones (${devLineas.length} productos)`} icon={RotateCcw}>
          {devLineas.length > 0 ? (
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
          ) : <p className="text-sm text-muted-foreground">Sin devoluciones en este periodo</p>}
        </SectionCard>

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
  const [vendedorId, setVendedorId] = useState<string>('');
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [notas, setNotas] = useState('');
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().slice(0, 10));

  // All active users
  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-liquidar', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, user_id, nombre')
        .eq('empresa_id', empresa!.id)
        .eq('estado', 'activo')
        .order('nombre');
      return (data ?? []) as { id: string; user_id: string; nombre: string }[];
    },
  });

  const usuarioOpts = (usuarios || []).map(u => ({ value: u.id, label: u.nombre }));
  const selectedProfile = (usuarios || []).find(u => u.id === vendedorId);
  const selectedUserId = selectedProfile?.user_id ?? vendedorId;

  // Calculate expected cash for the period
  const canCalc = !!empresa?.id && !!vendedorId && !!fechaInicio && !!fechaFin;

  // ── Detail queries for preview ──
  const { data: ventasPreview } = useQuery({
    queryKey: ['liquidar-ventas', empresa?.id, vendedorId, fechaInicio, fechaFin],
    enabled: canCalc,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ventas')
        .select('id, folio, total, condicion_pago, status, clientes(nombre), venta_lineas(producto_id, cantidad, precio_unitario, total, productos(nombre, codigo))')
        .eq('empresa_id', empresa!.id)
        .eq('vendedor_id', vendedorId)
        .neq('status', 'cancelado')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .order('created_at', { ascending: true });
      return data ?? [];
    },
  });

  const { data: cobrosPreview } = useQuery({
    queryKey: ['liquidar-cobros', empresa?.id, selectedUserId, fechaInicio, fechaFin],
    enabled: canCalc && !!selectedUserId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('cobros')
        .select('id, monto, metodo_pago, fecha, clientes(nombre), referencia')
        .eq('empresa_id', empresa!.id)
        .eq('user_id', selectedUserId)
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .order('created_at', { ascending: true });
      return data ?? [];
    },
  });

  const { data: gastosPreview } = useQuery({
    queryKey: ['liquidar-gastos', empresa?.id, vendedorId, fechaInicio, fechaFin],
    enabled: canCalc,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('gastos')
        .select('id, monto, concepto, fecha, notas')
        .eq('empresa_id', empresa!.id)
        .eq('vendedor_id', vendedorId)
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin);
      return data ?? [];
    },
  });

  // Computed from detail queries
  const ventasContadoArr = (ventasPreview || []).filter((v: any) => v.condicion_pago === 'contado');
  const totalContado = ventasContadoArr.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalCobros = (cobrosPreview || []).reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0);
  const cobrosEfectivoTotal = (cobrosPreview || []).filter((c: any) => c.metodo_pago === 'efectivo').reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0);
  const totalGastos = (gastosPreview || []).reduce((s: number, g: any) => s + (Number(g.monto) || 0), 0);
  const efectivoEsperado = totalContado + cobrosEfectivoTotal - totalGastos;

  // Aggregate products
  const productosSold: Record<string, { nombre: string; codigo: string; cantidad: number; total: number }> = {};
  (ventasPreview || []).forEach((v: any) => {
    (v.venta_lineas || []).forEach((l: any) => {
      const pid = l.producto_id;
      if (!pid) return;
      if (!productosSold[pid]) productosSold[pid] = { nombre: l.productos?.nombre || '—', codigo: l.productos?.codigo || '', cantidad: 0, total: 0 };
      productosSold[pid].cantidad += Number(l.cantidad) || 0;
      productosSold[pid].total += Number(l.total) || 0;
    });
  });
  const productosArr = Object.values(productosSold).sort((a, b) => b.total - a.total);

  const diferenciaEfectivo = efectivoEntregado !== '' ? Number(efectivoEntregado) - efectivoEsperado : 0;
  const hayDiferencias = efectivoEntregado !== '' && Number(efectivoEntregado) !== efectivoEsperado;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!vendedorId) throw new Error('Selecciona un usuario');
      if (efectivoEntregado === '') throw new Error('Ingresa el efectivo entregado');

      const efectivoReal = Number(efectivoEntregado);

      const insertData: any = {
        empresa_id: empresa!.id,
        user_id: user!.id,
        vendedor_id: vendedorId,
        efectivo_esperado: efectivoEsperado,
        efectivo_entregado: efectivoReal,
        diferencia_efectivo: efectivoReal - efectivoEsperado,
        notas: notas || null,
        fecha_inicio: fechaInicio || null,
        fecha_fin: fechaFin || null,
      };

      const { error } = await supabase
        .from('descarga_ruta')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(hayDiferencias ? 'Liquidación enviada para aprobación' : 'Liquidación completada');
      qc.invalidateQueries({ queryKey: ['descargas-list'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-bold text-foreground">Nueva liquidación de ruta</h2>
      </div>

      {/* Step 1: Select user and period */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">1. Usuario y periodo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Usuario a liquidar</label>
            <SearchableSelect
              options={usuarioOpts}
              value={vendedorId}
              onChange={val => { setVendedorId(val); setEfectivoEntregado(''); }}
              placeholder="Selecciona usuario..."
            />
          </div>
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

      {/* Step 2: Cash reconciliation */}
      {canCalc && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> 2. Cuadre de efectivo
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
            <div className="bg-muted/50 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Ventas contado</div>
              <div className="font-bold text-foreground">${totalContado.toFixed(2)}</div>
            </div>
            <div className="bg-muted/50 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Cobros efectivo</div>
              <div className="font-bold text-foreground">${cobrosEfectivoTotal.toFixed(2)}</div>
            </div>
            <div className="bg-muted/50 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Gastos</div>
              <div className="font-bold text-destructive">-${totalGastos.toFixed(2)}</div>
            </div>
            <div className="bg-primary/5 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Efectivo esperado</div>
              <div className="font-bold text-primary">${efectivoEsperado.toFixed(2)}</div>
            </div>
          </div>
          <div className="max-w-xs">
            <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Efectivo entregado</label>
            <Input
              type="number"
              value={efectivoEntregado}
              onChange={e => setEfectivoEntregado(e.target.value)}
              placeholder={efectivoEsperado.toFixed(2)}
            />
          </div>
          {diferenciaEfectivo !== 0 && (
            <div className={cn(
              "flex items-center gap-2 p-2 rounded-md text-[12px] font-semibold max-w-xs",
              diferenciaEfectivo > 0 ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : "bg-destructive/10 text-destructive"
            )}>
              <AlertTriangle className="h-3.5 w-3.5" />
              Diferencia: {diferenciaEfectivo > 0 ? '+' : ''}${diferenciaEfectivo.toFixed(2)}
            </div>
          )}
        </div>
      )}

      {/* ═══ DETALLE: Ventas del periodo ═══ */}
      {canCalc && (
        <SectionCard title={`Ventas del periodo (${(ventasPreview || []).length})`} icon={ShoppingCart} className="bg-card border border-border rounded-lg">
          {(ventasPreview || []).length > 0 ? (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2">Folio</th>
                  <th className="text-left py-2">Cliente</th>
                  <th className="text-left py-2">Pago</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {(ventasPreview || []).map((v: any) => (
                  <tr key={v.id} className="border-b border-border/50">
                    <td className="py-1.5 font-mono text-foreground">{v.folio ?? '—'}</td>
                    <td className="py-1.5">{v.clientes?.nombre ?? '—'}</td>
                    <td className="py-1.5">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                        v.condicion_pago === 'contado' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                      )}>{v.condicion_pago}</span>
                    </td>
                    <td className="py-1.5 text-right font-semibold">${Number(v.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-muted-foreground">Sin ventas en este periodo</p>}
        </SectionCard>
      )}

      {/* ═══ DETALLE: Productos vendidos ═══ */}
      {canCalc && productosArr.length > 0 && (
        <SectionCard title={`Productos vendidos (${productosArr.length})`} icon={PackageCheck} className="bg-card border border-border rounded-lg">
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

      {/* ═══ DETALLE: Cobros ═══ */}
      {canCalc && (
        <SectionCard title={`Cobros recibidos (${(cobrosPreview || []).length})`} icon={CreditCard} className="bg-card border border-border rounded-lg">
          {(cobrosPreview || []).length > 0 ? (
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
                {(cobrosPreview || []).map((c: any) => (
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
          ) : <p className="text-sm text-muted-foreground">Sin cobros en este periodo</p>}
        </SectionCard>
      )}

      {/* ═══ DETALLE: Gastos ═══ */}
      {canCalc && (
        <SectionCard title={`Gastos (${(gastosPreview || []).length})`} icon={TrendingDown} className="bg-card border border-border rounded-lg">
          {(gastosPreview || []).length > 0 ? (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2">Concepto</th>
                  <th className="text-left py-2">Notas</th>
                  <th className="text-right py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {(gastosPreview || []).map((g: any) => (
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
          ) : <p className="text-sm text-muted-foreground">Sin gastos en este periodo</p>}
        </SectionCard>
      )}

      {/* Notes & submit */}
      <div className="bg-card border border-border rounded-lg p-5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Notas generales</label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Observaciones sobre la liquidación..."
          className="input-odoo min-h-[60px] text-[13px] w-full"
        />
      </div>

      <Button
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || efectivoEntregado === '' || !vendedorId}
        className="w-full sm:w-auto"
      >
        <PackageCheck className="h-4 w-4 mr-2" />
        {hayDiferencias ? 'Enviar para aprobación' : 'Completar liquidación'}
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
  const { data: descargaDetalle } = useDescargaDetalle(selectedId);

  const filtered = (descargas || []).filter((d: any) =>
    filterStatus === 'all' || d.status === filterStatus
  );

  const selectedDescarga = descargaDetalle ?? descargas?.find((d: any) => d.id === selectedId);

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
      </div>

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
                      {hasRange ? `${fmtDate(d.fecha_inicio)} → ${fmtDate(d.fecha_fin)}` : fmtDate(d.fecha)}
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

      {selectedDescarga && (
        <DescargaDetalle descarga={selectedDescarga} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
