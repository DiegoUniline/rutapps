import { Check, Printer, Share2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate } from '@/lib/utils';
import { getNombreTicket } from '@/lib/productoNombres';
import { computeResumenFromLineas } from '@/lib/ventaResumen';

interface DevolucionTicketItem {
  nombre: string;
  cantidad: number;
  motivo: string;
  accion: string;
  monto: number;
}

interface TicketVentaProps {
  empresa: { nombre: string; telefono?: string | null; direccion?: string | null; logo_url?: string | null; rfc?: string | null; moneda?: string | null; razon_social?: string | null; colonia?: string | null; ciudad?: string | null; estado?: string | null; cp?: string | null; email?: string | null; notas_ticket?: string | null; ticket_campos?: Record<string, boolean> | null };
  folio: string;
  fecha: string;
  clienteNombre: string;
  vendedorNombre?: string;
  vendedorTelefono?: string | null;
  lineas: { nombre: string; cantidad: number; precio: number; subtotal?: number; iva_pct?: number; iva_monto?: number; ieps_pct?: number; ieps_monto?: number; descuento_pct?: number; precio_lista_unitario?: number | null; descuento_promocion_monto?: number; descuento_manual_monto?: number; total: number; esCambio?: boolean; producto_id?: string; precio_sugerido_publico?: number }[];
  subtotal: number;
  iva: number;
  ieps?: number;
  descuentoDevolucion?: number;
  devoluciones?: DevolucionTicketItem[];
  total: number;
  condicionPago: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
  saldoAnterior?: number;
  pagoAplicado?: number;
  saldoNuevo?: number;
  promociones?: { descripcion: string; descuento: number; producto_id?: string; tipo?: string; cantidad_gratis?: number }[];
  pagos?: { metodo: string; monto: number; fecha?: string | null; referencia?: string | null }[];
  productosList?: Array<{ id: string; nombre?: string | null; nombre_ticket?: string | null; nombre_venta?: string | null }>;
  onPrintTicket?: () => void;
  onClose: () => void;
}

const MOTIVO_LABELS: Record<string, string> = {
  no_vendido: 'No vendido', vencido: 'Vencido', caducado: 'Caducado',
  danado: 'Dañado', cambio: 'Cambio', error_pedido: 'Error pedido', otro: 'Otro',
};
const ACCION_LABELS: Record<string, string> = {
  reposicion: 'Reposición', nota_credito: 'Nota crédito',
  devolucion_dinero: 'Dev. dinero', descuento_venta: 'Desc. venta',
};

function calcTicketSummary(params: {
  total: number;
  iva: number;
  ieps: number;
  descuentoPromos: number;
  descuentoDevolucion: number;
  condicionPago: string;
  montoRecibido?: number;
  cambio?: number;
  pagoAplicado?: number;
  saldoNuevo?: number;
  pagos: { monto: number }[];
}) {
  const descuentos = Math.max(params.descuentoPromos + params.descuentoDevolucion, 0);
  const impuestos = Math.max(params.iva + params.ieps, 0);
  const pagosTotal = params.pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const recibidoNeto = params.montoRecibido != null
    ? Math.max((Number(params.montoRecibido) || 0) - (Number(params.cambio ?? 0) || 0), 0)
    : 0;
  const pagoAplicado = Math.max(Number(params.pagoAplicado ?? 0) || 0, 0);
  const totalVenta = Math.max(Number(params.total) || 0, 0);
  const totalPagado = pagosTotal > 0
    ? pagosTotal
    : pagoAplicado > 0
      ? pagoAplicado
      : recibidoNeto > 0
        ? recibidoNeto
        : params.condicionPago !== 'contado'
          ? 0
          : totalVenta;
  const saldo = params.saldoNuevo != null
    ? Math.max(Number(params.saldoNuevo) || 0, 0)
    : Math.max(totalVenta - Math.min(totalPagado, totalVenta), 0);

  return { descuentos, impuestos, totalPagado, saldo };
}


export default function TicketVenta(props: TicketVentaProps) {
  const {
    empresa, folio, fecha, clienteNombre, vendedorNombre, vendedorTelefono, lineas: lineasRaw,
    subtotal, iva, ieps = 0, descuentoDevolucion = 0, devoluciones = [],
    total, condicionPago, metodoPago,
    montoRecibido, cambio, saldoAnterior, pagoAplicado, saldoNuevo, promociones = [], pagos = [], productosList, onPrintTicket, onClose,
  } = props;

  // Resuelve nombre_ticket (con fallback a nombre_venta y nombre principal) usando el cache de productos.
  const lineas = lineasRaw.map(l => {
    const prod = productosList?.find(p => p.id === l.producto_id);
    return prod ? { ...l, nombre: getNombreTicket(prod, l.nombre) } : l;
  });

  const { fmt } = useCurrency();

  // Configuración del ticket (ticket_campos): se respeta en TODAS las secciones.
  const tc = (empresa.ticket_campos ?? {}) as Record<string, boolean>;
  const showFolio = tc.folio !== false;
  const showFecha = tc.fecha !== false;
  const showCondicionPago = tc.condicion_pago !== false;
  const showClienteNombre = tc.cliente_nombre !== false;
  const showVendedorNombre = tc.vendedor_nombre !== false;
  const showVendedorTel = tc.vendedor_telefono !== false;
  const showImpuestos = tc.impuestos !== false;
  const showDescuentos = tc.descuentos !== false;
  const showSaldoCuenta = tc.saldo_cuenta !== false;
  const showRecibidoCambio = tc.recibido_cambio !== false;
  const showPromociones = tc.promociones !== false;
  const showPagosRecibidos = tc.pagos_recibidos !== false;
  const showDevoluciones = tc.devoluciones !== false;
  const showGracias = tc.mensaje_gracias !== false;

  // Desglose fiscal: impuestos desde los totales del encabezado (fiables) y el
  // gravable derivado del total real para que SIEMPRE cuadre; el descuento se
  // reconstruye desde las líneas (capta el "gratis").
  const resumen = computeResumenFromLineas(lineas.map(l => ({
    subtotal: l.subtotal,
    descuento_pct: l.descuento_pct,
    precio_unitario: l.precio,
    cantidad: l.cantidad,
    iva_monto: l.iva_monto,
    ieps_monto: l.ieps_monto,
    total: l.total,
  })));
  const ivaMonto = Number(iva) || 0;
  const iepsMonto = Number(ieps) || 0;
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Mismo criterio que el ticket de escritorio: si hay desglose guardado, el
  // subtotal sin impuestos sale de precio de lista × cantidad (no del total).
  const subtotalNetoGuardado = r2(lineas.reduce((s, l: any) => {
    const lista = Number(l.precio_lista_unitario);
    return s + (Number.isFinite(lista) ? r2(lista * (Number(l.cantidad) || 0)) : 0);
  }, 0));
  const descuentoNetoGuardado = r2(lineas.reduce((s, l: any) => {
    const bruto = (Number(l.descuento_promocion_monto) || 0) + (Number(l.descuento_manual_monto) || 0);
    if (bruto <= 0) return s;
    const divisor = (1 + (Number(l.ieps_pct) || 0) / 100) * (1 + (Number(l.iva_pct) || 0) / 100);
    return s + r2(divisor > 0 ? bruto / divisor : bruto);
  }, 0));
  const netoTotal = Math.max(0, (Number(total) || 0) - ivaMonto - iepsMonto);
  const descTicket = subtotalNetoGuardado > 0
    ? (descuentoNetoGuardado > 0 ? descuentoNetoGuardado : r2(subtotalNetoGuardado - netoTotal))
    : Math.max(resumen.descuento, 0);
  const sinImpTicket = subtotalNetoGuardado > 0 ? subtotalNetoGuardado : netoTotal + descTicket;
  const gravableTicket = subtotalNetoGuardado > 0
    ? Math.max(0, r2(sinImpTicket - descTicket))
    : netoTotal;
  // Modo sin desglose de impuestos: todo en bruto para que Subtotal − Desc = Total.
  const descuentoBrutoGuardado = r2(lineas.reduce((s, l: any) =>
    s + (Number(l.descuento_promocion_monto) || 0) + (Number(l.descuento_manual_monto) || 0), 0));
  const descBrutoTicket = descuentoBrutoGuardado > 0.005 ? descuentoBrutoGuardado : r2(descTicket);
  const subBrutoTicket = descBrutoTicket > 0.005
    ? r2((Number(total) || 0) + descBrutoTicket)
    : r2(sinImpTicket + ivaMonto + iepsMonto);



  const ticketRef = useRef<HTMLDivElement>(null);
  // 'ambos' = producto + totales, 'totales' = solo totales, 'ninguno' = sin impuestos
  const [taxMode, setTaxMode] = useState<'ambos' | 'totales' | 'ninguno'>('ambos');
  // Si la empresa desactivó el desglose de impuestos, se fuerza "ninguno".
  const taxModeEff: 'ambos' | 'totales' | 'ninguno' = showImpuestos ? taxMode : 'ninguno';

  const pagoLabel = condicionPago === 'credito' ? 'Crédito' : condicionPago === 'contado' ? 'Contado' : 'Por definir';
  const descuentoPromos = promociones.reduce((s, p) => s + (Number(p.descuento) || 0), 0);
  const summary = calcTicketSummary({
    total,
    iva,
    ieps,
    descuentoPromos,
    descuentoDevolucion,
    condicionPago,
    montoRecibido,
    cambio,
    pagoAplicado,
    saldoNuevo,
    pagos,
  });

  const handlePrint = () => {
    if (!ticketRef.current) return;
    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (!printWindow) return;
    const content = ticketRef.current.innerHTML;
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ticket ${folio}</title>
<style>
@page{size:80mm auto;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;width:80mm;padding:3mm;color:#222;background:#fff;line-height:1.4}
.tk{width:100%}
.tk-logo{display:block;max-height:32px;max-width:44mm;margin:0 auto 3px}
.tk-center{text-align:center}
.tk-empresa{font-size:11px;font-weight:700}
.tk-sub{font-size:8px;color:#666}
.tk-dash{border-top:1px dashed #aaa;margin:5px 0}
.tk-row{display:flex;justify-content:space-between;font-size:9px;line-height:1.6}
.tk-row .lbl{font-weight:700;color:#333}
.tk-row .val{color:#444;text-align:right}
.tk-section{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#555;margin-bottom:3px}
.tk-prod{display:flex;justify-content:space-between;font-size:10px;line-height:1.5;padding:1px 0}
.tk-prod .nm{flex:1;margin-right:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.tk-prod .pr{font-weight:600;white-space:nowrap}
.tk-prod.cambio .nm{color:#888;font-style:italic}
.tk-tot-row{display:flex;justify-content:space-between;font-size:9px;line-height:1.6}
.tk-tot-row .lbl{color:#666}
.tk-tot-row .val{font-weight:500}
.tk-grand{display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px dashed #aaa;padding-top:4px;margin-top:3px}
.tk-footer{text-align:center;font-size:7px;color:#999;margin-top:6px;padding-top:4px;border-top:1px dashed #ccc}
.tk-dev{font-size:8px;line-height:1.5}
@media print{body{width:80mm}}
</style></head><body><div class="tk">${content}</div>
<script>window.onload=function(){window.print();window.close()}</script></body></html>`);
    printWindow.document.close();
  };

  const handleShare = async () => {
    // Respeta la config del ticket (ticket_campos), igual que el ticket impreso.
    const tc = (empresa as any).ticket_campos ?? {};
    const text = [
      tc.nombre !== false ? empresa.nombre : '',
      tc.rfc !== false && empresa.rfc ? `RFC: ${empresa.rfc}` : '',
      tc.direccion !== false ? (empresa.direccion ?? '') : '',
      tc.telefono !== false && empresa.telefono ? `Tel: ${empresa.telefono}` : '',
      '─'.repeat(30),
      `Folio: ${folio}`,
      `Fecha: ${fecha}`,
      `Cliente: ${clienteNombre}`,
      `Pago: ${pagoLabel}`,
      metodoPago ? `Método: ${metodoPago}` : '',
      '─'.repeat(30),
      ...lineas.map(l => {
        const taxes = [
          (l.ieps_pct ?? 0) > 0 ? `IEPS ${l.ieps_pct}%` : '',
          (l.iva_pct ?? 0) > 0 ? `IVA ${l.iva_pct}%` : '',
        ].filter(Boolean).join(' + ');
        return `${l.cantidad}x ${l.nombre}${l.esCambio ? ' (CAMBIO)' : ''} ${fmt(l.total)}${taxes ? ` [${taxes}]` : ''}`;
      }),
      '─'.repeat(30),
      `Subtotal sin impuestos: ${fmt(sinImpTicket)}`,
      ...(descTicket > 0.005 ? [`Descuentos / promos: -${fmt(descTicket)}`] : []),
      `Subtotal gravable: ${fmt(gravableTicket)}`,
      ...(iepsMonto > 0.005 ? [`IEPS: ${fmt(iepsMonto)}`] : []),
      ...(ivaMonto > 0.005 ? [`IVA: ${fmt(ivaMonto)}`] : []),
      `Total: ${fmt(total)}`,
      `Pagado: ${fmt(summary.totalPagado)}`,
      `Saldo: ${fmt(summary.saldo)}`,
      ...(devoluciones.length > 0 ? [
        '─'.repeat(30),
        'DEVOLUCIONES:',
        ...devoluciones.map(d => `  ${d.cantidad}x ${d.nombre} → ${ACCION_LABELS[d.accion] || d.accion} (${MOTIVO_LABELS[d.motivo] || d.motivo})`),
      ] : []),
      montoRecibido ? `Recibido: ${fmt(montoRecibido)}` : '',
      cambio && cambio > 0 ? `Cambio: ${fmt(cambio)}` : '',
      '',
      'rutapp.mx',
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      try { await navigator.share({ title: `Ticket ${folio}`, text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 -ml-1"><X className="h-5 w-5 text-foreground" /></button>
          <h1 className="text-[16px] font-bold text-foreground">Comprobante</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPrintTicket ?? handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground/10 text-foreground text-[12px] font-semibold active:scale-95 transition-transform">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
          <button onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold active:scale-95 transition-transform">
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </button>
        </div>
      </div>

      {/* Tax display mode selector */}
      <div className="px-4 pt-3 flex items-center justify-center gap-1">
        <span className="text-[11px] text-muted-foreground mr-1">Impuestos:</span>
        {([['ambos', 'Producto + Total'], ['totales', 'Solo total'], ['ninguno', 'No mostrar']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setTaxMode(val)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${taxMode === val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 flex flex-col items-center">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-sm">

          {/* ─── Printable ticket ─── */}
          <div ref={ticketRef}>
            {(() => {
              const tc = (empresa as any).ticket_campos ?? {};
              const showLogo = tc.logo !== false;
              const showNombre = tc.nombre !== false;
              const showRazon = tc.razon_social !== false;
              const showRfc = tc.rfc !== false;
              const showDir = tc.direccion !== false;
              const showTel = tc.telefono !== false;
              const dir1 = [empresa.direccion, empresa.colonia].filter(Boolean).join(', ');
              const dir2 = [empresa.ciudad, empresa.estado, empresa.cp ? `CP ${empresa.cp}` : ''].filter(Boolean).join(', ');
              return (
                <div className="tk-center px-5 pt-4 pb-2">
                  {showLogo && empresa.logo_url && (
                    <img src={empresa.logo_url} alt={empresa.nombre} className="tk-logo h-8 max-w-[120px] object-contain mx-auto mb-1" />
                  )}
                  {showNombre && <p className="tk-empresa text-[12px] font-bold text-foreground">{empresa.nombre}</p>}
                  {showRazon && empresa.razon_social && <p className="tk-sub text-[9px] text-muted-foreground">{empresa.razon_social}</p>}
                  {showRfc && empresa.rfc && <p className="tk-sub text-[9px] text-muted-foreground">RFC: {empresa.rfc}</p>}
                  {showDir && dir1 && <p className="tk-sub text-[8px] text-muted-foreground mt-px">{dir1}</p>}
                  {showDir && dir2 && <p className="tk-sub text-[8px] text-muted-foreground">{dir2}</p>}
                  {showTel && empresa.telefono && <p className="tk-sub text-[8px] text-muted-foreground">Tel: {empresa.telefono}</p>}
                  {showDir && empresa.email && <p className="tk-sub text-[8px] text-muted-foreground">{empresa.email}</p>}
                </div>
              );
            })()}

            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Sale details */}
            <div className="px-5 py-2 space-y-0.5 text-[10px]">
              {(showFolio || showFecha) && (
                <div className="flex gap-4">
                  {showFolio && <span><span className="font-bold text-foreground">Folio </span><span className="text-muted-foreground font-mono">{folio}</span></span>}
                  {showFecha && <span><span className="font-bold text-foreground">Fecha </span><span className="text-muted-foreground">{fecha}</span></span>}
                </div>
              )}
              {showClienteNombre && (
                <div>
                  <span className="font-bold text-foreground">Cliente </span><span className="text-muted-foreground">{clienteNombre}</span>
                </div>
              )}
              {vendedorNombre && showVendedorNombre && (
                <div>
                  <span className="font-bold text-foreground">Vendedor </span><span className="text-muted-foreground">{vendedorNombre}</span>
                </div>
              )}
              {vendedorTelefono && showVendedorTel && (
                <div>
                  <span className="font-bold text-foreground">Tel. vend. </span><span className="text-muted-foreground">{vendedorTelefono}</span>
                </div>
              )}
              {showCondicionPago && (
                <div className="flex gap-4">
                  <span><span className="font-bold text-foreground">Pago </span><span className="text-muted-foreground">{pagoLabel}</span></span>
                  {metodoPago && (
                    <span><span className="font-bold text-foreground">Método </span><span className="text-muted-foreground capitalize">{metodoPago}</span></span>
                  )}
                </div>
              )}
            </div>


            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Products */}
            <div className="px-5 py-2">
              <p className="tk-section text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Productos</p>
              <div className="space-y-1">
                {lineas.map((l, i) => {
                  // ¿La promo regala la linea completa? -> se muestra GRATIS en
                  // vez del precio, con el precio original tachado (sin calculos).
                  const promosLinea = promociones.filter(p => p.producto_id && p.producto_id === l.producto_id);
                  const gratisQty = promosLinea
                    .filter(p => p.tipo === 'producto_gratis' || (Number(p.cantidad_gratis) || 0) > 0)
                    .reduce((s, p) => s + (Number(p.cantidad_gratis) || 0), 0);
                  const descLinea = promosLinea.reduce((s, p) => s + (Number(p.descuento) || 0), 0);
                  const esGratis = !l.esCambio && (Number(l.total) || 0) > 0 && (
                    gratisQty > 0
                      ? gratisQty >= (Number(l.cantidad) || 0) - 0.001
                      : descLinea > 0 && descLinea >= (Number(l.total) || 0) - 0.01
                  );
                  const promoGratis = promosLinea.find(p => p.tipo === 'producto_gratis' || (Number(p.cantidad_gratis) || 0) > 0) ?? promosLinea[0];
                  return (
                  <div key={i} className={`py-0.5 ${l.esCambio ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between items-baseline text-[11px]">
                      <span className="text-foreground font-medium flex-1 mr-2 truncate">
                        {l.cantidad}x {l.nombre}
                        {l.esCambio && <span className="text-muted-foreground text-[9px] ml-1 italic">(cambio)</span>}
                      </span>
                      {esGratis ? (
                        <span className="flex items-baseline gap-1 shrink-0">
                          <span className="text-muted-foreground line-through tabular-nums text-[9px]">{fmt(l.total)}</span>
                          <span className="text-green-600 font-bold text-[11px]">GRATIS</span>
                        </span>
                      ) : (
                        <span className="text-foreground font-semibold tabular-nums shrink-0">
                          {fmt(l.total)}
                        </span>
                      )}
                    </div>
                    {esGratis ? (
                      <div className="text-[8px] text-green-600 font-medium mt-px">🎁 {promoGratis?.descripcion || 'Promoción'}</div>
                    ) : !l.esCambio && (
                      <>
                        {/* Se quitó el precio unitario/base: cada renglón muestra solo su precio final (con impuestos). */}
                        {((l.descuento_pct ?? 0) > 0 || (taxModeEff === 'ambos' && ((l.iva_pct ?? 0) > 0 || (l.ieps_pct ?? 0) > 0)) || (l.precio_sugerido_publico ?? 0) > 0) && (
                          <div className="flex gap-2 text-[8px] text-muted-foreground mt-px flex-wrap">
                            {(l.descuento_pct ?? 0) > 0 && <span className="text-primary">-{l.descuento_pct}% dto</span>}
                            {taxModeEff === 'ambos' && (l.ieps_pct ?? 0) > 0 && <span>IEPS {l.ieps_pct}%{(l.ieps_monto ?? 0) > 0 ? ` (${fmt(l.ieps_monto!)})` : ''}</span>}
                            {taxModeEff === 'ambos' && (l.iva_pct ?? 0) > 0 && <span>IVA {l.iva_pct}%{(l.iva_monto ?? 0) > 0 ? ` (${fmt(l.iva_monto!)})` : ''}</span>}
                            {(l.precio_sugerido_publico ?? 0) > 0 && <span className="text-primary font-medium">Sug. público {fmt(l.precio_sugerido_publico!)}</span>}
                          </div>
                        )}
                        {promosLinea.map((p, pi) => (
                          <div key={pi} className="flex justify-between text-[8px] mt-px">
                            <span className="text-primary flex items-center gap-0.5">🏷️ {p.descripcion}</span>
                            <span className="text-primary font-bold tabular-nums">-{fmt(p.descuento)}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Devoluciones section */}
            {devoluciones.length > 0 && (
              <>
                <div className="tk-dash mx-5 border-t border-dashed border-border" />
                <div className="px-5 py-2">
                  <p className="tk-section text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Devoluciones</p>
                  <div className="space-y-0.5">
                    {devoluciones.map((d, i) => (
                      <div key={i} className="tk-dev text-[9px]">
                        <div className="flex justify-between">
                          <span className="text-foreground truncate flex-1 mr-2">{d.cantidad}x {d.nombre}</span>
                          <span className="text-muted-foreground shrink-0">{ACCION_LABELS[d.accion] || d.accion}</span>
                        </div>
                        <span className="text-[8px] text-muted-foreground italic">{MOTIVO_LABELS[d.motivo] || d.motivo}{d.monto > 0 ? ` · ${fmt(d.monto)}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="tk-dash mx-5 border-t border-dashed border-border" />

            {/* Totals */}
            {(() => {
              return (
            <div className="px-5 py-2 space-y-0.5">
              {/* Desglose: Subtotal sin impuestos → Descuentos → Subtotal gravable → IEPS/IVA → Total */}
              <div className="tk-tot-row flex justify-between text-[10px]">
                <span className="lbl text-muted-foreground">Subtotal sin impuestos</span>
                <span className="val text-foreground tabular-nums">{fmt(sinImpTicket)}</span>
              </div>
              {descTicket > 0.005 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-primary font-semibold">Descuentos / promos</span>
                  <span className="val text-primary font-bold tabular-nums">-{fmt(descTicket)}</span>
                </div>
              )}
              <div className="tk-tot-row flex justify-between text-[10px]">
                <span className="lbl text-muted-foreground">Subtotal gravable</span>
                <span className="val text-foreground tabular-nums">{fmt(gravableTicket)}</span>
              </div>
              {taxModeEff !== 'ninguno' && iepsMonto > 0.005 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-muted-foreground pl-2">IEPS{resumen.iepsRate != null ? ` ${resumen.iepsRate}%` : ''}</span>
                  <span className="val text-foreground tabular-nums">{fmt(iepsMonto)}</span>
                </div>
              )}
              {taxModeEff !== 'ninguno' && ivaMonto > 0.005 && (
                <div className="tk-tot-row flex justify-between text-[10px]">
                  <span className="lbl text-muted-foreground pl-2">IVA{resumen.ivaRate != null ? ` ${resumen.ivaRate}%` : ''}</span>
                  <span className="val text-foreground tabular-nums">{fmt(ivaMonto)}</span>
                </div>
              )}
              <div className="tk-grand flex justify-between items-baseline pt-1.5 mt-1 border-t border-dashed border-border">
                <span className="text-[12px] font-bold text-foreground">Total</span>
                <span className="text-[15px] font-bold text-primary tabular-nums">{fmt(total)}</span>
              </div>
              <div className="tk-tot-row flex justify-between text-[10px]">
                <span className="lbl text-muted-foreground">Pagado</span>
                <span className="val text-foreground tabular-nums">{fmt(summary.totalPagado)}</span>
              </div>
              <div className="tk-tot-row flex justify-between text-[10px]">
                <span className="lbl text-muted-foreground">Saldo</span>
                <span className={`val font-bold tabular-nums ${summary.saldo > 0 ? 'text-destructive' : 'text-green-600'}`}>{fmt(summary.saldo)}</span>
              </div>
              {montoRecibido != null && montoRecibido > 0 && (
                <div className="pt-1 space-y-0.5">
                  <div className="tk-tot-row flex justify-between text-[10px]">
                    <span className="lbl text-muted-foreground">Recibido</span>
                    <span className="val text-foreground tabular-nums">{fmt(montoRecibido)}</span>
                  </div>
                  {(cambio ?? 0) > 0 && (
                    <div className="tk-tot-row flex justify-between text-[10px]">
                      <span className="lbl text-muted-foreground">Cambio</span>
                      <span className="val text-primary font-bold tabular-nums">{fmt(cambio!)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
              );
            })()}

            {/* Balance / Saldo */}
            {true ? (
              <>
                <div className="tk-dash mx-5 border-t border-dashed border-border" />
                <div className="px-5 py-2 space-y-0.5">
                  <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Estado de cuenta</p>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Saldo anterior</span>
                    <span className="text-foreground tabular-nums">{fmt(saldoAnterior ?? 0)}</span>
                  </div>
                  {pagoAplicado != null && pagoAplicado > 0 && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Pago aplicado</span>
                      <span className="text-green-600 font-medium tabular-nums">-{fmt(pagoAplicado)}</span>
                    </div>
                  )}
                  {condicionPago === 'credito' && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">+ Esta venta (crédito)</span>
                      <span className="text-foreground tabular-nums">{fmt(total)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] font-bold pt-1 border-t border-dashed border-border">
                    <span className="text-foreground">Nuevo saldo</span>
                    <span className={`tabular-nums ${(saldoNuevo ?? 0) > 0 ? 'text-destructive' : 'text-green-600'}`}>{fmt(saldoNuevo ?? 0)}</span>
                  </div>
                </div>
              </>
            ) : null}

            {/* Pagos recibidos */}
            {pagos.length > 0 && (
              <>
                <div className="tk-dash mx-5 border-t border-dashed border-border" />
                <div className="px-5 py-2 space-y-0.5">
                  <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Pagos recibidos</p>
                  {pagos.map((p, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground capitalize">{p.fecha ? `${fmtDate(p.fecha)} ` : ''}{p.metodo}{p.referencia ? ` (${p.referencia})` : ''}</span>
                      <span className="text-foreground tabular-nums font-medium">{fmt(p.monto)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Footer */}
            <div className="tk-footer px-5 py-2.5 border-t border-dashed border-border text-center">
              <p className="text-[8px] text-muted-foreground">Gracias por su compra</p>
              {((empresa as any).ticket_campos?.notas_ticket !== false) && empresa.notas_ticket && <p className="text-[8px] text-muted-foreground">{empresa.notas_ticket}</p>}
              <p className="text-[8px] text-muted-foreground">rutapp.mx</p>
            </div>
          </div>
        </div>

        <button onClick={onClose}
          className="w-full max-w-sm mt-5 bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform">
          Listo
        </button>
      </div>
    </div>
  );
}
