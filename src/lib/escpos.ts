/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * Uses W=24 and strips accents so byte-length matches print columns.
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

/** Strip accents and non-ASCII so byte length = char count */
function clean(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

function bytes(s: string): number[] { return Array.from(encoder.encode(s)); }
function line(s: string): number[] { return [...bytes(s), LF]; }

function sep(w: number): string { return '-'.repeat(w); }

/** Two-column row: left-aligned text + right-aligned text, fits in exactly w chars */
function row(left: string, right: string, w: number): string {
  left = clean(left);
  right = clean(right);
  const maxLeft = Math.max(1, w - right.length - 1);
  if (left.length > maxLeft) left = left.slice(0, maxLeft);
  const gap = w - left.length - right.length;
  return left + ' '.repeat(Math.max(gap, 1)) + right;
}

/** Center text within w chars */
function center(s: string, w: number): string {
  s = clean(s);
  if (s.length >= w) return s.slice(0, w);
  const pad = Math.floor((w - s.length) / 2);
  return ' '.repeat(pad) + s;
}

const money = (sym: string, n: number) => `${sym}${n.toFixed(2)}`;

export function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string }): Uint8Array {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const W = is58 ? 32 : 48;
  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => money(sym, n);

  const campos = {
    logo: true, nombre: true, razon_social: true, rfc: true,
    direccion: true, telefono: true, notas_ticket: true, impuestos: true,
    ...((data.empresa.ticket_campos as Record<string, boolean>) ?? {}),
  };

  const showTax = campos.impuestos !== false;
  const buf: number[] = [...INIT];

  // ── Header ──
  buf.push(...ALIGN_CENTER);
  if (campos.nombre) {
    buf.push(...BOLD_ON, ...line(clean(data.empresa.nombre)), ...BOLD_OFF);
  }
  if (campos.razon_social && data.empresa.razon_social) buf.push(...line(clean(data.empresa.razon_social)));
  if (campos.rfc && data.empresa.rfc) buf.push(...line(clean(`RFC:${data.empresa.rfc}`)));
  if (campos.direccion) {
    const p: string[] = [];
    if (data.empresa.direccion) p.push(data.empresa.direccion);
    if (data.empresa.colonia) p.push(data.empresa.colonia);
    if (p.length) buf.push(...line(clean(p.join(','))));
    const p2: string[] = [];
    if (data.empresa.ciudad) p2.push(data.empresa.ciudad);
    if (data.empresa.estado) p2.push(data.empresa.estado);
    if (data.empresa.cp) p2.push(`CP${data.empresa.cp}`);
    if (p2.length) buf.push(...line(clean(p2.join(','))));
  }
  if (campos.telefono && data.empresa.telefono) buf.push(...line(clean(`Tel:${data.empresa.telefono}`)));
  if (data.empresa.email) buf.push(...line(clean(data.empresa.email)));
  buf.push(...ALIGN_LEFT, ...line(sep(W)));

  // ── Info ──
  buf.push(...line(clean(`Folio:${data.folio}`)));
  buf.push(...line(clean(`Fecha:${data.fecha}`)));
  buf.push(...line(clean(`Cliente:${data.clienteNombre}`)));
  const pago = data.condicionPago === 'credito' ? 'Credito' : data.condicionPago === 'contado' ? 'Contado' : 'P/definir';
  buf.push(...line(clean(`Pago:${pago}${data.metodoPago ? ' ' + data.metodoPago : ''}`)));
  buf.push(...line(sep(W)));

  // ── Products: one line each ──
  for (const l of data.lineas) {
    buf.push(...line(row(`${l.cantidad}x ${l.nombre}`, fmt(l.total), W)));
  }
  buf.push(...line(sep(W)));

  // ── Totals ──
  if (showTax) {
    buf.push(...line(row('SUBTOTAL', fmt(data.subtotal), W)));
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
    buf.push(...BOLD_ON, ...line(clean('EDO.CUENTA')), ...BOLD_OFF);
    if (data.saldoAnterior != null && data.saldoAnterior > 0) buf.push(...line(row('Saldo ant', fmt(data.saldoAnterior), W)));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) buf.push(...line(row('Pago', `-${fmt(data.pagoAplicado)}`, W)));
    if (data.condicionPago === 'credito') buf.push(...line(row('+Venta', fmt(data.total), W)));
    buf.push(...line(sep(W)));
    buf.push(...BOLD_ON, ...line(row('Saldo', fmt(data.saldoNuevo ?? 0), W)), ...BOLD_OFF);
  }

  // ── Footer ──
  if (campos.notas_ticket && data.empresa.notas_ticket) {
    buf.push(...line(sep(W)));
    buf.push(...ALIGN_CENTER, ...line(clean(data.empresa.notas_ticket)));
  }
  buf.push(...ALIGN_CENTER, ...line(sep(W)));
  buf.push(...line(clean('Uniline')));

  buf.push(...FEED2, ...CUT);
  return new Uint8Array(buf);
}
