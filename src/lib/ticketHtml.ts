/**
 * Unified ticket HTML builder — single source of truth for all ticket outputs:
 * on-screen display, PNG download, WhatsApp image, thermal print.
 */

export interface TicketEmpresa {
  nombre: string;
  rfc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  logo_url?: string | null;
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

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildTicketHTML(data: TicketData): string {
  const {
    empresa, folio, fecha, clienteNombre, lineas,
    subtotal, iva, ieps = 0, total, condicionPago, metodoPago,
    montoRecibido, cambio, saldoAnterior, pagoAplicado, saldoNuevo,
  } = data;

  const pagoLabel = condicionPago === 'credito' ? 'Crédito' : condicionPago === 'contado' ? 'Contado' : 'Por definir';

  const logoHtml = empresa.logo_url
    ? `<img src="${empresa.logo_url}" crossorigin="anonymous" style="max-height:32px;max-width:120px;margin:0 auto 4px;display:block" />`
    : '';

  const rfcHtml = empresa.rfc ? `<div style="font-size:9px;color:#888">RFC: ${empresa.rfc}</div>` : '';
  const dirHtml = empresa.direccion ? `<div style="font-size:8px;color:#888">${empresa.direccion}</div>` : '';
  const telHtml = empresa.telefono ? `<div style="font-size:8px;color:#888">Tel: ${empresa.telefono}</div>` : '';

  const lineasHtml = lineas.map(l => {
    const detailParts: string[] = [`$${fmt(l.precio)} c/u`];
    if ((l.descuento_pct ?? 0) > 0) detailParts.push(`<span style="color:#3b82f6">-${l.descuento_pct}% dto</span>`);
    if ((l.iva_monto ?? 0) > 0) detailParts.push(`IVA $${fmt(l.iva_monto!)}`);
    if ((l.ieps_monto ?? 0) > 0) detailParts.push(`IEPS $${fmt(l.ieps_monto!)}`);

    return `<div style="padding:2px 0${l.esCambio ? ';opacity:0.6' : ''}">
      <div style="display:flex;justify-content:space-between;font-size:11px">
        <span style="flex:1;margin-right:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${l.cantidad}x ${l.nombre}${l.esCambio ? ' <span style="font-size:9px;color:#888;font-style:italic">(cambio)</span>' : ''}</span>
        <span style="font-weight:600;white-space:nowrap">$${fmt(l.total)}</span>
      </div>
      ${!l.esCambio ? `<div style="font-size:8px;color:#888;margin-top:1px">${detailParts.join(' &middot; ')}</div>` : ''}
    </div>`;
  }).join('');

  const metodoHtml = metodoPago
    ? `<span style="margin-left:12px"><b>Método</b> <span style="color:#666;text-transform:capitalize">${metodoPago}</span></span>`
    : '';

  let recibidoHtml = '';
  if (montoRecibido != null && montoRecibido > 0) {
    recibidoHtml = `
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px"><span style="color:#666">Recibido</span><span>$${fmt(montoRecibido)}</span></div>
      ${(cambio ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">Cambio</span><span style="font-weight:700;color:#3b82f6">$${fmt(cambio!)}</span></div>` : ''}
    `;
  }

  let saldoHtml = '';
  if ((saldoAnterior != null && saldoAnterior > 0) || (saldoNuevo != null && (saldoNuevo ?? 0) > 0)) {
    saldoHtml = `
      <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
      <div style="padding:4px 0">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:3px">Estado de cuenta</div>
        ${saldoAnterior != null && saldoAnterior > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">Saldo anterior</span><span>$${fmt(saldoAnterior)}</span></div>` : ''}
        ${pagoAplicado != null && pagoAplicado > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">Pago aplicado</span><span style="color:#16a34a;font-weight:500">-$${fmt(pagoAplicado)}</span></div>` : ''}
        ${condicionPago === 'credito' ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">+ Esta venta (crédito)</span><span>$${fmt(total)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;border-top:1px dashed #aaa;padding-top:3px;margin-top:3px">
          <span>Nuevo saldo</span>
          <span style="color:${(saldoNuevo ?? 0) > 0 ? '#dc2626' : '#16a34a'}">$${fmt(saldoNuevo ?? 0)}</span>
        </div>
      </div>
    `;
  }

  return `<div style="width:320px;padding:12px 16px;font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#222;line-height:1.4">
    <div style="text-align:center;padding-bottom:6px">
      ${logoHtml}
      <div style="font-size:12px;font-weight:700">${empresa.nombre}</div>
      ${rfcHtml}${dirHtml}${telHtml}
    </div>
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="font-size:10px;padding:4px 0">
      <div style="display:flex;gap:12px">
        <span><b>Folio</b> <span style="font-family:monospace;color:#666">${folio}</span></span>
        <span><b>Fecha</b> <span style="color:#666">${fecha}</span></span>
      </div>
      <div><b>Cliente</b> <span style="color:#666">${clienteNombre}</span></div>
      <div>
        <span><b>Pago</b> <span style="color:#666">${pagoLabel}</span></span>
        ${metodoHtml}
      </div>
    </div>
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="padding:4px 0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:4px">Productos</div>
      ${lineasHtml}
    </div>
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="padding:4px 0">
      <div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">Subtotal</span><span>$${fmt(subtotal)}</span></div>
      ${iva > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">IVA</span><span>$${fmt(iva)}</span></div>` : ''}
      ${ieps > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">IEPS</span><span>$${fmt(ieps)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px dashed #aaa;padding-top:4px;margin-top:4px">
        <span>Total</span><span style="color:#3b82f6">$${fmt(total)}</span>
      </div>
      ${recibidoHtml}
    </div>
    ${saldoHtml}
    <div style="border-top:1px dashed #ccc;margin-top:6px;padding-top:4px;text-align:center;font-size:7px;color:#999">Elaborado por Uniline — Innovación en la nube</div>
  </div>`;
}
