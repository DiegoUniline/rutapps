import { useState } from 'react';
import { ArrowLeft, User, Package, FileText, Banknote, Calendar, Pencil, X, MessageCircle, Download, Receipt, AlertTriangle } from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { useCurrency } from '@/hooks/useCurrency';
import { statusColors } from './types';

interface Props {
  venta: any;
  clienteNombre: string;
  vendedorNombre: string;
  clienteData: any;
  lineas: any[];
  empresa: any;
  ecPdfBlob: Blob | null;
  showEcPreview: boolean;
  setShowEcPreview: (v: boolean) => void;
  showWADialog: boolean;
  setShowWADialog: (v: boolean) => void;
  waPhone: string;
  setWaPhone: (v: string) => void;
  sendingWA: boolean;
  saving: boolean;
  handleWhatsAppSend: () => void;
  handleDownloadPDF: () => void;
  handleEstadoCuenta: () => void;
  initEditar: () => void;
  initCobrar: () => void;
  handleCancelar: () => void;
  onBack: () => void;
  fmt: (n: number) => string;
}

export function DetalleView(p: Props) {
  const { symbol: s } = useCurrency();
  return (
    <div className="min-h-screen bg-background">
      <Header {...p} />
      <WADialog {...p} s={s} />
      <div className="p-4 space-y-4 pb-28">
        <TotalCard venta={p.venta} fmt={p.fmt} s={s} />
        <InfoCard venta={p.venta} clienteNombre={p.clienteNombre} vendedorNombre={p.vendedorNombre} />
        <ProductosCard lineas={p.lineas} fmt={p.fmt} s={s} />
        <TotalesCard venta={p.venta} fmt={p.fmt} s={s} />
        {p.venta.notas && <div className="bg-card border border-border rounded-xl p-4"><p className="text-[11px] text-muted-foreground mb-1">Notas</p><p className="text-[13px] text-foreground">{p.venta.notas}</p></div>}
      </div>
      <BottomActions {...p} s={s} />
      <DocumentPreviewModal open={p.showEcPreview} onClose={() => p.setShowEcPreview(false)} pdfBlob={p.ecPdfBlob} fileName={`Estado-Cuenta-${p.clienteNombre.replace(/\s+/g, '-')}.pdf`} empresaId={p.empresa?.id ?? ''} defaultPhone={p.clienteData?.telefono ?? ''} caption={`Estado de cuenta - ${p.clienteNombre}`} tipo="estado_cuenta" />
    </div>
  );
}

function Header({ venta, onBack, clienteData, setShowWADialog, setWaPhone, handleDownloadPDF, handleEstadoCuenta, initEditar }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
      <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
      <div className="flex-1 min-w-0"><h1 className="text-[16px] font-bold text-foreground truncate">{venta.folio ?? 'Sin folio'}</h1><p className="text-[11px] text-muted-foreground">{venta.tipo === 'venta_directa' ? 'Venta directa' : 'Pedido'}</p></div>
      <div className="flex items-center gap-0.5">
        <button onClick={() => { setWaPhone(clienteData?.telefono ?? ''); setShowWADialog(true); }} className="p-2 rounded-lg hover:bg-accent active:scale-95"><MessageCircle className="h-4 w-4 text-muted-foreground" /></button>
        <button onClick={handleDownloadPDF} className="p-2 rounded-lg hover:bg-accent active:scale-95"><Download className="h-4 w-4 text-muted-foreground" /></button>
        <button onClick={handleEstadoCuenta} className="p-2 rounded-lg hover:bg-accent active:scale-95"><Receipt className="h-4 w-4 text-muted-foreground" /></button>
        {venta.status === 'borrador' && <button onClick={initEditar} className="p-2 rounded-lg hover:bg-accent active:scale-95"><Pencil className="h-4 w-4 text-muted-foreground" /></button>}
      </div>
      <span className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0', statusColors[venta.status] ?? '')}>{venta.status}</span>
    </div>
  );
}

function WADialog({ showWADialog, setShowWADialog, waPhone, setWaPhone, sendingWA, handleWhatsAppSend, venta, fmt, s }: Props & { s: string }) {
  if (!showWADialog) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowWADialog(false)}>
      <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-[15px] font-bold text-foreground">Enviar por WhatsApp</h3><button onClick={() => setShowWADialog(false)} className="p-1"><X className="h-4 w-4 text-muted-foreground" /></button></div>
        <div className="space-y-1.5"><label className="text-[11px] text-muted-foreground font-medium">Número de WhatsApp</label><input type="tel" inputMode="tel" className="w-full bg-accent/40 rounded-lg px-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40" value={waPhone} placeholder="521234567890" onChange={e => setWaPhone(e.target.value)} /><p className="text-[10px] text-muted-foreground">Incluye código de país</p></div>
        <div className="bg-accent/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">Se enviará:</p><p className="text-[12px] text-foreground font-medium">Ticket de venta {venta.folio} por {s} {fmt(venta.total ?? 0)}</p></div>
        <button onClick={handleWhatsAppSend} disabled={sendingWA || !waPhone.trim()} className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40">{sendingWA ? 'Enviando...' : <><MessageCircle className="h-4 w-4" /> Enviar</>}</button>
      </div>
    </div>
  );
}

function TotalCard({ venta, fmt, s }: { venta: any; fmt: (n: number) => string; s: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <p className="text-[11px] text-muted-foreground mb-1">Total</p>
      <p className="text-[28px] font-bold text-foreground">{s} {fmt(venta.total ?? 0)}</p>
      {(venta.saldo_pendiente ?? 0) > 0 && <p className="text-[12px] text-destructive font-medium mt-1">Saldo pendiente: {s} {fmt(venta.saldo_pendiente ?? 0)}</p>}
    </div>
  );
}

function InfoCard({ venta, clienteNombre, vendedorNombre }: { venta: any; clienteNombre: string; vendedorNombre: string }) {
  return (
    <div className="bg-card border border-border rounded-xl divide-y divide-border">
      <InfoRow icon={User} label="Cliente" value={clienteNombre} />
      <InfoRow icon={Calendar} label="Fecha" value={fmtDate(venta.fecha)} />
      {venta.fecha_entrega && <InfoRow icon={Calendar} label="Entrega" value={fmtDate(venta.fecha_entrega)} />}
      <InfoRow icon={Banknote} label="Pago" value={venta.condicion_pago} />
      <InfoRow icon={FileText} label="Vendedor" value={vendedorNombre} />
    </div>
  );
}

function ProductosCard({ lineas, fmt, s }: { lineas: any[]; fmt: (n: number) => string; s: string }) {
  return (
    <div>
      <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5"><Package className="h-4 w-4 text-muted-foreground" /> Productos ({lineas.length})</h2>
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {lineas.length === 0 && <p className="text-muted-foreground text-[12px] p-4 text-center">Sin productos</p>}
        {lineas.map((l: any) => (
          <div key={l.id} className="p-3"><div className="flex items-start justify-between gap-2"><div className="flex-1 min-w-0"><p className="text-[13px] font-medium text-foreground truncate">{l.productos?.nombre ?? l.descripcion ?? '—'}</p><p className="text-[11px] text-muted-foreground">{l.cantidad} × {s} {fmt(l.precio_unitario ?? 0)}{l.unidades?.abreviatura ? ` / ${l.unidades.abreviatura}` : ''}</p></div><p className="text-[14px] font-bold text-foreground shrink-0">{s} {fmt(l.total ?? 0)}</p></div></div>
        ))}
      </div>
    </div>
  );
}

function TotalesCard({ venta, fmt, s }: { venta: any; fmt: (n: number) => string; s: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <TotalRow label="Subtotal" value={venta.subtotal ?? 0} fmt={fmt} s={s} />
      {(venta.descuento_total ?? 0) > 0 && <TotalRow label="Descuento" value={-(venta.descuento_total ?? 0)} fmt={fmt} s={s} />}
      {(venta.iva_total ?? 0) > 0 && <TotalRow label="IVA" value={venta.iva_total ?? 0} fmt={fmt} s={s} />}
      {(venta.ieps_total ?? 0) > 0 && <TotalRow label="IEPS" value={venta.ieps_total ?? 0} fmt={fmt} s={s} />}
      <div className="border-t border-border pt-2 flex justify-between"><span className="text-[14px] font-bold text-foreground">Total</span><span className="text-[14px] font-bold text-foreground">{s} {fmt(venta.total ?? 0)}</span></div>
    </div>
  );
}

function BottomActions({ venta, saving, initEditar, initCobrar, handleCancelar, fmt, s, lineas }: Props & { s: string }) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const esEntregaInmediata = venta.tipo === 'venta_directa' && venta.entrega_inmediata;
  const totalProductos = (lineas ?? []).reduce((acc: number, l: any) => acc + (l.cantidad ?? 0), 0);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <div className="flex gap-2">
          {(venta.status === 'confirmado' || venta.status === 'entregado') && <button onClick={() => setShowCancelModal(true)} disabled={saving} className="flex-1 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40"><X className="h-4 w-4" /> Cancelar</button>}
          {venta.status === 'borrador' && <button onClick={initEditar} className="flex-1 bg-card border border-border text-foreground rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] flex items-center justify-center gap-1.5"><Pencil className="h-4 w-4" /> Editar</button>}
          {(venta.saldo_pendiente ?? 0) > 0 && venta.status !== 'cancelado' && <button onClick={initCobrar} className="flex-1 bg-green-600 text-white rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] shadow-lg shadow-green-600/20 flex items-center justify-center gap-1.5"><Banknote className="h-5 w-5" /> Cobrar {s}{fmt(venta.saldo_pendiente ?? 0)}</button>}
        </div>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6" onClick={() => setShowCancelModal(false)}>
          <div className="bg-card rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="text-[16px] font-bold text-foreground">Cancelar venta {venta.folio}</h3>
            </div>

            <div className="bg-accent/40 rounded-xl p-3.5 space-y-2 text-[12px] text-foreground">
              <p className="font-medium text-[13px] text-destructive">Esta acción no se puede deshacer.</p>
              <p>Al cancelar esta venta ocurrirá lo siguiente:</p>
              <ul className="space-y-1.5 ml-1">
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5">•</span>
                  <span>El estatus cambiará a <span className="font-semibold">cancelado</span> permanentemente.</span>
                </li>
                {esEntregaInmediata && (
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground mt-0.5">•</span>
                    <span>Se <span className="font-semibold">devolverán {totalProductos} unidades</span> al inventario del almacén.</span>
                  </li>
                )}
                {(venta.saldo_pendiente ?? 0) < (venta.total ?? 0) && (
                  <li className="flex items-start gap-2">
                    <span className="text-muted-foreground mt-0.5">•</span>
                    <span>Los cobros aplicados ({s}{fmt((venta.total ?? 0) - (venta.saldo_pendiente ?? 0))}) quedarán como saldo a favor del cliente.</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5">•</span>
                  <span>Se registrará el movimiento en el Kardex.</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 bg-accent/60 text-foreground rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98]">
                No, volver
              </button>
              <button
                onClick={() => { setShowCancelModal(false); handleCancelar(); }}
                disabled={saving}
                className="flex-1 bg-destructive text-white rounded-xl py-3 text-[13px] font-bold active:scale-[0.98] disabled:opacity-40"
              >
                {saving ? 'Cancelando...' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="flex items-center gap-3 px-4 py-3"><Icon className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">{label}</span><span className="text-[13px] font-medium text-foreground truncate capitalize">{value}</span></div>;
}

function TotalRow({ label, value, fmt, s }: { label: string; value: number; fmt: (n: number) => string; s: string }) {
  return <div className="flex justify-between"><span className="text-[12px] text-muted-foreground">{label}</span><span className="text-[13px] text-foreground">{s} {fmt(value)}</span></div>;
}
