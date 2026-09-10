/**
 * Estado de Cuenta PDF — layout editorial tipo ERP/Odoo.
 * Documento 100% generado con jsPDF + jspdf-autotable (sin capturas de pantalla).
 */
import { getCurrencyConfig } from '@/lib/currency';
import type jsPDF from 'jspdf';

const ML = 15;
const MR = 15;
const FOOTER_Y = 267;

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [100, 116, 139];
const SOFT_MUTED: [number, number, number] = [148, 163, 184];
const LINE: [number, number, number] = [226, 232, 240];
const SOFT: [number, number, number] = [248, 250, 252];
const PRIMARY: [number, number, number] = [37, 99, 235];
const SUCCESS: [number, number, number] = [5, 150, 105];
const WARNING: [number, number, number] = [217, 119, 6];
const WHITE: [number, number, number] = [255, 255, 255];

interface EmpresaInfo {
  nombre: string;
  razon_social?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  moneda?: string | null;
}

interface EstadoCuentaParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
  cliente: {
    nombre: string;
    codigo?: string;
    telefono?: string;
    direccion?: string;
    rfc?: string;
    credito?: boolean;
    limite_credito?: number;
    dias_credito?: number;
  };
  ventas: {
    folio: string;
    fecha: string;
    total: number;
    saldo_pendiente: number;
    status: string;
    condicion_pago: string;
  }[];
  cobros: {
    fecha: string;
    monto: number;
    metodo_pago: string;
    referencia?: string;
  }[];
  productosVendidos?: { nombre: string; cantidad: number; total: number }[];
  productosDevueltos?: { nombre: string; cantidad: number; motivo?: string }[];
}

const moneyNumber = (n: number) =>
  Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const money = (symbol: string, n: number) => `${symbol}${moneyNumber(n)}`;

function parseDate(value: string): Date | null {
  if (!value) return null;
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value: string): string {
  const d = parseDate(value);
  if (!d) return value || '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDateLong(date: Date): string {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

function statusLabel(status: string): string {
  const s = (status || '').toLowerCase();
  const labels: Record<string, string> = {
    borrador: 'Borrador',
    confirmado: 'Confirmado',
    entregado: 'Entregado',
    facturado: 'Facturado',
    cancelado: 'Cancelado',
  };
  return labels[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
}

function condicionLabel(condicion: string): string {
  const c = (condicion || '').toLowerCase();
  if (c === 'contado') return 'Contado';
  if (c === 'credito') return 'Crédito';
  if (c === 'por_definir') return 'Por definir';
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : '—';
}

function metodoLabel(metodo: string): string {
  const m = (metodo || '').toLowerCase();
  const labels: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta',
    cheque: 'Cheque',
    deposito: 'Depósito',
    credito: 'Crédito',
    saldo_favor: 'Saldo a favor',
  };
  return labels[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : '—');
}

function getLastTableY(doc: jsPDF): number {
  const d = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
  return d.lastAutoTable?.finalY ?? 20;
}

function drawContinuationHeader(doc: jsPDF, empresa: EmpresaInfo, clienteNombre: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text((empresa.nombre || empresa.razon_social || 'Rutapp').toUpperCase(), ML, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Estado de cuenta · ${clienteNombre}`, rightX, 12, { align: 'right' });
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(ML, 16, rightX, 16);
}

function ensureSpace(doc: jsPDF, y: number, needed: number, empresa: EmpresaInfo, clienteNombre: string): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed < pageH - 22) return y;
  doc.addPage();
  drawContinuationHeader(doc, empresa, clienteNombre);
  return 24;
}

function drawSectionTitle(doc: jsPDF, y: number, title: string, subtitle?: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(title.toUpperCase(), ML, y);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, ML, y + 4.2);
    return y + 8;
  }
  return y + 5;
}

function drawFooter(doc: jsPDF, page: number, totalPages: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const y = Math.min(FOOTER_Y, pageH - 13);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(ML, y, pageW - MR, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('rutapp.mx', ML, y + 5.5);
  doc.text(`Página ${page} de ${totalPages}`, pageW - MR, y + 5.5, { align: 'right' });
}

function tablePageHook(doc: jsPDF, empresa: EmpresaInfo, clienteNombre: string) {
  return (_data: any) => {
    const current = doc.getCurrentPageInfo().pageNumber;
    if (current > 1) drawContinuationHeader(doc, empresa, clienteNombre);
  };
}

export async function generarEstadoCuentaPdf(params: EstadoCuentaParams): Promise<Blob> {
  const {
    empresa,
    logoBase64,
    cliente,
    ventas,
    cobros,
    productosVendidos = [],
    productosDevueltos = [],
  } = params;

  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const contentW = rightX - ML;
  const symbol = getCurrencyConfig(empresa.moneda).symbol;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  // Sólo documentos financieramente válidos. Borradores/cancelados no pertenecen al estado de cuenta.
  const ventasValidas = ventas
    .filter(v => !['borrador', 'cancelado'].includes((v.status || '').toLowerCase()))
    .map(v => ({
      ...v,
      total: Math.max(0, Number(v.total || 0)),
      saldo_pendiente: Math.min(Math.max(0, Number(v.saldo_pendiente || 0)), Math.max(0, Number(v.total || 0))),
    }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const cobrosOrdenados = cobros
    .map(c => ({ ...c, monto: Math.max(0, Number(c.monto || 0)) }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const totalVendido = ventasValidas.reduce((s, v) => s + v.total, 0);
  const totalPendiente = ventasValidas.reduce((s, v) => s + v.saldo_pendiente, 0);
  const totalLiquidado = Math.max(0, totalVendido - totalPendiente);
  const totalCobrado = cobrosOrdenados.reduce((s, c) => s + c.monto, 0);
  const ultimoPago = cobrosOrdenados[0] ?? null;

  // ─────────────────────────────────────────────────────────────
  // ENCABEZADO
  // ─────────────────────────────────────────────────────────────
  let y = 17;
  let companyX = ML;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 12, 14, 14);
      companyX = ML + 18;
    } catch {
      companyX = ML;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(...INK);
  doc.text((empresa.nombre || empresa.razon_social || 'EMPRESA').toUpperCase(), companyX, y + 2);

  const companyMeta: string[] = [];
  if (empresa.razon_social && empresa.razon_social !== empresa.nombre) companyMeta.push(empresa.razon_social);
  if (empresa.rfc) companyMeta.push(`RFC: ${empresa.rfc}`);
  if (empresa.telefono) companyMeta.push(`Tel: ${empresa.telefono}`);
  if (empresa.email) companyMeta.push(empresa.email);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  companyMeta.slice(0, 3).forEach((line, idx) => doc.text(line, companyX, y + 8 + idx * 4));

  // Cabecera derecha, con línea vertical como en un documento ERP/editorial.
  const blockX = rightX - 55;
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.9);
  doc.line(blockX - 7, 14, blockX - 7, 31);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...PRIMARY);
  doc.text('ESTADO DE CUENTA', blockX, 18.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(fmtDateLong(now), blockX, 24.2);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Generado: ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`, blockX, 29.4);

  y = 39;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);

  // ─────────────────────────────────────────────────────────────
  // CLIENTE
  // ─────────────────────────────────────────────────────────────
  y = 51;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('CLIENTE', ML, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  const clientName = cliente.nombre || 'Cliente';
  doc.text(doc.splitTextToSize(clientName.toUpperCase(), contentW * 0.66)[0], ML, y + 9);

  const clientMeta: string[] = [];
  if (cliente.codigo) clientMeta.push(`Código: ${cliente.codigo}`);
  if (cliente.telefono) clientMeta.push(`Tel: ${cliente.telefono}`);
  if (cliente.rfc) clientMeta.push(`RFC: ${cliente.rfc}`);
  if (cliente.credito) {
    const credit = [cliente.dias_credito ? `${cliente.dias_credito} días` : '', cliente.limite_credito ? `Límite ${money(symbol, cliente.limite_credito)}` : '']
      .filter(Boolean)
      .join(' · ');
    if (credit) clientMeta.push(`Crédito: ${credit}`);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(clientMeta.slice(0, 3).join('   ·   ') || 'Sin datos adicionales', ML, y + 15.2);
  if (cliente.direccion) {
    doc.setFontSize(7.8);
    doc.text(doc.splitTextToSize(cliente.direccion, contentW * 0.72)[0], ML, y + 20);
  }

  // ─────────────────────────────────────────────────────────────
  // KPIs — sin tarjetas, estilo Odoo/editorial
  // ─────────────────────────────────────────────────────────────
  y = 81;
  const kpis = [
    { label: 'TOTAL VENDIDO', value: money(symbol, totalVendido), color: INK, sub: `${ventasValidas.length} documento${ventasValidas.length === 1 ? '' : 's'}` },
    { label: 'TOTAL LIQUIDADO', value: money(symbol, totalLiquidado), color: SUCCESS, sub: 'Aplicado a ventas' },
    { label: 'SALDO PENDIENTE', value: money(symbol, totalPendiente), color: totalPendiente > 0.005 ? WARNING : SUCCESS, sub: totalPendiente > 0.005 ? 'Pendiente de liquidar' : 'Cuenta al corriente' },
    { label: 'ÚLTIMO PAGO', value: ultimoPago ? money(symbol, ultimoPago.monto) : '—', color: INK, sub: ultimoPago ? `${fmtDate(ultimoPago.fecha)} · ${metodoLabel(ultimoPago.metodo_pago)}` : 'Sin pagos registrados' },
  ];
  const kpiW = contentW / 4;
  kpis.forEach((kpi, idx) => {
    const x = ML + idx * kpiW;
    if (idx > 0) {
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.line(x, y - 2, x, y + 18);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...MUTED);
    doc.text(kpi.label, x + (idx === 0 ? 0 : 7), y + 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15.5);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.value, x + (idx === 0 ? 0 : 7), y + 10.3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...SOFT_MUTED);
    const subLines = doc.splitTextToSize(kpi.sub, kpiW - (idx === 0 ? 3 : 10));
    doc.text(subLines[0], x + (idx === 0 ? 0 : 7), y + 15.4);
  });

  // ─────────────────────────────────────────────────────────────
  // VENTAS
  // ─────────────────────────────────────────────────────────────
  y = 111;
  y = drawSectionTitle(doc, y, 'Ventas', 'Documentos incluidos en este estado de cuenta');

  const salesRows = ventasValidas.map(v => {
    const pagado = Math.max(0, v.total - v.saldo_pendiente);
    return [
      v.folio || '—',
      fmtDate(v.fecha),
      condicionLabel(v.condicion_pago),
      statusLabel(v.status),
      money(symbol, v.total),
      money(symbol, pagado),
      money(symbol, v.saldo_pendiente),
    ];
  });

  if (salesRows.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, top: 22, bottom: 22 },
      theme: 'plain',
      head: [['Folio', 'Fecha', 'Condición', 'Estado', 'Total', 'Pagado', 'Pendiente']],
      body: salesRows,
      foot: [[
        '', '', '', 'Totales',
        money(symbol, totalVendido),
        money(symbol, totalLiquidado),
        money(symbol, totalPendiente),
      ]],
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        textColor: INK,
        cellPadding: { top: 3.0, bottom: 3.0, left: 2.2, right: 2.2 },
        lineWidth: 0,
      },
      headStyles: {
        fillColor: SOFT,
        textColor: MUTED,
        fontStyle: 'bold',
        fontSize: 7.4,
        cellPadding: { top: 3.2, bottom: 3.2, left: 2.2, right: 2.2 },
      },
      footStyles: {
        fillColor: WHITE,
        textColor: INK,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 3.4, bottom: 3, left: 2.2, right: 2.2 },
      },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'bold' },
        1: { cellWidth: 22 },
        2: { cellWidth: 24 },
        3: { cellWidth: 24 },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 30, halign: 'right', textColor: SUCCESS },
        6: { cellWidth: contentW - 154, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 6) {
          const raw = ventasValidas[data.row.index]?.saldo_pendiente ?? 0;
          data.cell.styles.textColor = raw > 0.005 ? WARNING : SUCCESS;
        }
        if (data.section === 'foot' && data.column.index === 3) data.cell.styles.halign = 'right';
        if (data.section === 'foot' && data.column.index >= 4) data.cell.styles.halign = 'right';
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body') {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.18);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
        if (data.section === 'foot') {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.3);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
      },
      didDrawPage: tablePageHook(doc, empresa, clientName),
    });
    y = getLastTableY(doc) + 13;
  } else {
    doc.setFillColor(...SOFT);
    doc.roundedRect(ML, y, contentW, 16, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('No hay ventas válidas para mostrar en este estado de cuenta.', ML + 5, y + 9.5);
    y += 25;
  }

  // ─────────────────────────────────────────────────────────────
  // PAGOS
  // ─────────────────────────────────────────────────────────────
  y = ensureSpace(doc, y, cobrosOrdenados.length ? 45 : 30, empresa, clientName);
  y = drawSectionTitle(doc, y, 'Pagos recibidos', 'Historial de cobros registrados para el cliente');

  if (cobrosOrdenados.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, top: 22, bottom: 22 },
      theme: 'plain',
      head: [['Fecha', 'Método', 'Referencia', 'Monto']],
      body: cobrosOrdenados.map(c => [
        fmtDate(c.fecha),
        metodoLabel(c.metodo_pago),
        c.referencia || '—',
        money(symbol, c.monto),
      ]),
      foot: [['', '', 'Total recibido', money(symbol, totalCobrado)]],
      styles: {
        font: 'helvetica',
        fontSize: 8,
        textColor: INK,
        cellPadding: { top: 3.0, bottom: 3.0, left: 2.5, right: 2.5 },
        lineWidth: 0,
      },
      headStyles: {
        fillColor: SOFT,
        textColor: MUTED,
        fontStyle: 'bold',
        fontSize: 7.4,
      },
      footStyles: {
        fillColor: WHITE,
        textColor: INK,
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 42 },
        2: { cellWidth: contentW - 104 },
        3: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: SUCCESS },
      },
      didParseCell: (data: any) => {
        if (data.section === 'foot' && data.column.index === 2) data.cell.styles.halign = 'right';
        if (data.section === 'foot' && data.column.index === 3) data.cell.styles.halign = 'right';
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body') {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.18);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
        if (data.section === 'foot') {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.3);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
      },
      didDrawPage: tablePageHook(doc, empresa, clientName),
    });
    y = getLastTableY(doc) + 14;
  } else {
    doc.setFillColor(...SOFT);
    doc.roundedRect(ML, y, contentW, 16, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('Sin pagos registrados', ML + 5, y + 7.2);
    doc.setFontSize(7.4);
    doc.setTextColor(...SOFT_MUTED);
    doc.text('No existen cobros activos registrados para este cliente.', ML + 5, y + 11.8);
    y += 27;
  }

  // ─────────────────────────────────────────────────────────────
  // RESUMEN FINAL
  // ─────────────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 31, empresa, clientName);
  const summaryW = 78;
  const summaryX = rightX - summaryW;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.35);
  doc.line(summaryX, y, rightX, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...MUTED);
  doc.text('Saldo pendiente', rightX, y + 7, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...(totalPendiente > 0.005 ? INK : SUCCESS));
  doc.text(money(symbol, totalPendiente), rightX, y + 17, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...(totalPendiente > 0.005 ? MUTED : SUCCESS));
  doc.text(totalPendiente > 0.005 ? 'Pendiente de liquidar' : 'Cuenta al corriente', rightX, y + 23, { align: 'right' });
  y += 33;

  // ─────────────────────────────────────────────────────────────
  // ANEXOS OPCIONALES: PRODUCTOS
  // ─────────────────────────────────────────────────────────────
  if (productosVendidos.length) {
    y = ensureSpace(doc, y, 42, empresa, clientName);
    y = drawSectionTitle(doc, y, 'Productos vendidos', 'Resumen histórico por producto');
    const totalCant = productosVendidos.reduce((s, p) => s + Number(p.cantidad || 0), 0);
    const totalMonto = productosVendidos.reduce((s, p) => s + Number(p.total || 0), 0);
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, top: 22, bottom: 22 },
      theme: 'plain',
      head: [['Producto', 'Cantidad', 'Importe']],
      body: productosVendidos.map(p => [p.nombre, Number(p.cantidad || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 }), money(symbol, p.total)]),
      foot: [['Total', totalCant.toLocaleString('es-MX', { maximumFractionDigits: 3 }), money(symbol, totalMonto)]],
      styles: { font: 'helvetica', fontSize: 8, textColor: INK, cellPadding: 2.8, lineWidth: 0 },
      headStyles: { fillColor: SOFT, textColor: MUTED, fontStyle: 'bold', fontSize: 7.4 },
      footStyles: { fillColor: WHITE, textColor: INK, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: contentW - 62 },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body') {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.18);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      },
      didDrawPage: tablePageHook(doc, empresa, clientName),
    });
    y = getLastTableY(doc) + 10;
  }

  if (productosDevueltos.length) {
    y = ensureSpace(doc, y, 42, empresa, clientName);
    y = drawSectionTitle(doc, y, 'Productos devueltos', 'Detalle de devoluciones registradas');
    const totalCant = productosDevueltos.reduce((s, p) => s + Number(p.cantidad || 0), 0);
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, top: 22, bottom: 22 },
      theme: 'plain',
      head: [['Producto', 'Motivo', 'Cantidad']],
      body: productosDevueltos.map(p => [p.nombre, p.motivo || '—', Number(p.cantidad || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 })]),
      foot: [['Total', '', totalCant.toLocaleString('es-MX', { maximumFractionDigits: 3 })]],
      styles: { font: 'helvetica', fontSize: 8, textColor: INK, cellPadding: 2.8, lineWidth: 0 },
      headStyles: { fillColor: SOFT, textColor: MUTED, fontStyle: 'bold', fontSize: 7.4 },
      footStyles: { fillColor: WHITE, textColor: INK, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: contentW - 78 },
        1: { cellWidth: 48 },
        2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body') {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.18);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      },
      didDrawPage: tablePageHook(doc, empresa, clientName),
    });
  }

  // Pie de página final, aplicado después de conocer el total real de páginas.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages);
  }

  return doc.output('blob');
}
