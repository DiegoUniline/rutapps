/**
 * CFDI PDF generator — Clean Odoo-style layout matching the HTML template exactly
 * No HTML canvas — 100% jsPDF code
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import {
  ML, MR, fmtCurrency,
  drawFooter, checkPageBreak,
  type EmpresaInfo,
} from './pdfStyleOdoo';

export interface CfdiPdfParams {
  empresa: EmpresaInfo & {
    regimen_fiscal?: string | null;
  };
  logoBase64?: string | null;
  cfdi: {
    serie?: string | null;
    folio?: string | null;
    folio_fiscal?: string | null;
    cfdi_type?: string;
    currency?: string;
    payment_form?: string | null;
    payment_method?: string | null;
    expedition_place?: string | null;
    subtotal: number;
    iva_total: number;
    ieps_total: number;
    retenciones_total: number;
    total: number;
    created_at: string;
    status: string;
    cadena_original?: string | null;
    sello_cfdi?: string | null;
    sello_sat?: string | null;
    no_certificado_sat?: string | null;
    no_certificado_emisor?: string | null;
    fecha_timbrado?: string | null;
  };
  receiver: {
    rfc: string;
    name: string;
    cfdi_use?: string | null;
    fiscal_regime?: string | null;
    tax_zip_code?: string | null;
    direccion?: string | null;
    email?: string | null;
  };
  lineas: {
    descripcion: string;
    product_code: string;
    unit_code: string;
    unit_name: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    iva_pct: number;
    ieps_pct: number;
    iva_monto: number;
    ieps_monto: number;
    total: number;
  }[];
  formasPagoLabel?: string;
  metodoPagoLabel?: string;
  usoCfdiLabel?: string;
  regimenEmisorLabel?: string;
  regimenReceptorLabel?: string;
}

// ── Colors matching the HTML exactly ──
const C = {
  text: [26, 26, 26] as [number, number, number],
  label: [26, 26, 26] as [number, number, number],
  muted: [26, 26, 26] as [number, number, number],
  sublabel: [26, 26, 26] as [number, number, number],
  light: [26, 26, 26] as [number, number, number],
  border: [224, 224, 224] as [number, number, number],
  borderLight: [238, 238, 238] as [number, number, number],
  headBg: [247, 247, 247] as [number, number, number],
  uuidBg: [250, 250, 250] as [number, number, number],
  uuidBorder: [232, 232, 232] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  footerBorder: [26, 26, 26] as [number, number, number],
  cfdiLabel: [26, 26, 26] as [number, number, number],
  cfdiVal: [26, 26, 26] as [number, number, number],
};

// ── Number to spanish words ──
function numberToWords(n: number): string {
  const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const hundreds = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  const int = Math.floor(n);
  const cents = Math.round((n - int) * 100);

  if (int === 0) return `CERO PESOS ${String(cents).padStart(2, '0')}/100 MXN`;

  function convert(num: number): string {
    if (num === 0) return '';
    if (num < 10) return units[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) {
      const t = Math.floor(num / 10);
      const u = num % 10;
      if (num >= 21 && num <= 29) return 'VEINTI' + units[u].toLowerCase();
      return tens[t] + (u ? ' Y ' + units[u] : '');
    }
    if (num < 1000) {
      const h = Math.floor(num / 100);
      const rest = num % 100;
      if (num === 100) return 'CIEN';
      return hundreds[h] + (rest ? ' ' + convert(rest) : '');
    }
    if (num < 1000000) {
      const th = Math.floor(num / 1000);
      const rest = num % 1000;
      if (th === 1) return 'MIL' + (rest ? ' ' + convert(rest) : '');
      return convert(th) + ' MIL' + (rest ? ' ' + convert(rest) : '');
    }
    return String(num);
  }

  return `${convert(int)} PESOS ${String(cents).padStart(2, '0')}/100 MXN`;
}

async function generateQrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, { width: 200, margin: 1 });
  } catch {
    return null;
  }
}

function formatCfdiDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

// ── Helper: draw text pair (label + value) ──
function drawPair(doc: jsPDF, x: number, y: number, label: string, value: string, labelColor = C.text, fontSize = 8.5) {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...labelColor);
  const labelW = doc.getTextWidth(label + ' ');
  doc.text(label, x, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(value, x + labelW, y);
}

export async function generarCfdiPdf(params: CfdiPdfParams): Promise<Blob> {
  const { empresa, logoBase64, cfdi, receiver, lineas, formasPagoLabel, metodoPagoLabel, usoCfdiLabel, regimenEmisorLabel, regimenReceptorLabel } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: false, putOnlyUsedFonts: true });
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const midX = pageW / 2;
  const contentW = pageW - ML - MR;

  let y = 16;

  // ═══════════════════════════════════════════════════════
  // HEADER: Logo + Emisor (left) | FACTURA + Folio (right)
  // ═══════════════════════════════════════════════════════
  let emisorX = ML;
  const logoSize = 18;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, y - 6, logoSize, logoSize);
      emisorX = ML + logoSize + 5;
    } catch { /* ignore */ }
  }

  // Emisor name — big and bold
  const maxNameW = (pageW / 2) - emisorX;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  const companyName = empresa.razon_social || empresa.nombre;
  const nameLines = doc.splitTextToSize(companyName, maxNameW);
  doc.text(nameLines[0], emisorX, y);
  y += 5;
  if (nameLines.length > 1) {
    doc.text(nameLines[1], emisorX, y);
    y += 5;
  }

  // Emisor RFC
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(`RFC: ${empresa.rfc || ''}`, emisorX, y);
  y += 4.5;

  // Emisor address
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado].filter(Boolean).join(', ');
  if (addr) {
    const addrLines = doc.splitTextToSize(addr, maxNameW);
    doc.text(addrLines[0], emisorX, y);
    y += 4;
    if (addrLines.length > 1) {
      doc.text(addrLines[1], emisorX, y);
      y += 4;
    }
  }

  // Emisor CP + Régimen
  const regimenLabel = regimenEmisorLabel ? `${empresa.regimen_fiscal} - ${regimenEmisorLabel}` : empresa.regimen_fiscal || '';
  doc.text(`C.P. ${empresa.cp || ''} · Régimen: ${regimenLabel}`, emisorX, y);

  // Right side: FACTURA + Folio
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('FACTURA', rightX, 18, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  const folioText = `Folio: ${cfdi.serie || 'A'}-${cfdi.folio || '—'}`;
  doc.text(folioText, rightX, 25, { align: 'right' });

  y = Math.max(y + 8, logoBase64 ? 42 : 38);

  // ═══════════════════════════════════════════════════════
  // TWO-COLUMN INFO GRID (with top/bottom borders)
  // ═══════════════════════════════════════════════════════
  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(ML, y, rightX, y);
  y += 7;

  const colL = ML;
  const colR = midX + 4;

  // Vertical divider line (we'll draw after content)
  const gridTopY = y - 3;

  // ── LEFT COLUMN: Receptor ──
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('RECEPTOR', colL, y);
  y += 6;

  // Receptor name
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(receiver.name, colL, y);
  y += 4;

  // Receptor RFC
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);
  doc.text(`RFC: ${receiver.rfc}`, colL, y);
  y += 4;

  // Receptor address
  if (receiver.direccion) {
    doc.text(receiver.direccion, colL, y);
    y += 4;
  }

  // Receptor CP
  doc.text(`C.P. ${receiver.tax_zip_code || ''}`, colL, y);
  y += 4;

  // Receptor email
  if (receiver.email) {
    doc.text(receiver.email, colL, y);
    y += 4;
  }

  const leftEndY = y;

  // ── RIGHT COLUMN: Información del documento ──
  let ry = gridTopY + 3;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('INFORMACIÓN DEL DOCUMENTO', colR, ry);
  ry += 6;

  // Info rows as table
  const infoRows: [string, string][] = [
    ['Fecha de emisión:', formatDateShort(cfdi.fecha_timbrado || cfdi.created_at)],
    ['Forma de pago:', formasPagoLabel || cfdi.payment_form || '—'],
    ['Método de pago:', metodoPagoLabel || cfdi.payment_method || '—'],
    ['Uso del CFDI:', usoCfdiLabel || receiver.cfdi_use || '—'],
    ['Moneda:', `${cfdi.currency || 'MXN'} - Peso Mexicano`],
    ['Régimen receptor:', regimenReceptorLabel || receiver.fiscal_regime || '—'],
  ];

  for (const [lbl, val] of infoRows) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text);
    doc.text(lbl, colR, ry);
    doc.setFont('helvetica', 'bold');
    doc.text(val, colR + 42, ry);
    ry += 5;
  }

  y = Math.max(leftEndY, ry) + 2;

  // Vertical divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(midX, gridTopY, midX, y - 2);

  // Bottom border
  doc.line(ML, y, rightX, y);
  y += 6;

  // ═══════════════════════════════════════════════════════
  // UUID ROW (rounded background box)
  // ═══════════════════════════════════════════════════════
  if (cfdi.folio_fiscal) {
    const uuidBoxH = 10;
    // Background
    doc.setFillColor(...C.uuidBg);
    doc.setDrawColor(...C.uuidBorder);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, contentW, uuidBoxH, 2, 2, 'FD');

    const uuidY = y + 4;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.sublabel);
    doc.text('Folio fiscal (UUID):', ML + 4, uuidY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.cfdiVal);
    doc.text(cfdi.folio_fiscal, ML + 36, uuidY, { baseline: 'middle' });

    const fechaStr = `Fecha timbrado: ${formatCfdiDate(cfdi.fecha_timbrado || cfdi.created_at)}`;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.sublabel);
    // Position after UUID
    const fechaX = ML + 4;
    doc.text(fechaStr, fechaX, uuidY + 4);

    // PAC
    doc.text('PAC: SPR190613I52', rightX - 30, uuidY + 4);

    y += uuidBoxH + 6;
  }

  // ═══════════════════════════════════════════════════════
  // CONCEPTOS TABLE
  // ═══════════════════════════════════════════════════════
  const tableHead = [['Clave', 'Descripción', 'Cant.', 'Unidad', 'P. Unit.', 'IVA', 'Importe']];
  const tableBody: any[][] = [];

  for (const l of lineas) {
    const ivaStr = l.iva_pct > 0 ? `${l.iva_pct}%` : '—';

    tableBody.push([
      { content: l.product_code, styles: { textColor: C.muted, fontStyle: 'normal', fontSize: 7 } },
      l.descripcion,
      { content: String(l.cantidad), styles: { halign: 'center' } },
      `${l.unit_code} ${l.unit_name}`,
      { content: `$${fmtCurrency(l.precio_unitario)}`, styles: { halign: 'right' } },
      { content: ivaStr, styles: { halign: 'center' } },
      { content: `$${fmtCurrency(l.subtotal)}`, styles: { halign: 'right', fontStyle: 'bold' } },
    ]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    theme: 'plain',
    head: tableHead,
    body: tableBody,
    styles: {
      fillColor: C.white,
      textColor: C.text,
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      lineWidth: 0,
    },
    headStyles: {
      fillColor: C.headBg,
      textColor: C.text,
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
    },
    bodyStyles: {
      fillColor: C.white,
    },
    alternateRowStyles: {
      fillColor: C.white,
    },
    columnStyles: {
      0: { cellWidth: 20 },   // Clave
      1: { cellWidth: 'auto' }, // Descripción
      2: { cellWidth: 14, halign: 'center' },  // Cant
      3: { cellWidth: 24 },   // Unidad
      4: { cellWidth: 22, halign: 'right' },  // P. Unit.
      5: { cellWidth: 14, halign: 'center' },  // IVA
      6: { cellWidth: 22, halign: 'right' },   // Importe
    },
    didDrawCell: (data: any) => {
      // Draw bottom border for head (2px solid #e0e0e0)
      if (data.section === 'head') {
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.6);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      // Draw bottom border for body rows (1px solid #eee) except last
      if (data.section === 'body' && data.row.index < tableBody.length - 1) {
        doc.setDrawColor(...C.borderLight);
        doc.setLineWidth(0.2);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ═══════════════════════════════════════════════════════
  // TOTALS — right aligned, matching HTML exactly
  // ═══════════════════════════════════════════════════════
  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y - 2, rightX, y - 2);
  y += 2;

  const totLabelX = rightX - 55;

  // Subtotal
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('Subtotal:', totLabelX, y, { align: 'right' });
  doc.text(`$${fmtCurrency(cfdi.subtotal)}`, rightX, y, { align: 'right' });
  y += 5.5;

  // IEPS if any
  if (cfdi.ieps_total > 0) {
    doc.text('IEPS:', totLabelX, y, { align: 'right' });
    doc.text(`$${fmtCurrency(cfdi.ieps_total)}`, rightX, y, { align: 'right' });
    y += 5.5;
  }

  // IVA
  doc.text('IVA 16%:', totLabelX, y, { align: 'right' });
  doc.text(`$${fmtCurrency(cfdi.iva_total)}`, rightX, y, { align: 'right' });
  y += 5.5;

  // Retenciones if any
  if (cfdi.retenciones_total > 0) {
    doc.text('Retenciones:', totLabelX, y, { align: 'right' });
    doc.text(`-$${fmtCurrency(cfdi.retenciones_total)}`, rightX, y, { align: 'right' });
    y += 5.5;
  }

  // Total line
  doc.setDrawColor(...C.text);
  doc.setLineWidth(0.8);
  doc.line(totLabelX - 15, y, rightX, y);
  y += 5;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('Total:', totLabelX, y, { align: 'right' });
  doc.text(`$${fmtCurrency(cfdi.total)}`, rightX, y, { align: 'right' });
  y += 8;

  // ═══════════════════════════════════════════════════════
  // IMPORTE CON LETRA (centered, uppercase, bordered)
  // ═══════════════════════════════════════════════════════
  const words = numberToWords(cfdi.total);

  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(words, midX, y, { align: 'center' });
  y += 4;

  // Bottom border
  doc.setDrawColor(...C.border);
  doc.line(ML, y, rightX, y);
  y += 8;

  // ═══════════════════════════════════════════════════════
  // CFDI FOOTER: QR + Cadena + Sellos + Certificados
  // ═══════════════════════════════════════════════════════
  if (cfdi.folio_fiscal) {
    y = checkPageBreak(doc, y, 80);

    // QR on left
    const qrSize = 22;
    const qrUrl = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${cfdi.folio_fiscal}&re=${empresa.rfc || ''}&rr=${receiver.rfc || ''}&tt=${cfdi.total.toFixed(6)}`;
    const qrDataUrl = await generateQrDataUrl(qrUrl);

    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', ML, y, qrSize, qrSize);
      } catch { /* ignore */ }
    }

    const infoX = ML + qrSize + 5;
    const maxTextW = rightX - infoX;
    let sY = y;

    // Cadena Original
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.cfdiLabel);
    doc.text('Cadena original del complemento de certificación digital del SAT', infoX, sY);
    sY += 3;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.footerBorder);
    doc.setFontSize(4.5);
    const cadenaText = cfdi.cadena_original || `||1.1|${cfdi.folio_fiscal}|...||`;
    const cadenaLines = doc.splitTextToSize(cadenaText, maxTextW);
    doc.text(cadenaLines, infoX, sY);
    sY += cadenaLines.length * 2 + 3;

    // Sello digital del CFDI
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.cfdiLabel);
    doc.text('Sello digital del CFDI', infoX, sY);
    sY += 3;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.footerBorder);
    doc.setFontSize(4.5);
    const selloCfdiText = cfdi.sello_cfdi || 'Disponible en el archivo XML';
    const selloCfdiLines = doc.splitTextToSize(selloCfdiText, maxTextW);
    doc.text(selloCfdiLines, infoX, sY);
    sY += selloCfdiLines.length * 2 + 3;

    // Sello digital del SAT
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.cfdiLabel);
    doc.text('Sello digital del SAT', infoX, sY);
    sY += 3;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.footerBorder);
    doc.setFontSize(4.5);
    const selloSatText = cfdi.sello_sat || 'Disponible en el archivo XML';
    const selloSatLines = doc.splitTextToSize(selloSatText, maxTextW);
    doc.text(selloSatLines, infoX, sY);
    sY += selloSatLines.length * 2 + 3;

    // Certificados
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.cfdiLabel);
    doc.text(`No. cert. SAT: `, infoX, sY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.footerBorder);
    doc.text(cfdi.no_certificado_sat || '—', infoX + 22, sY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.cfdiLabel);
    doc.text(`No. cert. emisor: `, infoX + 60, sY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.footerBorder);
    doc.text(cfdi.no_certificado_emisor || '—', infoX + 85, sY);

    y = Math.max(y + qrSize + 4, sY + 6);
  }

  // ═══════════════════════════════════════════════════════
  // PIE DE PÁGINA
  // ═══════════════════════════════════════════════════════
  y = checkPageBreak(doc, y, 16);

  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.2);
  doc.line(ML, y, rightX, y);
  y += 5;

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.light);
  doc.text('Este documento es una representación impresa de un CFDI · Generado por tu sistema', midX, y, { align: 'center' });

  drawFooter(doc, `${empresa.nombre} — Factura generada por Rutapp`);

  return doc.output('blob');
}
