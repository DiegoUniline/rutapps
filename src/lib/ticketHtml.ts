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
  producto_id?: string;
  precio_sugerido_publico?: number;
}

export interface TicketPromo {
  descripcion: string;
  descuento: number;
  producto_id?: string;
}

export interface TicketPago {
  metodo: string;
  monto: number;
  fecha?: string | null;
  referencia?: string | null;
}

export interface TicketDevolucion {
  nombre: string;
  cantidad: number;
  motivo: string;
  accion: string;
  monto?: number;
}

export interface TicketData {
  empresa: TicketEmpresa;
  folio: string;
  fecha: string;
  clienteNombre: string;
  clienteRfc?: string | null;
  clienteTelefono?: string | null;
  clienteDireccion?: string | null;
  vendedorNombre?: string;
  vendedorTelefono?: string | null;
  lineas: TicketLinea[];
  subtotal: number;
  descuento?: number;
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
  promociones?: TicketPromo[];
  pagos?: TicketPago[];
  devoluciones?: TicketDevolucion[];
}

export const MOTIVO_DEVOLUCION_LABELS: Record<string, string> = {
  no_vendido: 'No vendido', vencido: 'Vencido', caducado: 'Caducado',
  danado: 'Danado', cambio: 'Cambio', error_pedido: 'Error pedido', otro: 'Otro',
};
export const ACCION_DEVOLUCION_LABELS: Record<string, string> = {
  reposicion: 'Reposicion', nota_credito: 'Nota credito',
  devolucion_dinero: 'Dev. dinero', descuento_venta: 'Desc. venta',
};

export interface TicketTotalsSummary {
  descuentoTotal: number;
  impuestosTotal: number;
  totalPagado: number;
  saldo: number;
}

export function getTicketTotalsSummary(data: TicketData): TicketTotalsSummary {
  const totalPromo = (data.promociones ?? []).reduce((s, p) => s + (Number(p.descuento) || 0), 0);
  const descuentoTotal = Math.max(Number(data.descuento ?? 0), totalPromo, 0);
  const impuestosTotal = Math.max((Number(data.iva) || 0) + (Number(data.ieps ?? 0) || 0), 0);
  const pagosTotal = (data.pagos ?? []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const recibidoNeto = data.montoRecibido != null
    ? Math.max((Number(data.montoRecibido) || 0) - (Number(data.cambio ?? 0) || 0), 0)
    : 0;
  const pagoAplicado = Math.max(Number(data.pagoAplicado ?? 0) || 0, 0);
  const totalVenta = Math.max(Number(data.total) || 0, 0);
  const totalPagado = pagosTotal > 0
    ? pagosTotal
    : pagoAplicado > 0
      ? pagoAplicado
      : recibidoNeto > 0
        ? recibidoNeto
        : data.condicionPago !== 'contado'
          ? 0
          : totalVenta;
  const saldo = data.saldoNuevo != null
    ? Math.max(Number(data.saldoNuevo) || 0, 0)
    : Math.max(totalVenta - Math.min(totalPagado, totalVenta), 0);

  return { descuentoTotal, impuestosTotal, totalPagado, saldo };
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

export function buildTicketHTML(data: TicketData, opts?: { ticketAncho?: string; forPrint?: boolean; showTax?: boolean }): string {
  const { empresa, folio, fecha, clienteNombre, clienteRfc, clienteTelefono, clienteDireccion, vendedorNombre, vendedorTelefono, lineas, subtotal, iva, ieps = 0, total, condicionPago, metodoPago, montoRecibido, cambio, saldoAnterior, pagoAplicado, saldoNuevo, promociones, pagos, devoluciones } = data;
  const showTax = opts?.showTax ?? (empresa.ticket_campos?.impuestos !== false);

  const sym = getCurrencyConfig(empresa.moneda).symbol;
  // ASCII-only formatter — no multi-byte locale chars
  const fmt = (n: number) => {
    const [intPart, decPart] = Math.abs(n).toFixed(2).split('.');
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${n < 0 ? '-' : ''}${sym}${formatted}.${decPart}`;
  };

  // ── Header (real HTML, text-align:center) ──
  const tc = empresa.ticket_campos ?? {};
  const showLogo = tc.logo !== false;
  const showNombre = tc.nombre !== false;
  const showRazon = tc.razon_social !== false;
  const showRfc = tc.rfc !== false;
  const showDir = tc.direccion !== false;
  const showTel = tc.telefono !== false;
  const showEmail = tc.email !== false;
  const showNotas = tc.notas_ticket !== false;
  // New toggles (default true to preserve current behavior)
  const showFolio = tc.folio !== false;
  const showFecha = tc.fecha !== false;
  const showCondicionPago = tc.condicion_pago !== false;
  const showClienteNombre = tc.cliente_nombre !== false;
  const showClienteRfc = tc.cliente_rfc !== false;
  const showClienteTelefono = tc.cliente_telefono !== false;
  const showClienteDireccion = tc.cliente_direccion !== false;
  const showVendedorNombre = tc.vendedor_nombre !== false;
  const showVendedorTelefono = tc.vendedor_telefono !== false;
  const showDescuentos = tc.descuentos !== false;
  const showSaldoCuenta = tc.saldo_cuenta !== false;
  const showRecibidoCambio = tc.recibido_cambio !== false;
  const showPromociones = tc.promociones !== false;
  const showPagosRecibidos = tc.pagos_recibidos !== false;
  const showDevoluciones = tc.devoluciones !== false;
  const showMensajeGracias = tc.mensaje_gracias !== false;
  const showImpuestos = tc.impuestos !== false;
  const showFirmas = tc.firmas !== false;
  // Pie Rutapp: siempre visible, no configurable

  const hLines: string[] = [];
  if (showLogo && empresa.logo_url) {
    hLines.push(`<div style="margin-bottom:6px"><img src="${empresa.logo_url}" alt="${empresa.nombre}" style="max-width:160px;max-height:80px;margin:0 auto;display:block" crossorigin="anonymous" /></div>`);
  }
  if (showNombre) hLines.push(`<div style="font-weight:700;font-size:22px">${empresa.nombre.toUpperCase()}</div>`);
  if (showRazon && empresa.razon_social) hLines.push(`<div style="font-size:14px">${empresa.razon_social}</div>`);
  if (showRfc && empresa.rfc) hLines.push(`<div style="font-size:14px">RFC: ${empresa.rfc}</div>`);
  const dir1 = [empresa.direccion, empresa.colonia].filter(Boolean).join(', ');
  if (showDir && dir1) hLines.push(`<div style="font-size:13px">${dir1}</div>`);
  const dir2 = [empresa.ciudad, empresa.estado, empresa.cp ? `CP ${empresa.cp}` : ''].filter(Boolean).join(', ');
  if (showDir && dir2) hLines.push(`<div style="font-size:13px">${dir2}</div>`);
  if (showTel && empresa.telefono) hLines.push(`<div style="font-size:13px">Tel: ${empresa.telefono}</div>`);
  if (showEmail && empresa.email) hLines.push(`<div style="font-size:13px">${empresa.email}</div>`);
  const headerHtml = hLines.join('');

  // ── Body (monospace <pre> grid) ──
  const rows: string[] = [];
  const add = (s: string) => rows.push(s);

  add(div);
  if (showFolio) add(`Folio: ${folio}`);
  if (showFecha) add(`Fecha: ${fecha}`);
  if (showClienteNombre) add(`Cliente: ${clienteNombre}`.substring(0, COLS));
  if (showClienteRfc && clienteRfc) add(`RFC: ${clienteRfc}`.substring(0, COLS));
  if (showClienteTelefono && clienteTelefono) add(`Tel: ${clienteTelefono}`.substring(0, COLS));
  if (showClienteDireccion && clienteDireccion) {
    for (const l of wrapText(`Dir: ${clienteDireccion}`, COLS)) add(l);
  }
  if (showVendedorNombre && vendedorNombre) add(`Vendedor: ${vendedorNombre}`.substring(0, COLS));
  if (showVendedorTelefono && vendedorTelefono) add(`Tel. vend: ${vendedorTelefono}`.substring(0, COLS));
  if (showCondicionPago) {
    const pagoLabel = condicionPago === 'credito' ? 'Credito' : condicionPago === 'contado' ? 'Contado' : 'P/definir';
    add(`Pago: ${pagoLabel}${metodoPago ? ` (${metodoPago})` : ''}`);
  }
  add(div);

  add(pad('Cant Producto', 'Importe'));
  add(div);

  for (const l of lineas) {
    const lineAmt = showTax ? l.total : (l.total - (l.iva_monto ?? 0) - (l.ieps_monto ?? 0));
    const imp = fmt(lineAmt);
    const nombre = `${l.cantidad}x ${l.nombre}`;
    add(pad(nombre.substring(0, COLS - imp.length - 1), imp));
    const detParts = [`  ${fmt(l.precio)}c/u`];
    if (showTax && (l.iva_monto ?? 0) > 0) detParts.push(`IVA${fmt(l.iva_monto!)}`);
    if ((l.precio_sugerido_publico ?? 0) > 0) detParts.push(`Sug ${fmt(l.precio_sugerido_publico!)}`);
    add(detParts.join(' ').substring(0, COLS));
  }
  add(div);

  // ── PROMOCIONES APLICADAS (bloque unificado) ──
  const promosAplicadas = (promociones ?? []).filter(p => (Number(p.descuento) || 0) > 0);
  if (showPromociones && promosAplicadas.length > 0) {
    add('PROMOCIONES APLICADAS');
    for (const p of promosAplicadas) {
      add(pad(`  ${p.descripcion}`, `-${fmt(p.descuento)}`));
    }
    add(div);
  }

  const summary = getTicketTotalsSummary(data);
  add('');
  add(pad('Sub total', fmt(subtotal)));
  if (showDescuentos) add(pad('Descuentos', summary.descuentoTotal > 0 ? `-${fmt(summary.descuentoTotal)}` : fmt(0)));
  if (showImpuestos) add(pad('Impuestos', fmt(showTax ? summary.impuestosTotal : 0)));
  add(div);
  add(pad('Total pagado', fmt(summary.totalPagado)));
  add(pad('Saldo', fmt(summary.saldo)));

  if (showRecibidoCambio && montoRecibido != null && montoRecibido > 0) {
    add(pad('Recibido', fmt(montoRecibido)));
    if ((cambio ?? 0) > 0) add(pad('Cambio', fmt(cambio!)));
  }

  if (showSaldoCuenta) {
    add(div);
    add('EDO. CUENTA');
    add(pad('Saldo ant', fmt(saldoAnterior ?? 0)));
    if (pagoAplicado != null && pagoAplicado > 0) add(pad('Pago', `-${fmt(pagoAplicado)}`));
    if (condicionPago === 'credito') add(pad('+Venta', fmt(total)));
    add(div);
    add(pad('Saldo', fmt(saldoNuevo ?? 0)));
  }

  // ── Pagos recibidos ──
  if (showPagosRecibidos && pagos && pagos.length > 0) {
    add(div);
    add('PAGOS RECIBIDOS');
    for (const p of pagos) {
      const fechaPart = p.fecha ? `${p.fecha} ` : '';
      const label = fechaPart + p.metodo + (p.referencia ? ` (${p.referencia})` : '');
      add(pad(label.substring(0, COLS - 12), fmt(p.monto)));
    }
  }

  // ── Devoluciones ──
  if (showDevoluciones && devoluciones && devoluciones.length > 0) {
    add(div);
    add('DEVOLUCIONES');
    for (const d of devoluciones) {
      const accion = ACCION_DEVOLUCION_LABELS[d.accion] || d.accion;
      const motivo = MOTIVO_DEVOLUCION_LABELS[d.motivo] || d.motivo;
      const nombre = `${d.cantidad}x ${d.nombre}`;
      add(nombre.substring(0, COLS));
      const right = (d.monto ?? 0) > 0 ? `${accion} ${fmt(d.monto!)}` : accion;
      add(pad(`  ${motivo}`, right));
    }
  }


  if (showFirmas) {
    add('');
    add(pad('_______________', '_______________'));
    add(pad('    Entrego    ', '    Recibio    '));
  }
  add('');
  if (showMensajeGracias) add(centerText('Gracias por su compra'));
  if (showNotas && empresa.notas_ticket) add(centerText(empresa.notas_ticket));
  add(centerText('Rutapp.mx'));
  add(centerText('Sistema de Venta en ruta'));
  add(centerText('Contrata al 317 104 5954'));

  const bodyContent = rows.join('\n');

  return `<div style="width:380px;padding:12px 16px;background:#fff;color:#000;font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:600;line-height:1.2"><div style="text-align:center;margin-bottom:8px">${headerHtml}</div><pre style="margin:0;white-space:pre;font:inherit;line-height:1.4">${bodyContent}</pre></div>`;
}
