import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { buildTicketHTML, type TicketData } from '@/lib/ticketHtml';
import { printTicket } from '@/lib/printTicketUtil';
import { toPng } from 'html-to-image';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';
import {
  ArrowLeft, Check, User, Package, MapPin, Calendar,
  Banknote, FileText, Download, Printer, Share2, MessageCircle,
  Receipt, X, Truck, Loader2, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  surtido: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  asignado: 'bg-accent text-accent-foreground',
  cargado: 'bg-warning/10 text-warning',
  en_ruta: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  hecho: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelado: 'bg-destructive/10 text-destructive',
};

export default function RutaEntregaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const queryClient = useQueryClient();
  const { symbol: s } = useCurrency();
  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [saving, setSaving] = useState(false);
  const [showWADialog, setShowWADialog] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [sendingWA, setSendingWA] = useState(false);
  const [ecPdfBlob, setEcPdfBlob] = useState<Blob | null>(null);
  const [showEcPreview, setShowEcPreview] = useState(false);
  const [showTax, setShowTax] = useState(true);

  const { data: entrega, isLoading } = useQuery({
    queryKey: ['ruta-entrega-detalle', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select(`*, clientes(id, nombre, telefono, direccion, colonia, credito, limite_credito, dias_credito), vendedores!entregas_vendedor_id_fkey(nombre), entrega_lineas(*, productos(id, codigo, nombre, precio_principal))`)
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const pedidoId = (entrega as any)?.pedido_id;
  const { data: venta } = useQuery({
    queryKey: ['ruta-entrega-venta', pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select(`*, venta_lineas(*, productos(id, codigo, nombre), unidades:unidad_id(nombre, abreviatura)), clientes(id, nombre, telefono), vendedores(nombre), venta_promociones(*)`)
        .eq('id', pedidoId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const clienteId = (entrega as any)?.cliente_id;
  const { data: otrasPendientes } = useQuery({
    queryKey: ['ruta-entrega-cuentas', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase.from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente')
        .eq('cliente_id', clienteId!)
        .gt('saldo_pendiente', 0)
        .in('status', ['borrador', 'confirmado', 'entregado', 'facturado'])
        .order('fecha', { ascending: true });
      return data ?? [];
    },
  });

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground text-[13px]">Cargando...</p></div>;
  if (!entrega) return <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2"><p className="text-muted-foreground text-[13px]">Entrega no encontrada</p><button onClick={() => navigate(-1)} className="text-primary text-[13px] font-medium">Volver</button></div>;

  const cliente = (entrega as any).clientes;
  const clienteNombre = cliente?.nombre ?? '—';
  const vendedorNombre = (entrega as any).vendedores?.nombre ?? '—';
  const lineas = (entrega as any).entrega_lineas ?? [];
  const isDelivered = entrega.status === 'hecho';

  const ventaLineas = (venta as any)?.venta_lineas ?? [];
  const ventaTotal = venta?.total ?? 0;
  const ventaSaldo = venta?.saldo_pendiente ?? 0;

  const marcarEntregado = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('entregas')
        .update({ status: 'hecho', validado_at: now, fecha_entrega: now } as any)
        .eq('id', id!);
      if (error) throw error;
      toast.success('¡Entrega completada!');
      queryClient.invalidateQueries({ queryKey: ['ruta-entrega-detalle', id] });
      queryClient.invalidateQueries({ queryKey: ['entregas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-entrega-venta'] });
      queryClient.invalidateQueries({ queryKey: ['venta'] });
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const getTicketData = (): TicketData | null => {
    const e = empresa as any;
    if (!e) return null;
    const empresaData = {
      nombre: e?.nombre ?? '', rfc: e?.rfc ?? null, razon_social: e?.razon_social ?? null,
      telefono: e?.telefono ?? null, direccion: e?.direccion ?? null, colonia: e?.colonia ?? null,
      ciudad: e?.ciudad ?? null, estado: e?.estado ?? null, cp: e?.cp ?? null,
      email: e?.email ?? null, logo_url: e?.logo_url ?? null, moneda: e?.moneda ?? 'MXN',
      notas_ticket: e?.notas_ticket ?? null, ticket_campos: e?.ticket_campos ?? null,
    };

    if (venta) {
      return {
        empresa: empresaData,
        folio: venta.folio ?? 'Sin folio',
        fecha: fmtDate(venta.fecha),
        clienteNombre,
        lineas: ventaLineas.map((l: any) => ({
          nombre: l.productos?.nombre ?? l.descripcion ?? '—',
          cantidad: l.cantidad, precio: l.precio_unitario ?? 0, total: l.total ?? 0,
          iva_monto: l.iva_monto ?? 0, ieps_monto: l.ieps_monto ?? 0,
          descuento_pct: l.descuento_porcentaje ?? l.descuento_pct ?? 0,
          producto_id: l.producto_id,
        })),
        subtotal: venta.subtotal ?? 0, iva: venta.iva_total ?? 0,
        ieps: (venta as any).ieps_total ?? 0, total: ventaTotal,
        condicionPago: venta.condicion_pago,
        metodoPago: (venta as any).metodo_pago ?? undefined,
        saldoNuevo: ventaSaldo > 0 ? ventaSaldo : undefined,
        promociones: ((venta as any).venta_promociones ?? []).filter((p: any) => (p.descuento ?? 0) > 0).map((p: any) => ({
          descripcion: p.descripcion ?? p.nombre ?? '', descuento: p.descuento ?? 0, producto_id: p.producto_id,
        })),
      };
    }

    // Fallback: build ticket from entrega lines
    const entregaTotal = lineas.reduce((acc: number, l: any) => {
      const precio = l.productos?.precio_principal ?? 0;
      return acc + (precio * (l.cantidad_entregada || l.cantidad_pedida || 0));
    }, 0);

    return {
      empresa: empresaData,
      folio: entrega.folio ?? 'Sin folio',
      fecha: fmtDate(entrega.fecha),
      clienteNombre,
      lineas: lineas.map((l: any) => {
        const precio = l.productos?.precio_principal ?? 0;
        const cant = l.cantidad_entregada || l.cantidad_pedida || 0;
        return {
          nombre: l.productos?.nombre ?? '—',
          cantidad: cant, precio, total: precio * cant,
          iva_monto: 0, ieps_monto: 0, descuento_pct: 0,
          producto_id: l.producto_id,
        };
      }),
      subtotal: entregaTotal, iva: 0, ieps: 0, total: entregaTotal,
    };
  };

  const ticketAncho = (empresa as any)?.ticket_ancho ?? '80';

  const handlePrintTicket = async () => {
    const td = getTicketData();
    if (!td) { toast.error('No hay datos para imprimir'); return; }
    await printTicket(td, { ticketAncho });
  };

  const handleDownloadTicket = async () => {
    let td = getTicketData();
    if (!td) { toast.error('No hay datos para descargar'); return; }
    if (td.empresa.logo_url && !td.empresa.logo_url.startsWith('data:')) {
      try {
        const resp = await fetch(td.empresa.logo_url, { mode: 'cors' });
        const blob = await resp.blob();
        td = { ...td, empresa: { ...td.empresa, logo_url: await new Promise<string>((res) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(blob); }) } };
      } catch { td = { ...td, empresa: { ...td.empresa, logo_url: null } }; }
    }
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0';
    container.innerHTML = buildTicketHTML(td, { ticketAncho });
    document.body.appendChild(container);
    try {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)));
      const dataUrl = await toPng(container.firstElementChild as HTMLElement, { cacheBust: true, pixelRatio: 3, backgroundColor: '#ffffff' });
      const a = document.createElement('a'); a.href = dataUrl; a.download = `entrega-${entrega.folio ?? id}.png`; a.click();
      toast.success('Ticket descargado');
    } catch { toast.error('Error generando imagen'); }
    finally { document.body.removeChild(container); }
  };

  const handleShareTicket = async () => {
    const td = getTicketData();
    if (!td) return;
    const fmtM = (n: number) => `${s}${fmt(n)}`;
    const text = [
      td.empresa.nombre, td.empresa.rfc ? `RFC: ${td.empresa.rfc}` : '', td.empresa.direccion ?? '',
      '─'.repeat(30), `Folio: ${td.folio}`, `Fecha: ${td.fecha}`, `Cliente: ${td.clienteNombre}`,
      '─'.repeat(30),
      ...td.lineas.map(l => `${l.cantidad}x ${l.nombre} ${fmtM(l.total)}`),
      '─'.repeat(30), `TOTAL: ${fmtM(td.total)}`,
    ].filter(Boolean).join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: `Ticket ${td.folio}`, text }); } catch { }
    } else {
      await navigator.clipboard.writeText(text); toast.success('Copiado al portapapeles');
    }
  };

  const handleWhatsAppSend = async () => {
    if (!waPhone.trim()) return;
    const td = getTicketData();
    if (!td) { toast.error('No hay datos'); return; }
    setSendingWA(true);
    try {
      const { sendReceiptWhatsApp } = await import('@/lib/whatsappReceipt');
      const result = await sendReceiptWhatsApp({ data: td, empresaId: empresa?.id ?? '', phone: waPhone, referencia_id: venta?.id ?? id ?? '' });
      if (result.success) { toast.success('Enviado por WhatsApp'); setShowWADialog(false); } else toast.error(result.error || 'Error');
    } catch (err: any) { toast.error(err.message); }
    finally { setSendingWA(false); }
  };

  const handleEstadoCuenta = async () => {
    if (!empresa || !cliente) { toast.error('Cargando datos...'); return; }
    try {
      const [ventasRes, cobrosRes] = await Promise.all([
        supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente, status, condicion_pago').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).neq('status', 'cancelado').order('fecha', { ascending: false }).limit(200),
        supabase.from('cobros').select('id, fecha, monto, metodo_pago, referencia').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).order('fecha', { ascending: false }).limit(200),
      ]);
      const blob = generarEstadoCuentaPdf({
        empresa: { nombre: empresa.nombre, razon_social: empresa.razon_social ?? undefined, rfc: empresa.rfc ?? undefined, direccion: empresa.direccion ?? undefined, telefono: empresa.telefono ?? undefined, email: empresa.email ?? undefined, logo_url: empresa.logo_url ?? undefined },
        cliente: { nombre: cliente.nombre, telefono: cliente.telefono ?? undefined, credito: cliente.credito ?? false, limite_credito: cliente.limite_credito ?? 0, dias_credito: cliente.dias_credito ?? 0 },
        ventas: (ventasRes.data ?? []).map(v => ({ folio: v.folio ?? '—', fecha: v.fecha, total: v.total ?? 0, saldo_pendiente: v.saldo_pendiente ?? 0, status: v.status, condicion_pago: v.condicion_pago })),
        cobros: (cobrosRes.data ?? []).map(c => ({ fecha: c.fecha, monto: c.monto ?? 0, metodo_pago: c.metodo_pago, referencia: c.referencia ?? undefined })),
      });
      setEcPdfBlob(blob); setShowEcPreview(true);
    } catch { toast.error('Error generando estado de cuenta'); }
  };

  const goToCobrar = () => {
    if (!pedidoId) { toast.error('No hay pedido asociado'); return; }
    navigate(`/ruta/ventas/${pedidoId}`);
  };

  const totalSaldoPendiente = (otrasPendientes ?? []).reduce((acc, v) => acc + (v.saldo_pendiente ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-bold text-foreground truncate">{entrega.folio ?? 'Entrega'}</h1>
          <p className="text-[11px] text-muted-foreground">Entrega de pedido</p>
        </div>
        <span className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0', statusColors[entrega.status] ?? '')}>
          {entrega.status === 'hecho' ? 'Entregado' : entrega.status === 'en_ruta' ? 'En ruta' : entrega.status}
        </span>
      </div>

      {showWADialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowWADialog(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-[15px] font-bold text-foreground">Enviar por WhatsApp</h3><button onClick={() => setShowWADialog(false)} className="p-1"><X className="h-4 w-4 text-muted-foreground" /></button></div>
            <div className="space-y-1.5"><label className="text-[11px] text-muted-foreground font-medium">Número de WhatsApp</label><input type="tel" inputMode="tel" className="w-full bg-accent/40 rounded-lg px-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40" value={waPhone} placeholder="521234567890" onChange={e => setWaPhone(e.target.value)} /></div>
            <button onClick={handleWhatsAppSend} disabled={sendingWA || !waPhone.trim()} className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40">{sendingWA ? 'Enviando...' : <><MessageCircle className="h-4 w-4" /> Enviar</>}</button>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4 pb-28">
        <div className="grid grid-cols-5 gap-1">
          {[
            { icon: MessageCircle, label: 'WhatsApp', color: 'text-[#25D366]', onClick: () => { setWaPhone(cliente?.telefono ?? ''); setShowWADialog(true); }, disabled: false },
            { icon: Download, label: 'Descargar', color: 'text-primary', onClick: handleDownloadTicket, disabled: false },
            { icon: Printer, label: 'Imprimir', color: 'text-primary', onClick: handlePrintTicket, disabled: false },
            { icon: Share2, label: 'Compartir', color: 'text-primary', onClick: handleShareTicket, disabled: false },
            { icon: Receipt, label: 'Edo. Cuenta', color: 'text-primary', onClick: handleEstadoCuenta, disabled: !cliente },
          ].map(a => (
            <button key={a.label} onClick={a.onClick} disabled={a.disabled}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-card border border-border active:scale-95 transition-transform disabled:opacity-40">
              <a.icon className={`h-5 w-5 ${a.color}`} />
              <span className="text-[10px] font-medium text-foreground leading-tight">{a.label}</span>
            </button>
          ))}
        </div>

        {venta && (
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[11px] text-muted-foreground mb-1">Total del pedido</p>
            <p className="text-[28px] font-bold text-foreground">{s} {fmt(ventaTotal)}</p>
            {ventaSaldo > 0 && <p className="text-[12px] text-destructive font-medium mt-1">Saldo pendiente: {s} {fmt(ventaSaldo)}</p>}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          <div className="flex items-center gap-3 px-4 py-3"><User className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Cliente</span><span className="text-[13px] font-medium text-foreground truncate">{clienteNombre}</span></div>
          {(cliente?.direccion || cliente?.colonia) && (
            <div className="flex items-center gap-3 px-4 py-3"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Dirección</span><span className="text-[13px] font-medium text-foreground truncate">{[cliente?.direccion, cliente?.colonia].filter(Boolean).join(', ')}</span></div>
          )}
          <div className="flex items-center gap-3 px-4 py-3"><Calendar className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Fecha</span><span className="text-[13px] font-medium text-foreground">{fmtDate(entrega.fecha)}</span></div>
          <div className="flex items-center gap-3 px-4 py-3"><Truck className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Vendedor</span><span className="text-[13px] font-medium text-foreground truncate">{vendedorNombre}</span></div>
          {venta && (
            <div className="flex items-center gap-3 px-4 py-3"><FileText className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Pedido</span><span className="text-[13px] font-medium text-primary truncate">{venta.folio ?? '—'}</span></div>
          )}
          {venta?.condicion_pago && (
            <div className="flex items-center gap-3 px-4 py-3"><Banknote className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Pago</span><span className="text-[13px] font-medium text-foreground capitalize">{venta.condicion_pago}</span></div>
          )}
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5"><Package className="h-4 w-4 text-muted-foreground" /> Productos ({lineas.length})</h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {lineas.length === 0 && <p className="text-muted-foreground text-[12px] p-4 text-center">Sin productos</p>}
            {lineas.map((l: any) => {
              const prod = l.productos;
              const vl = ventaLineas.find((vl: any) => vl.producto_id === l.producto_id);
              const precio = vl?.precio_unitario ?? prod?.precio_principal ?? 0;
              const total = vl?.total ?? (precio * (l.cantidad_entregada || l.cantidad_pedida));
              return (
                <div key={l.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{prod?.nombre ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{l.cantidad_entregada || l.cantidad_pedida} × {s} {fmt(precio)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[14px] font-bold text-foreground">{s} {fmt(total)}</p>
                      {l.hecho && <span className="text-[9px] text-green-600 font-medium">✓ Surtido</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {venta && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Totales</span>
              <button onClick={() => setShowTax(!showTax)} className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${showTax ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {showTax ? 'Con impuestos' : 'Sin impuestos'}
              </button>
            </div>
            {showTax && <div className="flex justify-between"><span className="text-[12px] text-muted-foreground">Subtotal</span><span className="text-[13px] text-foreground">{s} {fmt(venta.subtotal ?? 0)}</span></div>}
            {showTax && (venta.iva_total ?? 0) > 0 && <div className="flex justify-between"><span className="text-[12px] text-muted-foreground">IVA</span><span className="text-[13px] text-foreground">{s} {fmt(venta.iva_total ?? 0)}</span></div>}
            {showTax && ((venta as any).ieps_total ?? 0) > 0 && <div className="flex justify-between"><span className="text-[12px] text-muted-foreground">IEPS</span><span className="text-[13px] text-foreground">{s} {fmt((venta as any).ieps_total ?? 0)}</span></div>}
            <div className="border-t border-border pt-2 flex justify-between"><span className="text-[14px] font-bold text-foreground">Total</span><span className="text-[14px] font-bold text-foreground">{s} {fmt(ventaTotal)}</span></div>
          </div>
        )}

        {totalSaldoPendiente > 0 && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-destructive mb-2">Cuentas pendientes del cliente</p>
            <div className="space-y-1.5">
              {(otrasPendientes ?? []).filter(v => (v.saldo_pendiente ?? 0) > 0).slice(0, 5).map(v => (
                <div key={v.id} className="flex justify-between text-[12px]">
                  <span className="text-foreground">{v.folio ?? '—'} <span className="text-muted-foreground">({fmtDate(v.fecha)})</span></span>
                  <span className="font-medium text-destructive">{s} {fmt(v.saldo_pendiente ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-destructive/20 mt-2 pt-2 flex justify-between">
              <span className="text-[12px] font-semibold text-foreground">Total pendiente</span>
              <span className="text-[13px] font-bold text-destructive">{s} {fmt(totalSaldoPendiente)}</span>
            </div>
          </div>
        )}

        {entrega.notas && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[11px] text-muted-foreground mb-1">Notas</p>
            <p className="text-[13px] text-foreground">{entrega.notas}</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <div className="flex gap-2">
          {totalSaldoPendiente > 0 && !isDelivered && (
            <button onClick={goToCobrar}
              className="flex-1 bg-card border border-border text-foreground rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] flex items-center justify-center gap-1.5">
              <Banknote className="h-4 w-4" /> Cobrar {s}{fmt(totalSaldoPendiente)}
            </button>
          )}
          {isDelivered ? (
            <button onClick={goToCobrar}
              className="flex-1 bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] shadow-lg flex items-center justify-center gap-1.5">
              <FileText className="h-5 w-5" /> Ver pedido
            </button>
          ) : (
            <button onClick={marcarEntregado} disabled={saving}
              className="flex-1 bg-green-600 text-white rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] shadow-lg shadow-green-600/20 flex items-center justify-center gap-1.5 disabled:opacity-40">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {saving ? 'Entregando...' : 'Marcar como entregado'}
            </button>
          )}
        </div>
      </div>

      <DocumentPreviewModal open={showEcPreview} onClose={() => setShowEcPreview(false)} pdfBlob={ecPdfBlob} fileName={`Estado-Cuenta-${clienteNombre.replace(/\s+/g, '-')}.pdf`} empresaId={empresa?.id ?? ''} defaultPhone={cliente?.telefono ?? ''} caption={`Estado de cuenta - ${clienteNombre}`} tipo="estado_cuenta" />
    </div>
  );
}
