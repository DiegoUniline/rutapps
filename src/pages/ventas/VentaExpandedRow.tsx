import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Pencil, Trash2, ChevronUp, FileText, Printer, MessageCircle, Loader2, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { CONDICION_LABELS } from './ventasConstants';
import { generateVentaPdfById } from '@/lib/ventaPdfFromId';
import { printTicket, buildTicketDataFromVenta } from '@/lib/printTicketUtil';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { toast } from 'sonner';

interface Props {
  venta: any;
  fmt: (v: number | null | undefined) => string;
  canDelete: boolean;
  onDeleteTarget: (id: string) => void;
  onCollapse: () => void;
  empresaId?: string;
  empresa?: any;
  clientesList?: any[];
  productosList?: any[];
}

export function VentaExpandedRow({ venta, fmt, canDelete, onDeleteTarget, onCollapse, empresaId, empresa, clientesList, productosList }: Props) {
  const navigate = useNavigate();
  const [lineas, setLineas] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfName, setPdfName] = useState('');
  const [pdfCaption, setPdfCaption] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waPdfBlob, setWaPdfBlob] = useState<Blob | null>(null);
  const [waPdfName, setWaPdfName] = useState('');
  const [generatingWa, setGeneratingWa] = useState(false);
  const [printingTicket, setPrintingTicket] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [lRes, pRes] = await Promise.all([
        supabase
          .from('venta_lineas')
          .select('id, cantidad, precio_unitario, descuento_pct, subtotal, iva_monto, ieps_monto, total, producto_id, lista_precio_id, precio_manual, productos(nombre, unidad_granel), lista_precios(nombre, es_principal)')
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
  const eId = empresaId || venta.empresa_id;

  const handlePdf = async () => {
    setGeneratingPdf(true);
    try {
      const { blob, fileName, caption } = await generateVentaPdfById(venta.id, eId);
      setPdfBlob(blob);
      setPdfName(fileName);
      setPdfCaption(caption);
      setShowPdf(true);
    } catch (err: any) {
      toast.error(err.message || 'Error generando PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleTicket = async () => {
    setPrintingTicket(true);
    try {
      const td = buildTicketDataFromVenta({
        empresa: empresa ?? {},
        venta: {
          folio: venta.folio,
          fecha: fmtDate(venta.created_at),
          subtotal: venta.subtotal,
          iva_total: venta.iva_total,
          ieps_total: venta.ieps_total,
          total: venta.total,
          saldo_pendiente: venta.saldo_pendiente,
          condicion_pago: venta.condicion_pago,
        },
        clienteNombre,
        vendedorNombre: venta.vendedores?.nombre ?? '',
        lineas: lineas.map((l: any) => ({
          nombre: (l.productos as any)?.nombre ?? '—',
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          total: l.total,
          iva_monto: l.iva_monto,
          ieps_monto: l.ieps_monto,
          descuento_pct: l.descuento_pct,
          producto_id: l.producto_id,
        })),
        pagos: pagos.map((p: any) => ({
          metodo: (p.cobros as any)?.metodo_pago ?? '',
          monto: p.monto_aplicado ?? 0,
          referencia: (p.cobros as any)?.referencia,
        })),
      });
      await printTicket(td);
    } catch (err: any) {
      toast.error(err.message || 'Error imprimiendo ticket');
    } finally {
      setPrintingTicket(false);
    }
  };

  const handleWhatsApp = async () => {
    setGeneratingWa(true);
    try {
      const { blob, fileName, caption } = await generateVentaPdfById(venta.id, eId);
      const cliente = clientesList?.find(c => c.id === venta.cliente_id);
      setWaPdfBlob(blob);
      setWaPdfName(fileName);
      setWaPhone(cliente?.telefono ?? '');
      setWaMessage(caption);
      setWaOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Error generando PDF');
    } finally {
      setGeneratingWa(false);
    }
  };

  return (
    <>
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
                <span className="text-muted-foreground text-xs">{fmtDateTime(venta.created_at)}</span>
                <span className="text-muted-foreground text-xs">•</span>
                <span className="text-muted-foreground text-xs">{CONDICION_LABELS[venta.condicion_pago] || venta.condicion_pago}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handlePdf} disabled={generatingPdf}>
                  {generatingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleTicket} disabled={printingTicket || loading}>
                  {printingTicket ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                  Ticket
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleWhatsApp} disabled={generatingWa}>
                  {generatingWa ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                  WhatsApp
                </Button>
                {venta.status !== 'borrador' && (venta.saldo_pendiente ?? 0) > 0 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => navigate('/cobranza')}>
                    <Banknote className="h-3 w-3" /> Cobrar
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => navigate(`/ventas/${venta.id}`)}>
                  <Pencil className="h-3 w-3" /> Editar
                </Button>
                {(venta.status === 'borrador' || (venta.status === 'cancelado' && canDelete)) && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1.5" onClick={() => onDeleteTarget(venta.id)}>
                    <Trash2 className="h-3 w-3" />
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
                        <th className="text-left py-1 font-medium">Lista</th>
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
                        const lp = (l as any).lista_precios;
                        const listaLabel = l.precio_manual ? 'Manual' : (lp?.nombre ?? '—');
                        return (
                          <tr key={l.id} className="border-b border-border/40">
                            <td className="py-1.5">{(l.productos as any)?.nombre ?? '—'}</td>
                            <td className="py-1.5 text-muted-foreground text-[11px]">{listaLabel}</td>
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
                        <tr><td colSpan={8} className="text-center py-3 text-muted-foreground text-xs">Sin productos</td></tr>
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
                        {pagos.map((p: any) => {
                          const cobro = p.cobros as any;
                          return (
                            <tr key={p.id} className="border-b border-border/40">
                              <td className="py-1.5 capitalize">{cobro?.metodo_pago ?? '—'}</td>
                              <td className="py-1.5 text-muted-foreground">{cobro?.referencia || '—'}</td>
                              <td className="py-1.5 text-muted-foreground">{fmtDate(cobro?.fecha)}</td>
                              <td className="py-1.5 text-right font-medium tabular-nums">{fmt(p.monto_aplicado)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border font-semibold">
                          <td colSpan={3} className="py-1.5">Total pagado</td>
                          <td className="py-1.5 text-right text-success tabular-nums">{fmt(pagos.reduce((s: number, p: any) => s + (p.monto_aplicado ?? 0), 0))}</td>
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

      {showPdf && (
        <tr className="hidden">
          <td>
            <DocumentPreviewModal
              open={showPdf}
              onClose={() => { setShowPdf(false); setPdfBlob(null); }}
              pdfBlob={pdfBlob}
              fileName={pdfName}
              empresaId={eId}
              defaultPhone={clientesList?.find(c => c.id === venta.cliente_id)?.telefono}
              caption={pdfCaption}
              tipo="venta"
              referencia_id={venta.id}
            />
          </td>
        </tr>
      )}

      {waOpen && (
        <tr className="hidden">
          <td>
            <WhatsAppPreviewDialog
              open={waOpen}
              onClose={() => { setWaOpen(false); setWaPdfBlob(null); }}
              phone={waPhone}
              message={waMessage}
              empresaId={eId}
              tipo="venta"
              pdfBlob={waPdfBlob}
              pdfFileName={waPdfName}
            />
          </td>
        </tr>
      )}
    </>
  );
}
