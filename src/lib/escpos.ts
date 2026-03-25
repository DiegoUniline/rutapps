/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * Ultra-compact: everything fits on single lines, no wrapping.
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
const CUT          = [GS, 0x56, 0x41, 0x00];
const FEED2        = [ESC, 0x64, 0x02];

const encoder = new TextEncoder();

function text(s: string): number[] { return Array.from(encoder.encode(s)); }
function line(s: string): number[] { return [...text(s), LF]; }

/** Right-align a value after left text, pad with spaces, truncate to fit W */
function row(left: string, right: string, w: number): string {
  const maxLeft = w - right.length - 1;
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const gap = w - l.length - right.length;
  return l + ' '.repeat(Math.max(gap, 1)) + right;
}

function sep(w: number): string { return '-'.repeat(w); }

const fmtN = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string }): Uint8Array {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const W = is58 ? 32 : 48;
  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${fmtN(n)}`;

  const campos = {
    logo: true, nombre: true, razon_social: true, rfc: true,
    direccion: true, telefono: true, notas_ticket: true, impuestos: true,
    ...((data.empresa.ticket_campos as Record<string, boolean>) ?? {}),
  };

  const showTax = campos.impuestos !== false;
  const buf: number[] = [...INIT];

  // ── Header (center) ──
  buf.push(...ALIGN_CENTER);
  if (campos.nombre) {
    buf.push(...BOLD_ON, ...line(data.empresa.nombre), ...BOLD_OFF);
  }
  if (campos.razon_social && data.empresa.razon_social) buf.push(...line(data.empresa.razon_social));
  if (campos.rfc && data.empresa.rfc) buf.push(...line(`RFC: ${data.empresa.rfc}`));
  if (campos.direccion) {
    const p1: string[] = [];
    if (data.empresa.direccion) p1.push(data.empresa.direccion);
    if (data.empresa.colonia) p1.push(data.empresa.colonia);
    if (p1.length) buf.push(...line(p1.join(', ')));
    const p2: string[] = [];
    if (data.empresa.ciudad) p2.push(data.empresa.ciudad);
    if (data.empresa.estado) p2.push(data.empresa.estado);
    if (data.empresa.cp) p2.push(`CP${data.empresa.cp}`);
    if (p2.length) buf.push(...line(p2.join(', ')));
  }
  if (campos.telefono && data.empresa.telefono) buf.push(...line(`Tel:${data.empresa.telefono}`));
  if (data.empresa.email) buf.push(...line(data.empresa.email));
  buf.push(...ALIGN_LEFT, ...line(sep(W)));

  // ── Info ──
  buf.push(...line(row(`Folio:${data.folio}`, data.fecha, W)));
  buf.push(...line(`Cliente:${data.clienteNombre}`));
  const pago = data.condicionPago === 'credito' ? 'Credito' : data.condicionPago === 'contado' ? 'Contado' : 'P/definir';
  buf.push(...line(`Pago:${pago}${data.metodoPago ? ' ' + data.metodoPago : ''}`));
  buf.push(...line(sep(W)));

  // ── Products: single line each ──
  // Format: "2 Producto       $123.00"
  for (const l of data.lineas) {
    const prefix = `${l.cantidad} `;
    const price = fmt(l.total);
    // Name gets whatever space is left
    const nameMax = W - prefix.length - price.length - 1;
    const name = l.nombre.length > nameMax ? l.nombre.slice(0, nameMax) : l.nombre;
    const gap = W - prefix.length - name.length - price.length;
    buf.push(...line(prefix + name + ' '.repeat(Math.max(gap, 1)) + price));
  }
  buf.push(...line(sep(W)));

  // ── Totals ──
  if (showTax) {
    buf.push(...line(row('Subtotal', fmt(data.subtotal), W)));
    if (data.iva > 0) buf.push(...line(row('IVA', fmt(data.iva), W)));
    if ((data.ieps ?? 0) > 0) buf.push(...line(row('IEPS', fmt(data.ieps!), W)));
    buf.push(...line(sep(W)));
  }
  buf.push(...BOLD_ON, ...line(row('TOTAL', fmt(data.total), W)), ...BOLD_OFF);

  if (data.montoRecibido != null && data.montoRecibido > 0) {
    buf.push(...line(row('Recibido', fmt(data.montoRecibido), W)));
    if ((data.cambio ?? 0) > 0) buf.push(...line(row('Cambio', fmt(data.cambio!), W)));
  }

  // ── Saldo ──
  if ((data.saldoAnterior != null && data.saldoAnterior > 0) || (data.saldoNuevo != null && (data.saldoNuevo ?? 0) > 0)) {
    buf.push(...line(sep(W)));
    buf.push(...BOLD_ON, ...line('EDO.CUENTA'), ...BOLD_OFF);
    if (data.saldoAnterior != null && data.saldoAnterior > 0) buf.push(...line(row('Saldo ant', fmt(data.saldoAnterior), W)));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) buf.push(...line(row('Pago', `-${fmt(data.pagoAplicado)}`, W)));
    if (data.condicionPago === 'credito') buf.push(...line(row('+Venta', fmt(data.total), W)));
    buf.push(...line(sep(W)));
    buf.push(...BOLD_ON, ...line(row('Nuevo saldo', fmt(data.saldoNuevo ?? 0), W)), ...BOLD_OFF);
  }

  // ── Footer ──
  if (campos.notas_ticket && data.empresa.notas_ticket) {
    buf.push(...line(sep(W)));
    buf.push(...ALIGN_CENTER, ...line(data.empresa.notas_ticket));
  }
  buf.push(...ALIGN_CENTER, ...line(sep(W)));
  buf.push(...line('Uniline'));

  buf.push(...FEED2, ...CUT);
  return new Uint8Array(buf);
}
