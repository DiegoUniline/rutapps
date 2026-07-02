/**
 * Estado de Cuenta PDF — Rutapp corporate layout
 * Header + KPI cards + Ventas (histórico) + Pagos + Saldo pendiente total
 * Colores: primario azul corporativo (#0060E6), acentos gris, verde para liquidado.
 */
import { getCurrencyConfig } from '@/lib/currency';
import type jsPDF from 'jspdf';

const ML = 14;
const MR = 14;

// Paleta corporativa
const PRIMARY: [number, number, number] = [0, 96, 230];      // #0060E6
const PRIMARY_SOFT: [number, number, number] = [230, 240, 255]; // fondo tarjetas suaves
const TEXT: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 110, 110];
const BORDER: [number, number, number] = [225, 228, 232];
const CARD_BG: [number, number, number] = [250, 251, 253];
const SUCCESS: [number, number, number] = [22, 163, 74];
const SUCCESS_SOFT: [number, number, number] = [230, 248, 236];
const DANGER: [number, number, number] = [220, 38, 38];
const DANGER_SOFT: [number, number, number] = [254, 232, 232];
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

const fmtCurrency = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
  try {
    const dt = new Date(d + 'T12:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
};

const fmtDateShort = (d: string) => {
  try {
    const dt = new Date(d + 'T12:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}`;
  } catch { return d; }
};

const fmtDateLong = (d: Date) => {
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
};

function drawMoneyMixed(doc: jsPDF, value: number, x: number, y: number, sym: string, bigSize = 20, smallSize = 10) {
  const [intPart, decPart] = fmtCurrency(value).split('.');
  const big = `${sym}${intPart}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(bigSize);
  doc.text(big, x, y);
  const bigW = doc.getTextWidth(big);
  doc.setFontSize(smallSize);
  doc.setTextColor(...MUTED);
  doc.text(`.${decPart}`, x + bigW + 0.5, y);
}

function statusPill(status: string): { label: string; bg: [number, number, number]; fg: [number, number, number] } {
  const s = status.toLowerCase();
  if (s === 'cancelado') return { label: 'Cancelado', bg: DANGER_SOFT, fg: DANGER };
  if (s === 'borrador') return { label: 'Borrador', bg: [240, 240, 240], fg: MUTED };
  if (s === 'entregado' || s === 'facturado') return { label: s.charAt(0).toUpperCase() + s.slice(1), bg: SUCCESS_SOFT, fg: SUCCESS };
  return { label: 'Confirmado', bg: SUCCESS_SOFT, fg: SUCCESS };
}

function metodoLabel(m: string): string {
  const map: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta',
    cheque: 'Cheque', deposito: 'Depósito', credito: 'Crédito',
  };
  return map[m?.toLowerCase()] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : '—');
}

function pillBox(doc: jsPDF, text: string, x: number, y: number, bg: [number, number, number], fg: [number, number, number], padX = 3, height = 5) {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const w = doc.getTextWidth(text) + padX * 2;
  doc.setFillColor(...bg);
  doc.roundedRect(x, y - height + 1.2, w, height, 1.2, 1.2, 'F');
  doc.setTextColor(...fg);
  doc.text(text, x + padX, y - 0.6);
  return w;
}

function checkPageBreak(doc: jsPDF, y: number, needed = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 20;
  }
  return y;
}

function getLastTableY(doc: jsPDF): number {
  const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
  return docWithTable.lastAutoTable?.finalY ?? 20;
}

function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  // Barra vertical + título
  doc.setFillColor(...PRIMARY);
  doc.rect(ML, y - 3.5, 1.2, 4.5, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT);
  doc.text(title.toUpperCase(), ML + 3.5, y);
  return y + 4;
}

export async function generarEstadoCuentaPdf(params: EstadoCuentaParams): Promise<Blob> {
  const { empresa, logoBase64, cliente, ventas, cobros, productosVendidos = [], productosDevueltos = [] } = params;
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const contentW = rightX - ML;
  const sym = getCurrencyConfig(empresa.moneda).symbol;

  const ventasCol = {
    fecha: 25,
    total: 34,
    estado: 34,
    folio: contentW - 25 - 34 - 34,
  };
  const pagosCol = {
    fecha: 28,
    metodo: 42,
    monto: 34,
    referencia: contentW - 28 - 42 - 34,
  };
  const productosCol = {
    cantidad: 28,
    importe: 34,
    producto: contentW - 28 - 34,
  };
  const devolucionesCol = {
    motivo: 48,
    cantidad: 28,
    producto: contentW - 48 - 28,
  };

  // ═════════════════ HEADER ═════════════════
  let y = 18;
  let leftX = ML;
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', ML, 14, 12, 12); leftX = ML + 15; } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PRIMARY);
  doc.text((empresa.nombre || empresa.razon_social || '').toUpperCase(), leftX, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  if (empresa.email) { doc.text(empresa.email, leftX, y); y += 4; }
  if (empresa.telefono) { doc.text(`Tel: ${empresa.telefono}`, leftX, y); y += 4; }
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text('Rutapp', leftX, y);

  // Badge derecha "ESTADO DE CUENTA"
  const badgeText = 'ESTADO DE CUENTA';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const badgeW = doc.getTextWidth(badgeText) + 8;
  const badgeH = 6.5;
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(rightX - badgeW, 14, badgeW, badgeH, 1.2, 1.2, 'F');
  doc.setTextColor(...WHITE);
  doc.text(badgeText, rightX - badgeW / 2, 18.4, { align: 'center' });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  doc.text(fmtDateLong(now), rightX, 26, { align: 'right' });
  doc.setTextColor(...MUTED);
  doc.text(`Generado: ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`, rightX, 30, { align: 'right' });

  y = 38;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 6;

  // ═════════════════ KPI CARDS ═════════════════
  const ventasValidas = ventas.filter(v => v.status !== 'cancelado');
  const totalVendido = ventasValidas.reduce((s, v) => s + v.total, 0);
  const totalPendiente = ventasValidas.reduce((s, v) => s + v.saldo_pendiente, 0);
  const totalCobrado = cobros.reduce((s, c) => s + c.monto, 0);
  const ultimoCobro = cobros.length > 0
    ? cobros.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0]
    : null;

  const cards: { label: string; render: (cx: number, cy: number, cw: number) => void; highlight?: 'primary' | 'success' }[] = [
    {
      label: 'CLIENTE',
      render: (cx, cy, cw) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...TEXT);
        const nameLines = doc.splitTextToSize(cliente.nombre, cw - 6);
        doc.text(nameLines[0], cx + 3, cy + 12);
        if (cliente.telefono) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
          doc.text(`Tel: ${cliente.telefono}`, cx + 3, cy + 17);
        }
      },
    },
    {
      label: 'TOTAL VENDIDO',
      highlight: 'primary',
      render: (cx, cy) => drawMoneyMixed(doc, totalVendido, cx + 3, cy + 15, sym, 16, 9),
    },
    {
      label: 'TOTAL COBRADO',
      render: (cx, cy) => {
        doc.setTextColor(...TEXT);
        drawMoneyMixed(doc, totalCobrado, cx + 3, cy + 15, sym, 16, 9);
      },
    },
    {
      label: 'SALDO PENDIENTE',
      highlight: totalPendiente <= 0 ? 'success' : undefined,
      render: (cx, cy) => {
        doc.setTextColor(...(totalPendiente <= 0 ? SUCCESS : DANGER));
        drawMoneyMixed(doc, totalPendiente, cx + 3, cy + 15, sym, 16, 9);
      },
    },
    {
      label: 'ÚLTIMO PAGO',
      render: (cx, cy) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...TEXT);
        doc.text(ultimoCobro ? fmtDateShort(ultimoCobro.fecha) : '—', cx + 3, cy + 13);
        if (ultimoCobro) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
          doc.text(String(new Date(ultimoCobro.fecha + 'T12:00:00').getFullYear()), cx + 3, cy + 18);
        }
      },
    },
  ];

  const gap = 2.5;
  const cardH = 22;
  const totalGap = gap * (cards.length - 1);
  const cardW = (rightX - ML - totalGap) / cards.length;

  cards.forEach((card, i) => {
    const cx = ML + i * (cardW + gap);
    const isPrimary = card.highlight === 'primary';
    const isSuccess = card.highlight === 'success';
    // Fondo
    doc.setFillColor(...(isPrimary ? PRIMARY_SOFT : isSuccess ? SUCCESS_SOFT : CARD_BG));
    doc.setDrawColor(...(isPrimary ? PRIMARY : isSuccess ? SUCCESS : BORDER));
    doc.setLineWidth(isPrimary || isSuccess ? 0.5 : 0.3);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, 'FD');
    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...(isPrimary ? PRIMARY : isSuccess ? SUCCESS : MUTED));
    const labelLines = doc.splitTextToSize(card.label, cardW - 6);
    labelLines.slice(0, 2).forEach((ln: string, idx: number) => {
      doc.text(ln, cx + 3, y + 4.5 + idx * 3);
    });
    card.render(cx, y, cardW);
  });

  y += cardH + 8;

  // ═════════════════ VENTAS ═════════════════
  y = drawSectionTitle(doc, y, 'Ventas');
  y += 2;

  const ventasOrdenadas = ventas.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const subtotalVentas = ventasValidas.reduce((s, v) => s + v.total, 0);

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    theme: 'plain',
    head: [['Folio', 'Fecha', 'Total', 'Estado']],
    body: ventasOrdenadas.map(v => [
      v.folio || '—',
      fmtDate(v.fecha),
      `${sym}${fmtCurrency(v.total)}`,
      v.status,
    ]),
    styles: { fontSize: 9, cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 }, textColor: TEXT, font: 'helvetica' },
    headStyles: {
      fillColor: PRIMARY_SOFT, textColor: PRIMARY, fontStyle: 'bold', fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    foot: [['', 'Subtotal', `${sym}${fmtCurrency(subtotalVentas)}`, '']],
    footStyles: {
      fillColor: CARD_BG, textColor: TEXT, fontStyle: 'bold', fontSize: 9,
      cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: PRIMARY, cellWidth: ventasCol.folio },
      1: { cellWidth: ventasCol.fecha },
      2: { halign: 'right', fontStyle: 'bold', cellWidth: ventasCol.total },
      3: { halign: 'left', cellWidth: ventasCol.estado },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.text = ['']; // dibujamos pill manualmente
      }
      if (data.section === 'foot' && data.column.index === 1) {
        data.cell.styles.halign = 'right';
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body') {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.15);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      if (data.section === 'body' && data.column.index === 3) {
        const v = ventasOrdenadas[data.row.index];
        if (!v) return;
        const p = statusPill(v.status);
        pillBox(doc, p.label, data.cell.x + 3, data.cell.y + data.cell.height / 2 + 1.5, p.bg, p.fg);
      }
    },
  });
  y = getLastTableY(doc) + 8;

  // ═════════════════ PAGOS RECIBIDOS ═════════════════
  y = checkPageBreak(doc, y, 50);
  y = drawSectionTitle(doc, y, 'Pagos recibidos');
  y += 2;

  if (cobros.length > 0) {
    const cobrosOrdenados = cobros.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      theme: 'plain',
      head: [['Fecha', 'Método de pago', 'Referencia', 'Monto']],
      body: cobrosOrdenados.map(c => [
        fmtDate(c.fecha),
        metodoLabel(c.metodo_pago),
        c.referencia || '—',
        `${sym}${fmtCurrency(c.monto)}`,
      ]),
      styles: { fontSize: 9, cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 }, textColor: TEXT, font: 'helvetica' },
      headStyles: {
        fillColor: PRIMARY_SOFT, textColor: PRIMARY, fontStyle: 'bold', fontSize: 8,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
      foot: [['', '', 'Total cobrado', `${sym}${fmtCurrency(totalCobrado)}`]],
      footStyles: {
        fillColor: CARD_BG, textColor: TEXT, fontStyle: 'bold', fontSize: 9,
        cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: pagosCol.fecha },
        1: { cellWidth: pagosCol.metodo },
        2: { cellWidth: pagosCol.referencia },
        3: { halign: 'right', fontStyle: 'bold', cellWidth: pagosCol.monto },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) data.cell.text = [''];
        if (data.section === 'foot' && data.column.index === 2) data.cell.styles.halign = 'right';
      },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.15);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
        if (data.section === 'body' && data.column.index === 1) {
          const c = cobrosOrdenados[data.row.index];
          if (!c) return;
          pillBox(doc, metodoLabel(c.metodo_pago), data.cell.x + 3, data.cell.y + data.cell.height / 2 + 1.5, PRIMARY_SOFT, PRIMARY);
        }
      },
    });
    y = getLastTableY(doc) + 8;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Sin pagos registrados', ML, y + 4);
    y += 10;
  }

  // ═════════════════ BANNER SALDO PENDIENTE ═════════════════
  y = checkPageBreak(doc, y, 30);
  const liquidado = totalPendiente <= 0.005;
  const bannerBg = liquidado ? SUCCESS_SOFT : DANGER_SOFT;
  const bannerFg = liquidado ? SUCCESS : DANGER;
  const bannerH = 20;
  doc.setFillColor(...bannerBg);
  doc.setDrawColor(...bannerFg);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, y, rightX - ML, bannerH, 2, 2, 'FD');

  // Label izquierda
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...bannerFg);
  doc.text('Saldo pendiente total', ML + 5, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...bannerFg);
  doc.text(liquidado ? 'Cuenta al corriente' : 'El cliente adeuda este monto', ML + 5, y + 15);

  // Pill estado arriba a la derecha
  const estadoTxt = liquidado ? 'LIQUIDADO' : 'PENDIENTE';
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const pillW = doc.getTextWidth(estadoTxt) + 6;
  const pillX = rightX - 5 - pillW;
  doc.setFillColor(...bannerFg);
  doc.roundedRect(pillX, y + 3, pillW, 5.5, 1.2, 1.2, 'F');
  doc.setTextColor(...WHITE);
  doc.text(estadoTxt, pillX + pillW / 2, y + 6.9, { align: 'center' });

  // Monto grande debajo del pill
  const montoTxt = `${sym}${fmtCurrency(Math.max(totalPendiente, 0))}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...bannerFg);
  doc.text(montoTxt, rightX - 5, y + 16, { align: 'right' });

  y += bannerH + 8;

  // ═════════════════ RESUMEN DE PRODUCTOS ═════════════════
  if (productosVendidos.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = drawSectionTitle(doc, y, 'Productos vendidos (histórico)');
    y += 2;
    const totalCant = productosVendidos.reduce((s, p) => s + p.cantidad, 0);
    const totalMonto = productosVendidos.reduce((s, p) => s + p.total, 0);
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      theme: 'plain',
      head: [['Producto', 'Cantidad', 'Importe']],
      body: productosVendidos.map(p => [
        p.nombre,
        p.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 }),
        `${sym}${fmtCurrency(p.total)}`,
      ]),
      foot: [['Total', totalCant.toLocaleString('es-MX', { maximumFractionDigits: 3 }), `${sym}${fmtCurrency(totalMonto)}`]],
      styles: { fontSize: 9, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 }, textColor: TEXT, font: 'helvetica' },
      headStyles: { fillColor: PRIMARY_SOFT, textColor: PRIMARY, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: CARD_BG, textColor: TEXT, fontStyle: 'bold', fontSize: 9 },
      columnStyles: {
        0: { cellWidth: productosCol.producto },
        1: { halign: 'right', cellWidth: productosCol.cantidad },
        2: { halign: 'right', cellWidth: productosCol.importe, fontStyle: 'bold' },
      },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.15);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      },
    });
    y = getLastTableY(doc) + 6;
  }

  if (productosDevueltos.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = drawSectionTitle(doc, y, 'Productos devueltos');
    y += 2;
    const totalCant = productosDevueltos.reduce((s, p) => s + p.cantidad, 0);
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      theme: 'plain',
      head: [['Producto', 'Motivo', 'Cantidad']],
      body: productosDevueltos.map(p => [
        p.nombre,
        p.motivo || '—',
        p.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 }),
      ]),
      foot: [['Total', '', totalCant.toLocaleString('es-MX', { maximumFractionDigits: 3 })]],
      styles: { fontSize: 9, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 }, textColor: TEXT, font: 'helvetica' },
      headStyles: { fillColor: PRIMARY_SOFT, textColor: PRIMARY, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: CARD_BG, textColor: TEXT, fontStyle: 'bold', fontSize: 9 },
      columnStyles: {
        0: { cellWidth: devolucionesCol.producto },
        1: { cellWidth: devolucionesCol.motivo },
        2: { halign: 'right', cellWidth: devolucionesCol.cantidad, fontStyle: 'bold' },
      },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.15);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      },
    });
    y = getLastTableY(doc) + 6;
  }

  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  const empresaNombre = empresa.nombre || empresa.razon_social || '';
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 13, pageW - MR, pageH - 13);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(empresaNombre ? `Rutapp · ${empresaNombre}` : 'Rutapp', ML, pageH - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 8, { align: 'right' });
  }

  return doc.output('blob');
}
