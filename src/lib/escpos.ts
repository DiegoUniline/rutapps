/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * 58mm = 32 columns (Font A), 80mm = 48 columns.
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

const encoder = new TextEncoder();

/** Strip accents and non-ASCII so byte length = char count */
function clean(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
}

function center(s: string, w: number): string {
  s = clean(s).substring(0, w);
  const pad = Math.floor((w - s.length) / 2);
  return ' '.repeat(Math.max(0, pad)) + s;
}

function row(left: string, right: string, w: number): string {
  left = clean(left);
  right = clean(right);
  const space = w - left.length - right.length;
  if (space <= 0) {
    return (left.substring(0, w - right.length - 1) + ' ' + right).substring(0, w);
  }
  return left + ' '.repeat(space) + right;
}

function divider(w: number): string {
  return '-'.repeat(w);
}

export function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string }): Uint8Array {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const W = is58 ? COLS_58 : COLS_80;

  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) =>
    `${sym}${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const parts: number[] = [];
  const add = (bytes: number[]) => parts.push(...bytes);
  const line = (s: string) => {
    add(Array.from(encoder.encode(s + '\n')));
  };

  add(INIT);

  // ── HEADER ──
  add(ALIGN_CENTER);
  add(BOLD_ON);
  line(clean(data.empresa.nombre).substring(0, W));
  add(BOLD_OFF);
  if (data.empresa.razon_social) line(clean(data.empresa.razon_social).substring(0, W));
  if (data.empresa.rfc) line(`RFC: ${data.empresa.rfc}`);
  const dir = [data.empresa.direccion, data.empresa.colonia].filter(Boolean).join(', ');
  if (dir) line(clean(dir).substring(0, W));
  const dir2 = [data.empresa.ciudad, data.empresa.estado, data.empresa.cp ? `CP ${data.empresa.cp}` : ''].filter(Boolean).join(', ');
  if (dir2) line(clean(dir2).substring(0, W));
  if (data.empresa.telefono) line(`Tel: ${data.empresa.telefono}`);
  if (data.empresa.email) line(data.empresa.email);
  add(LF);

  // ── INFO ──
  add(ALIGN_LEFT);
  line(divider(W));
  line(`Folio: ${data.folio}`);
  line(`Fecha: ${data.fecha}`);
  line(`Cliente: ${clean(data.clienteNombre).substring(0, W - 9)}`);
  const pagoLabel = data.condicionPago === 'credito' ? 'Credito' : 'Contado';
  line(`Pago: ${pagoLabel}`);
  line(divider(W));

  // ── PRODUCTOS HEADER ──
  add(BOLD_ON);
  line(row('Cant Producto', 'Importe', W));
  add(BOLD_OFF);
  line(divider(W));

  // ── LÍNEAS ──
  for (const l of data.lineas) {
    const nombre = clean(l.nombre).substring(0, W - 10);
    const importe = fmt(l.total);
    line(row(`${l.cantidad}x ${nombre}`, importe, W));
    // detalle precio unitario + IVA
    const det = `  ${fmt(l.precio)}c/u${(l.iva_monto ?? 0) > 0 ? ` IVA${fmt(l.iva_monto!)}` : ''}`;
    line(clean(det).substring(0, W));
  }
  line(divider(W));

  // ── TOTALES ──
  add(LF);
  line(row('Subtotal', fmt(data.subtotal), W));
  if (data.iva > 0) line(row('IVA', fmt(data.iva), W));
  if ((data.ieps ?? 0) > 0) line(row('IEPS', fmt(data.ieps!), W));
  line(divider(W));
  add(BOLD_ON);
  line(row('TOTAL', fmt(data.total), W));
  add(BOLD_OFF);

  if (data.montoRecibido && data.montoRecibido > 0) {
    line(row('Recibido', fmt(data.montoRecibido), W));
    if ((data.cambio ?? 0) > 0) line(row('Cambio', fmt(data.cambio!), W));
  }

  // ── SALDO ──
  if ((data.saldoAnterior != null && data.saldoAnterior > 0) || (data.saldoNuevo != null && (data.saldoNuevo ?? 0) > 0)) {
    line(divider(W));
    add(BOLD_ON);
    line(clean('EDO. CUENTA'));
    add(BOLD_OFF);
    if (data.saldoAnterior != null && data.saldoAnterior > 0) line(row('Saldo ant', fmt(data.saldoAnterior), W));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) line(row('Pago', `-${fmt(data.pagoAplicado)}`, W));
    if (data.condicionPago === 'credito') line(row('+Venta', fmt(data.total), W));
    line(divider(W));
    add(BOLD_ON);
    line(row('Saldo', fmt(data.saldoNuevo ?? 0), W));
    add(BOLD_OFF);
  }

  // ── FOOTER ──
  add(LF);
  add(ALIGN_CENTER);
  line('Gracias por su compra');
  if (data.empresa.notas_ticket) line(clean(data.empresa.notas_ticket).substring(0, W));
  line('');
  line('Elaborado por Uniline');
  add(LF); add(LF); add(LF);
  add(CUT);

  return new Uint8Array(parts);
}
