/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * Fixed-width column layout to prevent price overflow / line jumping.
 */
import type { TicketData } from './ticketHtml';
import { getCurrencyConfig } from './currency';

const COLS_58 = 32;
const COLS_80 = 48;

const ESC = 0x1B;
const GS  = 0x1D;

const INIT         = [ESC, 0x40];
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_LEFT   = [ESC, 0x61, 0x00];
const BOLD_ON      = [ESC, 0x45, 0x01];
const BOLD_OFF     = [ESC, 0x45, 0x00];
const CUT          = [GS, 0x56, 0x42, 0x00];
const LF           = [0x0A];

const enc = new TextEncoder();

/** Strip accents and non-ASCII so byte length = char count */
function clean(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

/** Format number without locale (avoids non-ASCII separators) */
function fmtNum(n: number): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  // Add thousand separators manually with comma
  const [int, dec] = fixed.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + withCommas + '.' + dec;
}

/** Pad-right a string to exactly w chars, truncating if needed */
function padR(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  return s + ' '.repeat(w - s.length);
}

/** Pad-left a string to exactly w chars, truncating if needed */
function padL(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  return ' '.repeat(w - s.length) + s;
}

/** Build a row: left text padded-right + right text padded-left = exactly W chars */
function row(left: string, right: string, W: number): string {
  right = clean(right);
  left = clean(left);
  const rightW = Math.max(right.length, 1);
  const leftW = W - rightW;
  if (leftW < 1) return (left.slice(0, W - right.length - 1) + ' ' + right).slice(0, W);
  return padR(left, leftW) + padL(right, rightW);
}

/**
 * Word-wrap text into lines of max `w` chars.
 * Returns array of strings, each padded to exactly `w` chars.
 */
function wrap(s: string, w: number): string[] {
  s = clean(s).trim();
  if (s.length <= w) return [padR(s, w)];
  const result: string[] = [];
  while (s.length > w) {
    let cut = s.lastIndexOf(' ', w);
    if (cut < 1) cut = w;
    result.push(padR(s.slice(0, cut), w));
    s = s.slice(cut).trim();
  }
  if (s.length > 0) result.push(padR(s, w));
  return result;
}

/**
 * Build item lines with fixed price column on the RIGHT.
 * Product description wraps; price appears only on the first line.
 */
function itemLines(desc: string, price: string, W: number): string[] {
  const PRICE_W = Math.min(price.length + 1, 12); // +1 for spacing
  const LEFT_W = W - PRICE_W;
  const descLines = wrap(desc, LEFT_W);
  return [
    descLines[0] + padL(price, PRICE_W),
    ...descLines.slice(1).map(l => l + ' '.repeat(PRICE_W)),
  ];
}

function divider(w: number): string {
  return '-'.repeat(w);
}

/** Center text within w chars */
function center(s: string, w: number): string {
  s = clean(s);
  if (s.length >= w) return s.slice(0, w);
  const pad = Math.floor((w - s.length) / 2);
  return ' '.repeat(pad) + s;
}

export function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string; showTax?: boolean }): Uint8Array {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const W = is58 ? COLS_58 : COLS_80;

  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${fmtNum(n)}`;

  const parts: number[] = [];
  const add = (bytes: number[]) => { for (const b of bytes) parts.push(b); };
  const ln = (s: string) => { const encoded = enc.encode(s + '\n'); for (const b of encoded) parts.push(b); };

  add(INIT);

  // ── HEADER (centered via ESC/POS command) ──
  add(ALIGN_CENTER);
  add(BOLD_ON);
  ln(clean(data.empresa.nombre).slice(0, W));
  add(BOLD_OFF);
  if (data.empresa.razon_social) ln(clean(data.empresa.razon_social).slice(0, W));
  if (data.empresa.rfc) ln(clean(`RFC: ${data.empresa.rfc}`).slice(0, W));
  const dir = [data.empresa.direccion, data.empresa.colonia].filter(Boolean).join(', ');
  if (dir) {
    wrap(dir, W).forEach(l => ln(l.trim()));
  }
  const dir2Parts = [data.empresa.ciudad, data.empresa.estado, data.empresa.cp ? `CP ${data.empresa.cp}` : ''].filter(Boolean).join(', ');
  if (dir2Parts) ln(clean(dir2Parts).slice(0, W));
  if (data.empresa.telefono) ln(clean(`Tel: ${data.empresa.telefono}`).slice(0, W));
  if (data.empresa.email) ln(clean(data.empresa.email).slice(0, W));
  add(LF);

  // ── INFO (left) ──
  add(ALIGN_LEFT);
  ln(divider(W));
  ln(`Folio: ${clean(data.folio).slice(0, W - 7)}`);
  ln(`Fecha: ${clean(data.fecha).slice(0, W - 7)}`);
  ln(`Cliente: ${clean(data.clienteNombre).slice(0, W - 9)}`);
  const pagoLabel = data.condicionPago === 'credito' ? 'Credito' : 'Contado';
  ln(`Pago: ${pagoLabel}`);
  ln(divider(W));

  // ── PRODUCTOS ──
  for (const l of data.lineas) {
    const desc = `${l.cantidad}x ${clean(l.nombre)}`;
    const price = fmt(l.total);
    itemLines(desc, price, W).forEach(x => ln(x));
    // Detail: unit price (smaller, indented)
    if (l.precio > 0) {
      const detParts = [`  @${fmt(l.precio)}`];
      if ((l.iva_monto ?? 0) > 0) detParts.push(`IVA ${fmt(l.iva_monto!)}`);
      const det = detParts.join(' ');
      ln(clean(det).slice(0, W));
    }
  }
  ln(divider(W));

  // ── TOTALES ──
  ln(row('Subtotal', fmt(data.subtotal), W));
  if (data.iva > 0) ln(row('IVA', fmt(data.iva), W));
  if ((data.ieps ?? 0) > 0) ln(row('IEPS', fmt(data.ieps!), W));
  ln(divider(W));
  add(BOLD_ON);
  ln(row('TOTAL', fmt(data.total), W));
  add(BOLD_OFF);

  if (data.montoRecibido && data.montoRecibido > 0) {
    ln(row('Recibido', fmt(data.montoRecibido), W));
    if ((data.cambio ?? 0) > 0) ln(row('Cambio', fmt(data.cambio!), W));
  }

  // ── SALDO ──
  if ((data.saldoAnterior != null && data.saldoAnterior > 0) || (data.saldoNuevo != null && (data.saldoNuevo ?? 0) > 0)) {
    ln(divider(W));
    add(BOLD_ON);
    ln('EDO. CUENTA');
    add(BOLD_OFF);
    if (data.saldoAnterior != null && data.saldoAnterior > 0) ln(row('Saldo ant', fmt(data.saldoAnterior), W));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) ln(row('Pago', `-${fmt(data.pagoAplicado)}`, W));
    if (data.condicionPago === 'credito') ln(row('+Venta', fmt(data.total), W));
    ln(divider(W));
    add(BOLD_ON);
    ln(row('Saldo', fmt(data.saldoNuevo ?? 0), W));
    add(BOLD_OFF);
  }

  // ── FOOTER ──
  add(LF);
  add(ALIGN_CENTER);
  ln('Gracias por su compra');
  if (data.empresa.notas_ticket) {
    wrap(data.empresa.notas_ticket, W).forEach(l => ln(l.trim()));
  }
  ln('');
  ln('Elaborado por Uniline');
  add(LF); add(LF); add(LF);
  add(CUT);

  return new Uint8Array(parts);
}
