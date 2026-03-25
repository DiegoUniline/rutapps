/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * Conservative column widths to avoid wrapping on cheap 58mm printers.
 */
import type { TicketData } from './ticketHtml';
import { getCurrencyConfig } from './currency';

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const INIT         = [ESC, 0x40];
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_LEFT   = [ESC, 0x61, 0x00];
const BOLD_ON      = [ESC, 0x45, 0x01];
const BOLD_OFF     = [ESC, 0x45, 0x00];
const FONT_B       = [ESC, 0x4D, 0x01];  // Smaller font
const FONT_A       = [ESC, 0x4D, 0x00];  // Normal font
const DOUBLE_W     = [GS, 0x21, 0x10];   // Double width only
const NORMAL_SIZE  = [GS, 0x21, 0x00];
const CUT          = [GS, 0x56, 0x41, 0x00];
const FEED2        = [ESC, 0x64, 0x02];

const encoder = new TextEncoder();

function text(s: string): number[] { return Array.from(encoder.encode(s)); }
function line(s: string): number[] { return [...text(s), LF]; }

function padR(s: string, w: number): string { return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); }
function padL(s: string, w: number): string { return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s; }

function cols(left: string, right: string, w: number): string {
  const gap = w - left.length - right.length;
  if (gap < 1) return (left + ' ' + right).slice(0, w);
  return left + ' '.repeat(gap) + right;
}

function sep(w: number): string { return '-'.repeat(w); }

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string }): Uint8Array {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  // Conservative: 30 chars for 58mm (some printers can't do 32)
  const W = is58 ? 30 : 46;
  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${fmtNum(n)}`;
  // Short format for product lines (no symbol, saves space)
  const fmtShort = (n: number) => fmtNum(n);

  const campos = {
    logo: true, nombre: true, razon_social: true, rfc: true,
    direccion: true, telefono: true, notas_ticket: true, impuestos: true,
    ...((data.empresa.ticket_campos as Record<string, boolean>) ?? {}),
  };

  const showTax = campos.impuestos !== false;
  const buf: number[] = [...INIT];

  // ─── Header ───
  buf.push(...ALIGN_CENTER);
  if (campos.nombre) {
    buf.push(...BOLD_ON);
    buf.push(...line(data.empresa.nombre));
    buf.push(...BOLD_OFF);
  }
  buf.push(...FONT_B);
  if (campos.razon_social && data.empresa.razon_social) buf.push(...line(data.empresa.razon_social));
  if (campos.rfc && data.empresa.rfc) buf.push(...line(`RFC: ${data.empresa.rfc}`));
  if (campos.direccion) {
    const parts: string[] = [];
    if (data.empresa.direccion) parts.push(data.empresa.direccion);
    if (data.empresa.colonia) parts.push(data.empresa.colonia);
    if (parts.length) buf.push(...line(parts.join(', ')));
    const parts2: string[] = [];
    if (data.empresa.ciudad) parts2.push(data.empresa.ciudad);
    if (data.empresa.estado) parts2.push(data.empresa.estado);
    if (data.empresa.cp) parts2.push(`CP ${data.empresa.cp}`);
    if (parts2.length) buf.push(...line(parts2.join(', ')));
  }
  if (campos.telefono && data.empresa.telefono) buf.push(...line(`Tel: ${data.empresa.telefono}`));
  if (data.empresa.email) buf.push(...line(data.empresa.email));
  buf.push(...FONT_A);
  buf.push(...line(sep(W)));

  // ─── Info ───
  buf.push(...ALIGN_LEFT);
  buf.push(...line(`Folio: ${data.folio}`));
  buf.push(...line(`Fecha: ${data.fecha}`));
  buf.push(...line(`Cliente: ${data.clienteNombre}`));
  const pagoLabel = data.condicionPago === 'credito' ? 'Crédito' : data.condicionPago === 'contado' ? 'Contado' : 'Por definir';
  buf.push(...line(`Pago: ${pagoLabel}${data.metodoPago ? ` (${data.metodoPago})` : ''}`));
  buf.push(...line(sep(W)));

  // ─── Products ───
  // Simple format: each product on one line, compact
  for (const l of data.lineas) {
    // Line 1: "1x Producto"
    buf.push(...line(`${l.cantidad}x ${l.nombre}`));
    // Line 2: right-aligned price "    $0.00 c/u  = $0.00"
    if (!l.esCambio && l.precio > 0) {
      const pricePart = `${sym}${fmtShort(l.precio)}c/u`;
      const totalPart = `${fmt(l.total)}`;
      buf.push(...FONT_B);
      buf.push(...line(cols(`  ${pricePart}`, totalPart, W)));
      buf.push(...FONT_A);
    } else {
      buf.push(...line(padL(fmt(l.total), W)));
    }
  }
  buf.push(...line(sep(W)));

  // ─── Totals ───
  if (showTax) {
    buf.push(...line(cols('Subtotal:', fmt(data.subtotal), W)));
    if (data.iva > 0) buf.push(...line(cols('IVA:', fmt(data.iva), W)));
    if ((data.ieps ?? 0) > 0) buf.push(...line(cols('IEPS:', fmt(data.ieps!), W)));
    buf.push(...line(sep(W)));
  }
  buf.push(...BOLD_ON, ...DOUBLE_W);
  // In double-width mode, chars are 2x so halve the width
  const totalW = Math.floor(W / 2);
  buf.push(...line(cols('TOTAL', fmt(data.total), totalW)));
  buf.push(...NORMAL_SIZE, ...BOLD_OFF);

  // Received / change
  if (data.montoRecibido != null && data.montoRecibido > 0) {
    buf.push(...line(cols('Recibido:', fmt(data.montoRecibido), W)));
    if ((data.cambio ?? 0) > 0) buf.push(...line(cols('Cambio:', fmt(data.cambio!), W)));
  }

  // ─── Account balance ───
  if ((data.saldoAnterior != null && data.saldoAnterior > 0) || (data.saldoNuevo != null && (data.saldoNuevo ?? 0) > 0)) {
    buf.push(...line(sep(W)));
    buf.push(...BOLD_ON, ...line('ESTADO DE CUENTA'), ...BOLD_OFF);
    if (data.saldoAnterior != null && data.saldoAnterior > 0) buf.push(...line(cols('Saldo ant:', fmt(data.saldoAnterior), W)));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) buf.push(...line(cols('Pago:', `-${fmt(data.pagoAplicado)}`, W)));
    if (data.condicionPago === 'credito') buf.push(...line(cols('+Venta:', fmt(data.total), W)));
    buf.push(...line(sep(W)));
    buf.push(...BOLD_ON, ...line(cols('Nuevo saldo', fmt(data.saldoNuevo ?? 0), W)), ...BOLD_OFF);
  }

  // ─── Footer ───
  if (campos.notas_ticket && data.empresa.notas_ticket) {
    buf.push(...line(sep(W)));
    buf.push(...ALIGN_CENTER, ...line(data.empresa.notas_ticket));
  }
  buf.push(...ALIGN_CENTER);
  buf.push(...line(sep(W)));
  buf.push(...FONT_B, ...line('Elaborado por Uniline'), ...FONT_A);

  buf.push(...FEED2, ...CUT);

  return new Uint8Array(buf);
}
