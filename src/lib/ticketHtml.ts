/**
 * Unified ticket HTML builder — single source of truth for all ticket outputs:
 * on-screen display, PNG download, WhatsApp image, thermal print.
 *
 * Uses monospace font + white-space:pre so toPng() renders perfectly aligned
 * columns without flexbox issues.
 */
import { getCurrencyConfig } from '@/lib/currency';

export interface TicketEmpresa {
  nombre: string;
  rfc?: string | null;
  razon_social?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  moneda?: string | null;
  notas_ticket?: string | null;
  ticket_campos?: Record<string, boolean> | null;
}

export interface TicketLinea {
  nombre: string;
  cantidad: number;
  precio: number;
  total: number;
  iva_monto?: number;
  ieps_monto?: number;
  descuento_pct?: number;
  esCambio?: boolean;
}

export interface TicketData {
  empresa: TicketEmpresa;
  folio: string;
  fecha: string;
  clienteNombre: string;
  lineas: TicketLinea[];
  subtotal: number;
  iva: number;
  ieps?: number;
  total: number;
  condicionPago?: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
  saldoAnterior?: number;
  pagoAplicado?: number;
  saldoNuevo?: number;
}

const COLS = 32;

function pad(left: string, right: string, cols = COLS): string {
  const l = left.substring(0, cols - right.length - 1);
  return l + ' '.repeat(cols - l.length - right.length) + right;
}

function centerText(s: string, cols = COLS): string {
  s = s.substring(0, cols);
  const sp = Math.floor((cols - s.length) / 2);
  return ' '.repeat(sp) + s;
}

function wrapText(s: string, cols = COLS): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= cols) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w.substring(0, cols);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const div = '-'.repeat(COLS);

export function buildTicketHTML(data: TicketData, opts?: { ticketAncho?: string; forPrint?: boolean }): string {
  const { empresa, folio, fecha, clienteNombre, lineas, subtotal, iva, ieps = 0, total, condicionPago, metodoPago, montoRecibido, cambio, saldoAnterior, pagoAplicado, saldoNuevo } = data;

  const sym = getCurrencyConfig(empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rows: string[] = [];
  const add = (s: string) => rows.push(s);

  // HEADER centrado
  add(centerText(empresa.nombre.toUpperCase()));
  if (empresa.razon_social) add(centerText(empresa.razon_social));
  if (empresa.rfc) add(centerText(`RFC: ${empresa.rfc}`));
  const dir1 = [empresa.direccion, empresa.colonia].filter(Boolean).join(', ');
  if (dir1) wrapText(dir1, COLS).forEach(l => add(centerText(l)));
  const dir2 = [empresa.ciudad, empresa.estado, empresa.cp ? `CP ${empresa.cp}` : ''].filter(Boolean).join(', ');
  if (dir2) wrapText(dir2, COLS).forEach(l => add(centerText(l)));
  if (empresa.telefono) add(centerText(`Tel: ${empresa.telefono}`));
  if (empresa.email) add(centerText(empresa.email));
  add(div);

  // INFO
  add(`Folio: ${folio}`);
  add(`Fecha: ${fecha}`);
  add(`Cliente: ${clienteNombre}`.substring(0, COLS));
  const pagoLabel = condicionPago === 'credito' ? 'Credito' : condicionPago === 'contado' ? 'Contado' : 'P/definir';
  add(`Pago: ${pagoLabel}${metodoPago ? ` (${metodoPago})` : ''}`);
  add(div);

  // PRODUCTOS header
  add(pad('Cant Producto', 'Importe'));
  add(div);

  // LÍNEAS
  for (const l of lineas) {
    const imp = fmt(l.total);
    const nombre = `${l.cantidad}x ${l.nombre}`;
    add(pad(nombre.substring(0, COLS - imp.length - 1), imp));
    const detParts = [`  ${fmt(l.precio)}c/u`];
    if ((l.iva_monto ?? 0) > 0) detParts.push(`IVA${fmt(l.iva_monto!)}`);
    add(detParts.join(' ').substring(0, COLS));
  }
  add(div);

  // TOTALES
  add('');
  add(pad('Subtotal', fmt(subtotal)));
  if (iva > 0) add(pad('IVA', fmt(iva)));
  if (ieps > 0) add(pad('IEPS', fmt(ieps)));
  add(div);
  add(pad('TOTAL', fmt(total)));

  if (montoRecibido != null && montoRecibido > 0) {
    add(pad('Recibido', fmt(montoRecibido)));
    if ((cambio ?? 0) > 0) add(pad('Cambio', fmt(cambio!)));
  }

  // SALDO
  if ((saldoAnterior != null && saldoAnterior > 0) || (saldoNuevo != null && (saldoNuevo ?? 0) > 0)) {
    add(div);
    add('EDO. CUENTA');
    if (saldoAnterior != null && saldoAnterior > 0) add(pad('Saldo ant', fmt(saldoAnterior)));
    if (pagoAplicado != null && pagoAplicado > 0) add(pad('Pago', `-${fmt(pagoAplicado)}`));
    if (condicionPago === 'credito') add(pad('+Venta', fmt(total)));
    add(div);
    add(pad('Saldo', fmt(saldoNuevo ?? 0)));
  }

  // FOOTER
  add('');
  add(centerText('Gracias por su compra'));
  if (empresa.notas_ticket) add(centerText(empresa.notas_ticket));
  add(centerText('Elaborado por Uniline'));

  const content = rows.join('\n');

  return `<div style="width:380px;padding:12px 16px;background:#fff;color:#000;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:600;line-height:1.5;white-space:pre">${content}</div>`;
}
