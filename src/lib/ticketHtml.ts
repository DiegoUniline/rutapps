/**
 * Unified ticket HTML builder — single source of truth for all ticket outputs:
 * on-screen display, PNG download, WhatsApp image, thermal print.
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

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildTicketHTML(data: TicketData, opts?: { ticketAncho?: string; forPrint?: boolean }): string {
  const {
    empresa, folio, fecha, clienteNombre, lineas,
    subtotal, iva, ieps = 0, total, condicionPago, metodoPago,
    montoRecibido, cambio, saldoAnterior, pagoAplicado, saldoNuevo,
  } = data;

  const sym = getCurrencyConfig(empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${fmtNum(n)}`;

  const pagoLabel = condicionPago === 'credito' ? 'Crédito' : condicionPago === 'contado' ? 'Contado' : 'Por definir';

  const campos = { logo: true, nombre: true, razon_social: true, rfc: true, direccion: true, telefono: true, notas_ticket: true, impuestos: true, ...((empresa.ticket_campos as Record<string, boolean>) ?? {}) };

  // For thermal printing, render at native dot width (384 dots for 58mm, 576 for 80mm at 203dpi)
  // For screen display, use smaller CSS px widths
  const is58 = opts?.ticketAncho === '58';
  const forPrint = opts?.forPrint === true;

  // When forPrint, use the actual printer dot resolution so image is 1:1 crisp
  const ticketWidth = forPrint
    ? (is58 ? '384px' : '576px')
    : (is58 ? '210px' : '320px');

  // Scale fonts proportionally: 384px print ≈ 1.83× of 210px screen
  const s = forPrint ? (is58 ? 1.83 : 1.8) : 1;
  const px = (base: number) => `${Math.round(base * s)}px`;

  const logoHtml = campos.logo && empresa.logo_url
    ? `<img src="${empresa.logo_url}" crossorigin="anonymous" style="max-height:${px(32)};max-width:${px(120)};margin:0 auto ${px(4)};display:block" />`
    : '';

  const nombreHtml = campos.nombre ? `<div style="font-size:${px(12)};font-weight:700">${empresa.nombre}</div>` : '';
  const razonHtml = campos.razon_social && empresa.razon_social ? `<div style="font-size:${px(9)};color:#888">${empresa.razon_social}</div>` : '';
  const rfcHtml = campos.rfc && empresa.rfc ? `<div style="font-size:${px(9)};color:#888">RFC: ${empresa.rfc}</div>` : '';

  const dirParts: string[] = [];
  if (empresa.direccion) dirParts.push(empresa.direccion);
  if (empresa.colonia) dirParts.push(empresa.colonia);
  const dirLine2Parts: string[] = [];
  if (empresa.ciudad) dirLine2Parts.push(empresa.ciudad);
  if (empresa.estado) dirLine2Parts.push(empresa.estado);
  if (empresa.cp) dirLine2Parts.push(`C.P. ${empresa.cp}`);

  const dirHtml = campos.direccion && dirParts.length > 0
    ? `<div style="font-size:${px(8)};color:#888">${dirParts.join(', ')}</div>${dirLine2Parts.length > 0 ? `<div style="font-size:${px(8)};color:#888">${dirLine2Parts.join(', ')}</div>` : ''}`
    : '';
  const telHtml = campos.telefono && empresa.telefono ? `<div style="font-size:${px(8)};color:#888">Tel: ${empresa.telefono}</div>` : '';
  const emailHtml = empresa.email ? `<div style="font-size:${px(8)};color:#888">${empresa.email}</div>` : '';

  const showTax = campos.impuestos !== false;

  const lineasHtml = lineas.map(l => {
    const detailParts: string[] = [`${fmt(l.precio)} c/u`];
    if ((l.descuento_pct ?? 0) > 0) detailParts.push(`<span style="color:#3b82f6">-${l.descuento_pct}% dto</span>`);
    if (showTax && (l.iva_monto ?? 0) > 0) detailParts.push(`IVA ${fmt(l.iva_monto!)}`);
    if (showTax && (l.ieps_monto ?? 0) > 0) detailParts.push(`IEPS ${fmt(l.ieps_monto!)}`);

    return `<div style="padding:${px(2)} 0${l.esCambio ? ';opacity:0.6' : ''}">
      <div style="display:flex;justify-content:space-between;font-size:${px(11)}">
        <span style="flex:1;margin-right:${px(4)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${l.cantidad}x ${l.nombre}${l.esCambio ? ` <span style="font-size:${px(9)};color:#888;font-style:italic">(cambio)</span>` : ''}</span>
        <span style="font-weight:600;white-space:nowrap">${fmt(l.total)}</span>
      </div>
      ${!l.esCambio ? `<div style="font-size:${px(8)};color:#888;margin-top:${px(1)}">${detailParts.join(' &middot; ')}</div>` : ''}
    </div>`;
  }).join('');

  const metodoHtml = metodoPago
    ? `<span style="margin-left:${px(12)}"><b>Método</b> <span style="color:#666;text-transform:capitalize">${metodoPago}</span></span>`
    : '';

  let recibidoHtml = '';
  if (montoRecibido != null && montoRecibido > 0) {
    recibidoHtml = `
      <div style="display:flex;justify-content:space-between;font-size:${px(10)};margin-top:${px(2)}"><span style="color:#666">Recibido</span><span>${fmt(montoRecibido)}</span></div>
      ${(cambio ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:${px(10)}"><span style="color:#666">Cambio</span><span style="font-weight:700;color:#3b82f6">${fmt(cambio!)}</span></div>` : ''}
    `;
  }

  let saldoHtml = '';
  if ((saldoAnterior != null && saldoAnterior > 0) || (saldoNuevo != null && (saldoNuevo ?? 0) > 0)) {
    saldoHtml = `
      <div style="border-top:1px dashed #aaa;margin:${px(5)} 0"></div>
      <div style="padding:${px(4)} 0">
        <div style="font-size:${px(8)};font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:${px(3)}">Estado de cuenta</div>
        ${saldoAnterior != null && saldoAnterior > 0 ? `<div style="display:flex;justify-content:space-between;font-size:${px(10)}"><span style="color:#666">Saldo anterior</span><span>${fmt(saldoAnterior)}</span></div>` : ''}
        ${pagoAplicado != null && pagoAplicado > 0 ? `<div style="display:flex;justify-content:space-between;font-size:${px(10)}"><span style="color:#666">Pago aplicado</span><span style="color:#16a34a;font-weight:500">-${fmt(pagoAplicado)}</span></div>` : ''}
        ${condicionPago === 'credito' ? `<div style="display:flex;justify-content:space-between;font-size:${px(10)}"><span style="color:#666">+ Esta venta (crédito)</span><span>${fmt(total)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:${px(11)};font-weight:700;border-top:1px dashed #aaa;padding-top:${px(3)};margin-top:${px(3)}">
          <span>Nuevo saldo</span>
          <span style="color:${(saldoNuevo ?? 0) > 0 ? '#dc2626' : '#16a34a'}">${fmt(saldoNuevo ?? 0)}</span>
        </div>
      </div>
    `;
  }

  const notasHtml = campos.notas_ticket && empresa.notas_ticket
    ? `<div style="border-top:1px dashed #aaa;margin:${px(5)} 0"></div><div style="text-align:center;font-size:${px(8)};color:#888;padding:${px(4)} 0">${empresa.notas_ticket}</div>`
    : '';

  return `<div style="width:${ticketWidth};padding:${px(12)} ${px(16)};font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#222;line-height:1.4;font-size:${px(is58 ? 9 : 11)}">
    <div style="text-align:center;padding-bottom:${px(6)}">
      ${logoHtml}
      ${nombreHtml}
      ${razonHtml}${rfcHtml}${dirHtml}${telHtml}${emailHtml}
    </div>
    <div style="border-top:1px dashed #aaa;margin:${px(5)} 0"></div>
    <div style="font-size:${px(10)};padding:${px(4)} 0">
      <div style="display:flex;gap:${px(12)}">
        <span><b>Folio</b> <span style="font-family:monospace;color:#666">${folio}</span></span>
        <span><b>Fecha</b> <span style="color:#666">${fecha}</span></span>
      </div>
      <div><b>Cliente</b> <span style="color:#666">${clienteNombre}</span></div>
      <div>
        <span><b>Pago</b> <span style="color:#666">${pagoLabel}</span></span>
        ${metodoHtml}
      </div>
    </div>
    <div style="border-top:1px dashed #aaa;margin:${px(5)} 0"></div>
    <div style="padding:${px(4)} 0">
      <div style="font-size:${px(8)};font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:${px(4)}">Productos</div>
      ${lineasHtml}
    </div>
    <div style="border-top:1px dashed #aaa;margin:${px(5)} 0"></div>
    <div style="padding:${px(4)} 0">
      ${showTax ? `<div style="display:flex;justify-content:space-between;font-size:${px(10)}"><span style="color:#666">Subtotal</span><span>${fmt(subtotal)}</span></div>` : ''}
      ${showTax && iva > 0 ? `<div style="display:flex;justify-content:space-between;font-size:${px(10)}"><span style="color:#666">IVA</span><span>${fmt(iva)}</span></div>` : ''}
      ${showTax && ieps > 0 ? `<div style="display:flex;justify-content:space-between;font-size:${px(10)}"><span style="color:#666">IEPS</span><span>${fmt(ieps)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:${px(13)};font-weight:700;${showTax ? `border-top:1px dashed #aaa;padding-top:${px(4)};margin-top:${px(4)}` : ''}">
        <span>Total</span><span style="color:#3b82f6">${fmt(total)}</span>
      </div>
      ${recibidoHtml}
    </div>
    ${saldoHtml}
    ${notasHtml}
    <div style="border-top:1px dashed #ccc;margin-top:${px(6)};padding-top:${px(4)};text-align:center;font-size:${px(7)};color:#999">Elaborado por Uniline — Innovación en la nube</div>
  </div>`;
}
