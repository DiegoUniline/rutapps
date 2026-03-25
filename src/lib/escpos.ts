/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * Converts TicketData into raw bytes ready to send via Bluetooth.
 */
import type { TicketData } from './ticketHtml';
import { getCurrencyConfig } from './currency';

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

// Commands
const INIT        = [ESC, 0x40];                   // Initialize printer
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_LEFT   = [ESC, 0x61, 0x00];
const BOLD_ON     = [ESC, 0x45, 0x01];
const BOLD_OFF    = [ESC, 0x45, 0x00];
const DOUBLE_SIZE = [GS, 0x21, 0x11];              // Double width+height
const NORMAL_SIZE = [GS, 0x21, 0x00];
const CUT         = [GS, 0x56, 0x41, 0x00];        // Partial cut
const FEED3       = [ESC, 0x64, 0x03];              // Feed 3 lines

const encoder = new TextEncoder();

function text(s: string): number[] { return Array.from(encoder.encode(s)); }
function line(s: string): number[] { return [...text(s), LF]; }

/** Pad/truncate left-aligned text to `w` chars */
function padR(s: string, w: number): string { return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); }

/** Pad right-aligned text */
function padL(s: string, w: number): string { return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s; }

/** Two-column line: left text + right text, filling middle with spaces */
function cols(left: string, right: string, w: number): string {
  const gap = w - left.length - right.length;
  if (gap < 1) return (left + ' ' + right).slice(0, w);
  return left + ' '.repeat(gap) + right;
}

/** Dashed separator */
function sep(w: number): string { return '-'.repeat(w); }

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string }): Uint8Array {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const W = is58 ? 32 : 48; // chars per line
  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${fmtNum(n)}`;

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
    buf.push(...BOLD_ON, ...DOUBLE_SIZE);
    buf.push(...line(data.empresa.nombre));
    buf.push(...NORMAL_SIZE, ...BOLD_OFF);
  }
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
    if (data.empresa.cp) parts2.push(`C.P. ${data.empresa.cp}`);
    if (parts2.length) buf.push(...line(parts2.join(', ')));
  }
  if (campos.telefono && data.empresa.telefono) buf.push(...line(`Tel: ${data.empresa.telefono}`));
  if (data.empresa.email) buf.push(...line(data.empresa.email));
  buf.push(...line(sep(W)));

  // ─── Info ───
  buf.push(...ALIGN_LEFT);
  buf.push(...line(`Folio: ${data.folio}`));
  buf.push(...line(`Fecha: ${data.fecha}`));
  buf.push(...line(`Cliente: ${data.clienteNombre}`));
  const pagoLabel = data.condicionPago === 'credito' ? 'Crédito' : data.condicionPago === 'contado' ? 'Contado' : 'Por definir';
  let pagoLine = `Pago: ${pagoLabel}`;
  if (data.metodoPago) pagoLine += `  Método: ${data.metodoPago}`;
  buf.push(...line(pagoLine));
  buf.push(...line(sep(W)));

  // ─── Products ───
  buf.push(...BOLD_ON, ...line('PRODUCTOS'), ...BOLD_OFF);
  for (const l of data.lineas) {
    const nameStr = `${l.cantidad}x ${l.nombre}`;
    const totalStr = fmt(l.total);
    // First line: name (may wrap) + total right-aligned
    if (nameStr.length + totalStr.length + 1 <= W) {
      buf.push(...line(cols(nameStr, totalStr, W)));
    } else {
      buf.push(...line(nameStr));
      buf.push(...line(padL(totalStr, W)));
    }
    // Detail line
    if (!l.esCambio) {
      const details: string[] = [`${fmt(l.precio)} c/u`];
      if ((l.descuento_pct ?? 0) > 0) details.push(`-${l.descuento_pct}%`);
      if (showTax && (l.iva_monto ?? 0) > 0) details.push(`IVA ${fmt(l.iva_monto!)}`);
      if (showTax && (l.ieps_monto ?? 0) > 0) details.push(`IEPS ${fmt(l.ieps_monto!)}`);
      buf.push(...line(`  ${details.join(' | ')}`));
    }
  }
  buf.push(...line(sep(W)));

  // ─── Totals ───
  if (showTax) {
    buf.push(...line(cols('Subtotal', fmt(data.subtotal), W)));
    if (data.iva > 0) buf.push(...line(cols('IVA', fmt(data.iva), W)));
    if ((data.ieps ?? 0) > 0) buf.push(...line(cols('IEPS', fmt(data.ieps!), W)));
    buf.push(...line(sep(W)));
  }
  buf.push(...BOLD_ON, ...DOUBLE_SIZE);
  buf.push(...line(cols('TOTAL', fmt(data.total), is58 ? 16 : 24)));
  buf.push(...NORMAL_SIZE, ...BOLD_OFF);

  // Received / change
  if (data.montoRecibido != null && data.montoRecibido > 0) {
    buf.push(...line(cols('Recibido', fmt(data.montoRecibido), W)));
    if ((data.cambio ?? 0) > 0) buf.push(...line(cols('Cambio', fmt(data.cambio!), W)));
  }

  // ─── Account balance ───
  if ((data.saldoAnterior != null && data.saldoAnterior > 0) || (data.saldoNuevo != null && (data.saldoNuevo ?? 0) > 0)) {
    buf.push(...line(sep(W)));
    buf.push(...BOLD_ON, ...line('ESTADO DE CUENTA'), ...BOLD_OFF);
    if (data.saldoAnterior != null && data.saldoAnterior > 0) buf.push(...line(cols('Saldo anterior', fmt(data.saldoAnterior), W)));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) buf.push(...line(cols('Pago aplicado', `-${fmt(data.pagoAplicado)}`, W)));
    if (data.condicionPago === 'credito') buf.push(...line(cols('+ Esta venta', fmt(data.total), W)));
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
  buf.push(...line('Elaborado por Uniline'));

  // Feed and cut
  buf.push(...FEED3, ...CUT);

  return new Uint8Array(buf);
}
