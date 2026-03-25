/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * Compact table-style layout for professional-looking tickets.
 */
import type { TicketData } from './ticketHtml';
import { getCurrencyConfig } from './currency';

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

// Commands
const INIT         = [ESC, 0x40];                   // Initialize printer
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_LEFT   = [ESC, 0x61, 0x00];
const BOLD_ON      = [ESC, 0x45, 0x01];
const BOLD_OFF     = [ESC, 0x45, 0x00];
const FONT_B       = [ESC, 0x4D, 0x01];             // Smaller font (Font B)
const FONT_A       = [ESC, 0x4D, 0x00];             // Normal font (Font A)
const DOUBLE_W     = [GS, 0x21, 0x10];              // Double width only
const NORMAL_SIZE  = [GS, 0x21, 0x00];
const CUT          = [GS, 0x56, 0x41, 0x00];        // Partial cut
const FEED2        = [ESC, 0x64, 0x02];              // Feed 2 lines
const LINE_SPACING_TIGHT = [ESC, 0x33, 0x12];       // Tight line spacing (18 dots)
const LINE_SPACING_DEFAULT = [ESC, 0x32];            // Default line spacing

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

/** Three-column line: qty | name | total */
function cols3(qty: string, name: string, total: string, w: number): string {
  const qtyW = qty.length + 1; // "2x "
  const totalW = total.length;
  const nameW = w - qtyW - totalW - 1;
  const nameTrunc = name.length > nameW ? name.slice(0, nameW) : name;
  return qty + ' ' + padR(nameTrunc, nameW) + ' ' + total;
}

/** Dashed separator */
function sep(w: number): string { return '-'.repeat(w); }

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string }): Uint8Array {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const W = is58 ? 32 : 48; // chars per line (Font A)
  const WB = is58 ? 42 : 64; // chars per line (Font B — smaller)
  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${fmtNum(n)}`;

  const campos = {
    logo: true, nombre: true, razon_social: true, rfc: true,
    direccion: true, telefono: true, notas_ticket: true, impuestos: true,
    ...((data.empresa.ticket_campos as Record<string, boolean>) ?? {}),
  };

  const showTax = campos.impuestos !== false;
  const buf: number[] = [...INIT, ...LINE_SPACING_TIGHT];

  // ─── Header (centered, compact) ───
  buf.push(...ALIGN_CENTER);
  if (campos.nombre) {
    buf.push(...BOLD_ON, ...DOUBLE_W);
    buf.push(...line(data.empresa.nombre));
    buf.push(...NORMAL_SIZE, ...BOLD_OFF);
  }
  buf.push(...FONT_B); // Switch to small font for header details
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

  // ─── Info (compact, two items per line where possible) ───
  buf.push(...ALIGN_LEFT, ...FONT_B);
  buf.push(...line(cols(`Folio: ${data.folio}`, `Fecha: ${data.fecha}`, WB)));
  buf.push(...line(`Cliente: ${data.clienteNombre}`));
  const pagoLabel = data.condicionPago === 'credito' ? 'Crédito' : data.condicionPago === 'contado' ? 'Contado' : 'Por definir';
  let pagoLine = `Pago: ${pagoLabel}`;
  if (data.metodoPago) pagoLine += `  Met: ${data.metodoPago}`;
  buf.push(...line(pagoLine));
  buf.push(...FONT_A);
  buf.push(...line(sep(W)));

  // ─── Products (table style) ───
  buf.push(...BOLD_ON);
  buf.push(...line(cols3('Cant', 'Producto', 'Importe', W)));
  buf.push(...BOLD_OFF);
  buf.push(...line(sep(W)));

  for (const l of data.lineas) {
    const qtyStr = `${l.cantidad}x`;
    const totalStr = fmt(l.total);
    // Table row: qty | product name | total
    buf.push(...line(cols3(qtyStr, l.nombre, totalStr, W)));

    // Detail line in small font (only if has meaningful info)
    if (!l.esCambio) {
      const details: string[] = [];
      if (l.precio > 0) details.push(`${fmt(l.precio)}c/u`);
      if ((l.descuento_pct ?? 0) > 0) details.push(`-${l.descuento_pct}%`);
      if (showTax && (l.iva_monto ?? 0) > 0) details.push(`IVA${fmt(l.iva_monto!)}`);
      if (showTax && (l.ieps_monto ?? 0) > 0) details.push(`IEPS${fmt(l.ieps_monto!)}`);
      if (details.length > 0) {
        buf.push(...FONT_B);
        buf.push(...line(`  ${details.join(' ')}`));
        buf.push(...FONT_A);
      }
    }
  }
  buf.push(...line(sep(W)));

  // ─── Totals ───
  if (showTax) {
    buf.push(...FONT_B);
    buf.push(...line(cols('Subtotal', fmt(data.subtotal), WB)));
    if (data.iva > 0) buf.push(...line(cols('IVA', fmt(data.iva), WB)));
    if ((data.ieps ?? 0) > 0) buf.push(...line(cols('IEPS', fmt(data.ieps!), WB)));
    buf.push(...FONT_A);
    buf.push(...line(sep(W)));
  }
  buf.push(...BOLD_ON, ...DOUBLE_W);
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
    buf.push(...FONT_B);
    if (data.saldoAnterior != null && data.saldoAnterior > 0) buf.push(...line(cols('Saldo ant.', fmt(data.saldoAnterior), WB)));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) buf.push(...line(cols('Pago aplic.', `-${fmt(data.pagoAplicado)}`, WB)));
    if (data.condicionPago === 'credito') buf.push(...line(cols('+ Esta venta', fmt(data.total), WB)));
    buf.push(...FONT_A);
    buf.push(...line(sep(W)));
    buf.push(...BOLD_ON, ...line(cols('Nuevo saldo', fmt(data.saldoNuevo ?? 0), W)), ...BOLD_OFF);
  }

  // ─── Footer ───
  if (campos.notas_ticket && data.empresa.notas_ticket) {
    buf.push(...line(sep(W)));
    buf.push(...ALIGN_CENTER, ...FONT_B, ...line(data.empresa.notas_ticket), ...FONT_A);
  }
  buf.push(...ALIGN_CENTER, ...FONT_B);
  buf.push(...line(sep(W)));
  buf.push(...line('Elaborado por Uniline'));
  buf.push(...FONT_A, ...LINE_SPACING_DEFAULT);

  // Feed and cut
  buf.push(...FEED2, ...CUT);

  return new Uint8Array(buf);
}
