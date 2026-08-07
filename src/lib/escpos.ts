/**
 * ESC/POS command builder for 58mm and 80mm thermal printers.
 * Fixed-width column layout to prevent price overflow / line jumping.
 */
import { getTicketTotalsSummary, MOTIVO_DEVOLUCION_LABELS, ACCION_DEVOLUCION_LABELS, type TicketData } from './ticketHtml';
import { getCurrencyConfig } from './currency';
import { computeResumenFromLineas } from './ventaResumen';

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

/**
 * Load an image URL and convert to ESC/POS GS v 0 raster bytes (monochrome).
 * Returns empty array if image fails to load.
 */
async function logoToRasterBytes(url: string, maxWidth: number): Promise<number[]> {
  try {
    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Try fetching as blob first to avoid CORS
    let objectUrl: string | null = null;
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      } else {
        img.src = url;
      }
    } catch {
      img.src = url;
    }

    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('img load failed'));
    });

    // Scale to fit printer width (maxWidth pixels)
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    let w = Math.floor(img.naturalWidth * scale);
    let h = Math.floor(img.naturalHeight * scale);
    // Width must be multiple of 8 for raster
    w = Math.floor(w / 8) * 8;
    if (w < 8) w = 8;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (objectUrl) URL.revokeObjectURL(objectUrl);

    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;

    // Convert to monochrome bitmap
    const bytesPerRow = w / 8;
    const rasterData: number[] = [];

    for (let y = 0; y < h; y++) {
      for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteIdx * 8 + bit;
          const idx = (y * w + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          // Dark pixel = ink (1), light pixel = no ink (0)
          if (gray < 128) {
            byte |= (0x80 >> bit);
          }
        }
        rasterData.push(byte);
      }
    }

    // GS v 0 — print raster bit image
    // Format: GS v 0 m xL xH yL yH data
    // m=0 (normal), xL/xH = bytes per row, yL/yH = height in dots
    const xL = bytesPerRow & 0xFF;
    const xH = (bytesPerRow >> 8) & 0xFF;
    const yL = h & 0xFF;
    const yH = (h >> 8) & 0xFF;

    return [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...rasterData];
  } catch (e) {
    console.warn('[ESC/POS] Logo raster failed:', e);
    return [];
  }
}

export async function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string; showTax?: boolean }): Promise<Uint8Array> {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const W = is58 ? COLS_58 : COLS_80;
  const maxPixelWidth = is58 ? 384 : 576;

  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => `${sym}${fmtNum(n)}`;

  const parts: number[] = [];
  const add = (bytes: number[]) => { for (const b of bytes) parts.push(b); };
  const ln = (s: string) => { const encoded = enc.encode(s + '\n'); for (const b of encoded) parts.push(b); };

  add(INIT);

  const tc = data.empresa.ticket_campos ?? {};
  const showLogo = tc.logo !== false;
  const showNombre = tc.nombre !== false;
  const showRazon = tc.razon_social !== false;
  const showRfc = tc.rfc !== false;
  const showDir = tc.direccion !== false;
  const showTel = tc.telefono !== false;
  const showEmail = tc.email !== false;
  // New toggles (default true)
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

  // ── LOGO (raster image) ──
  if (showLogo && data.empresa.logo_url) {
    add(ALIGN_CENTER);
    const logoBytes = await logoToRasterBytes(data.empresa.logo_url, maxPixelWidth);
    if (logoBytes.length > 0) {
      add(logoBytes);
      add(LF);
    }
  }

  // ── HEADER (centered via ESC/POS command) ──
  add(ALIGN_CENTER);
  if (showNombre) {
    add(BOLD_ON);
    ln(clean(data.empresa.nombre).slice(0, W));
    add(BOLD_OFF);
  }
  if (showRazon && data.empresa.razon_social) ln(clean(data.empresa.razon_social).slice(0, W));
  if (showRfc && data.empresa.rfc) ln(clean(`RFC: ${data.empresa.rfc}`).slice(0, W));
  const dir = [data.empresa.direccion, data.empresa.colonia].filter(Boolean).join(', ');
  if (showDir && dir) {
    wrap(dir, W).forEach(l => ln(l.trim()));
  }
  const dir2Parts = [data.empresa.ciudad, data.empresa.estado, data.empresa.cp ? `CP ${data.empresa.cp}` : ''].filter(Boolean).join(', ');
  if (showDir && dir2Parts) ln(clean(dir2Parts).slice(0, W));
  if (showTel && data.empresa.telefono) ln(clean(`Tel: ${data.empresa.telefono}`).slice(0, W));
  if (showEmail && data.empresa.email) ln(clean(data.empresa.email).slice(0, W));
  add(LF);

  // ── INFO (left) ──
  add(ALIGN_LEFT);
  ln(divider(W));
  if (showFolio) ln(`Folio: ${clean(data.folio).slice(0, W - 7)}`);
  if (showFecha) ln(`Fecha: ${clean(data.fecha).slice(0, W - 7)}`);
  if (showClienteNombre) ln(`Cliente: ${clean(data.clienteNombre).slice(0, W - 9)}`);
  if (showClienteRfc && data.clienteRfc) ln(`RFC: ${clean(data.clienteRfc).slice(0, W - 5)}`);
  if (showClienteTelefono && data.clienteTelefono) ln(`Tel: ${clean(data.clienteTelefono).slice(0, W - 5)}`);
  if (showClienteDireccion && data.clienteDireccion) {
    wrap(`Dir: ${data.clienteDireccion}`, W).forEach(l => ln(l.trim()));
  }
  if (showVendedorNombre && data.vendedorNombre) ln(`Vendedor: ${clean(data.vendedorNombre).slice(0, W - 10)}`);
  if (showVendedorTelefono && data.vendedorTelefono) ln(`Tel. vend: ${clean(data.vendedorTelefono).slice(0, W - 11)}`);
  if (showCondicionPago) {
    const pagoLabel = data.condicionPago === 'credito' ? 'Credito' : data.condicionPago === 'contado' ? 'Contado' : 'P/definir';
    ln(`Pago: ${pagoLabel}${data.metodoPago ? ` (${clean(data.metodoPago)})` : ''}`);
  }
  ln(divider(W));

  // Promos que dejan una linea 100% gratis: se muestran GRATIS en su linea.
  const promosConDesc = (data.promociones ?? []).filter(p => (Number(p.descuento) || 0) > 0);
  const descPorProducto = new Map<string, number>();
  const gratisQtyPorProducto = new Map<string, number>();
  for (const p of promosConDesc) {
    if (!p.producto_id) continue;
    descPorProducto.set(p.producto_id, (descPorProducto.get(p.producto_id) ?? 0) + (Number(p.descuento) || 0));
    if (p.tipo === 'producto_gratis' || (Number(p.cantidad_gratis) || 0) > 0) {
      gratisQtyPorProducto.set(p.producto_id, (gratisQtyPorProducto.get(p.producto_id) ?? 0) + (Number(p.cantidad_gratis) || 0));
    }
  }
  const productosGratis = new Set<string>();

  // ── PRODUCTOS ──
  for (const l of data.lineas) {
    const desc = `${l.cantidad}x ${clean(l.nombre)}`;
    // Importe SIEMPRE en bruto (con impuestos incluidos), igual que el sistema.
    const lineAmt = Number(l.total) || 0;
    const descLinea = (showPromociones && l.producto_id) ? (descPorProducto.get(l.producto_id) ?? 0) : 0;
    const gratisQty = (showPromociones && l.producto_id) ? (gratisQtyPorProducto.get(l.producto_id) ?? 0) : 0;
    const esGratis = (Number(l.total) || 0) > 0 && (
      gratisQty > 0
        ? gratisQty >= (Number(l.cantidad) || 0) - 0.001
        : descLinea > 0 && descLinea >= (Number(l.total) || 0) - 0.01
    );
    const price = esGratis ? 'GRATIS' : fmt(lineAmt);
    itemLines(desc, price, W).forEach(x => ln(x));
    if (esGratis) {
      // Precio original + promo, sin tachado (la impresora termica no lo tiene).
      if (l.producto_id) productosGratis.add(l.producto_id);
      const promoLinea = promosConDesc.find(p => p.producto_id === l.producto_id);
      const det = `  Antes ${fmt(lineAmt)}${promoLinea?.descripcion ? ` ${clean(promoLinea.descripcion)}` : ''}`;
      ln(clean(det).slice(0, W));
    } else {
      // Precio unitario real de la venta (derivado del importe si el guardado
      // no cuadra, para que Cantidad x P.U. = Importe).
      const cant = Number(l.cantidad) || 0;
      const pGuardado = Number(l.precio) || 0;
      const pu = cant > 0 && Math.abs(pGuardado * cant - lineAmt) > 0.01 ? lineAmt / cant : pGuardado;
      if (pu > 0) ln(clean(`  P.U. ${fmt(pu)}`).slice(0, W));
    }

  }
  ln(divider(W));

  // ── TOTALES (desglose fiscal reconstruido, igual que la lista y el detalle) ──
  const summary = getTicketTotalsSummary(data);
  const resumen = computeResumenFromLineas(data.lineas.map(l => ({
    subtotal: undefined,
    descuento_pct: l.descuento_pct,
    precio_unitario: l.precio,
    cantidad: l.cantidad,
    iva_monto: l.iva_monto,
    ieps_monto: l.ieps_monto,
    total: l.total,
  })));
  const ivaMonto = Number(data.iva) || 0;
  const iepsMonto = Number(data.ieps) || 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const subtotalNetoGuardado = r2(data.lineas.reduce((s, l) => {
    const lista = Number(l.precio_lista_unitario);
    return s + (Number.isFinite(lista) ? r2(lista * (Number(l.cantidad) || 0)) : 0);
  }, 0));
  const descuentoNetoGuardado = r2(data.lineas.reduce((s, l) => {
    const descuentoBruto = (Number(l.descuento_promocion_monto) || 0) + (Number(l.descuento_manual_monto) || 0);
    if (descuentoBruto <= 0) return s;
    const divisor = (1 + (Number(l.ieps_pct) || 0) / 100) * (1 + (Number(l.iva_pct) || 0) / 100);
    return s + r2(divisor > 0 ? descuentoBruto / divisor : descuentoBruto);
  }, 0));
  const descuentoBrutoGuardado = r2(data.lineas.reduce((s2, l) =>
    s2 + (Number(l.descuento_promocion_monto) || 0) + (Number(l.descuento_manual_monto) || 0), 0));
  const descTicket = subtotalNetoGuardado > 0
    ? (descuentoNetoGuardado > 0 ? descuentoNetoGuardado : r2(subtotalNetoGuardado - ((Number(data.total) || 0) - ivaMonto - iepsMonto)))
    : Math.max(resumen.descuento, summary.descuentoTotal, 0);
  const sinImpTicket = subtotalNetoGuardado > 0
    ? subtotalNetoGuardado
    : Math.max(0, (Number(data.total) || 0) - ivaMonto - iepsMonto) + descTicket;
  const gravableTicket = subtotalNetoGuardado > 0
    ? Math.max(0, r2(sinImpTicket - descTicket))
    : Math.max(0, (Number(data.total) || 0) - ivaMonto - iepsMonto);
  if (showImpuestos) {
    ln(row('Subtotal sin impuestos', fmt(sinImpTicket), W));
    if (showDescuentos && descTicket > 0.005) ln(row('Descuentos/promos', `-${fmt(descTicket)}`, W));
    ln(row('Subtotal gravable', fmt(gravableTicket), W));
    if (iepsMonto > 0.005) ln(row('IEPS', fmt(iepsMonto), W));
    if (ivaMonto > 0.005) ln(row('IVA', fmt(ivaMonto), W));
    if (ivaMonto <= 0.005 && iepsMonto <= 0.005) ln(row('Impuestos', fmt(0), W));
  } else {
    // Sin desglose: todo en bruto (con impuestos) para que Subtotal - Desc = Total.
    const descBruto = descuentoBrutoGuardado > 0.005 ? descuentoBrutoGuardado : r2(descTicket);
    const subBruto = descBruto > 0.005
      ? r2((Number(data.total) || 0) + descBruto)
      : r2(sinImpTicket + ivaMonto + iepsMonto);
    ln(row('Sub total', fmt(subBruto), W));
    if (showDescuentos && descBruto > 0.005) ln(row('Descuentos/promos', `-${fmt(descBruto)}`, W));
  }
  ln(divider(W));
  add(BOLD_ON);
  ln(row('Total', fmt(data.total), W));
  ln(row('Total pagado', fmt(summary.totalPagado), W));
  add(BOLD_OFF);
  ln(row('Saldo', fmt(summary.saldo), W));

  // ── PROMOCIONES APLICADAS (al final, como la foto) ──
  const promosAplicadas = promosConDesc.filter(p => !(p.producto_id && productosGratis.has(p.producto_id)));
  if (showPromociones && (promosAplicadas.length > 0 || productosGratis.size > 0)) {
    ln(divider(W));
    add(BOLD_ON);
    ln('PROMOCIONES APLICADAS');
    add(BOLD_OFF);
    for (const p of promosConDesc) {
      ln(row(`  ${clean(p.descripcion)}`, `-${fmt(p.descuento)}`, W));
    }
    for (const x of wrap('(i) Los productos gratis se registran como descuento para mantener trazabilidad.', W)) ln(x);
  }

  if (showRecibidoCambio && data.montoRecibido && data.montoRecibido > 0) {
    ln(row('Recibido', fmt(data.montoRecibido), W));
    if ((data.cambio ?? 0) > 0) ln(row('Cambio', fmt(data.cambio!), W));
  }

  // ── SALDO ──
  if (showSaldoCuenta) {
    ln(divider(W));
    add(BOLD_ON);
    ln('EDO. CUENTA');
    add(BOLD_OFF);
    ln(row('Saldo ant', fmt(data.saldoAnterior ?? 0), W));
    if (data.pagoAplicado != null && data.pagoAplicado > 0) ln(row('Pago', `-${fmt(data.pagoAplicado)}`, W));
    if (data.condicionPago === 'credito') ln(row('+Venta', fmt(data.total), W));
    ln(divider(W));
    add(BOLD_ON);
    ln(row('Saldo', fmt(data.saldoNuevo ?? 0), W));
    add(BOLD_OFF);
  }

  // ── PAGOS RECIBIDOS ──
  if (showPagosRecibidos && data.pagos && data.pagos.length > 0) {
    ln(divider(W));
    add(BOLD_ON);
    ln('PAGOS RECIBIDOS');
    add(BOLD_OFF);
    for (const p of data.pagos) {
      const fechaPart = p.fecha ? `${clean(p.fecha)} ` : '';
      const label = fechaPart + clean(p.metodo) + (p.referencia ? ` (${clean(p.referencia)})` : '');
      ln(row(label.slice(0, W - 14), fmt(p.monto), W));
    }
  }

  // ── DEVOLUCIONES ──
  if (showDevoluciones && data.devoluciones && data.devoluciones.length > 0) {
    ln(divider(W));
    add(BOLD_ON);
    ln('DEVOLUCIONES');
    add(BOLD_OFF);
    for (const d of data.devoluciones) {
      const accion = ACCION_DEVOLUCION_LABELS[d.accion] || d.accion;
      const motivo = MOTIVO_DEVOLUCION_LABELS[d.motivo] || d.motivo;
      ln(clean(`${d.cantidad}x ${d.nombre}`).slice(0, W));
      const right = (d.monto ?? 0) > 0 ? `${accion} ${fmt(d.monto!)}` : accion;
      ln(row(`  ${motivo}`, right, W));
    }
  }

  if (showFirmas) {
    add(LF);
    add(ALIGN_LEFT);
    const half = Math.floor(W / 2);
    ln('_'.repeat(half - 1) + ' ' + '_'.repeat(W - half));
    ln(center('Entrego', half) + center('Recibio', W - half));
  }

  add(LF);
  add(ALIGN_CENTER);
  if (showMensajeGracias) ln('Gracias por su compra');
  if (tc.notas_ticket !== false && data.empresa.notas_ticket) {
    wrap(data.empresa.notas_ticket, W).forEach(l => ln(l.trim()));
  }
  ln('');
  ln('Rutapp.mx');
  ln('Sistema de Venta en ruta');
  ln('Contrata al 317 104 5954');
  add(LF); add(LF); add(LF);
  add(CUT);

  return new Uint8Array(parts);
}
