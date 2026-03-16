/**
 * Custom CFDI PDF generator — Super clean layout replicating Facturama style
 * No colored backgrounds, no badges. Clean neutral typography with logo.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import {
  PDF, ML, MR, fmtCurrency,
  drawFooter, checkPageBreak,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

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
  };
  receiver: {
    rfc: string;
    name: string;
    cfdi_use?: string | null;
    fiscal_regime?: string | null;
    tax_zip_code?: string | null;
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

// Number to spanish words (simplified for MXN)
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

export async function generarCfdiPdf(params: CfdiPdfParams): Promise<Blob> {
  const { empresa, logoBase64, cfdi, receiver, lineas, formasPagoLabel, metodoPagoLabel, usoCfdiLabel, regimenEmisorLabel, regimenReceptorLabel } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;

  const folioDisplay = `${cfdi.serie || 'A'}-${cfdi.folio || '—'}`;
  let y = 14;
  let leftStartX = ML;

  // ═══════════════════════════════════════════
  // HEADER — Logo + Company name left, FACTURA + folio right
  // ═══════════════════════════════════════════
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 8, 22, 22);
      leftStartX = ML + 26;
    } catch { /* ignore */ }
  }

  // Company name (bold, large)
  doc.setTextColor(...PDF.black);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre.toUpperCase(), leftStartX, y);

  // Razon social if different
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.dark);
  y += 5;
  if (empresa.razon_social && empresa.razon_social !== empresa.nombre) {
    doc.text(empresa.razon_social, leftStartX, y); y += 3.5;
  }
  if (empresa.rfc) { doc.text(`RFC: ${empresa.rfc}`, leftStartX, y); y += 3.5; }
  if (empresa.regimen_fiscal) {
    const label = regimenEmisorLabel || empresa.regimen_fiscal;
    doc.text(`Régimen: ${label}`, leftStartX, y); y += 3.5;
  }
  if (empresa.cp) { doc.text(`C.P. ${empresa.cp}`, leftStartX, y); y += 3.5; }

  // Right side — "FACTURA" text (no badge, just bold text) + folio + date
  doc.setTextColor(...PDF.black);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURA', rightX, 16, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(folioDisplay, rightX, 22, { align: 'right' });

  // Date
  doc.setFontSize(7);
  doc.setTextColor(...PDF.muted);
  doc.setFont('helvetica', 'normal');
  const dateStr = (() => {
    try {
      return new Date(cfdi.created_at).toLocaleString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return cfdi.created_at; }
  })();
  doc.text(dateStr, rightX, 26, { align: 'right' });

  // UUID under date
  if (cfdi.folio_fiscal) {
    doc.setFontSize(6);
    doc.setTextColor(...PDF.muted);
    doc.text(`UUID: ${cfdi.folio_fiscal}`, rightX, 30, { align: 'right' });
  }

  // Separator
  y = Math.max(y, 34) + 3;
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 7;

  // ═══════════════════════════════════════════
  // RECEPTOR — Clean label:value pairs
  // ═══════════════════════════════════════════
  const sectionTitle = (title: string) => {
    doc.setTextColor(...PDF.black);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(title, ML, y);
    y += 5;
  };

  const fieldRow = (label: string, value: string, x = ML) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.muted);
    doc.text(label, x, y);
    doc.setTextColor(...PDF.black);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(value || '—', x + 30, y);
    y += 4.5;
  };

  const fieldRowWide = (label: string, value: string, x = ML) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.muted);
    doc.text(label, x, y);
    y += 3.5;
    doc.setTextColor(...PDF.black);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(value || '—', x, y);
    y += 5;
  };

  sectionTitle('Receptor');
  fieldRowWide('Razón Social', receiver.name);

  // RFC and CP on same row
  const midCol = ML + 80;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.muted);
  doc.text('RFC', ML, y);
  doc.text('C.P. Fiscal', midCol, y);
  y += 3.5;
  doc.setTextColor(...PDF.black);
  doc.setFontSize(7.5);
  doc.text(receiver.rfc || '—', ML, y);
  doc.text(receiver.tax_zip_code || '—', midCol, y);
  y += 5;

  fieldRowWide('Régimen Fiscal', regimenReceptorLabel || receiver.fiscal_regime || '—');

  // Thin separator
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.2);
  doc.line(ML, y, rightX, y);
  y += 6;

  // ═══════════════════════════════════════════
  // DATOS DEL COMPROBANTE
  // ═══════════════════════════════════════════
  sectionTitle('Datos del Comprobante');
  fieldRow('Uso CFDI', usoCfdiLabel || receiver.cfdi_use || '—');
  fieldRow('Forma de Pago', formasPagoLabel || cfdi.payment_form || '—');
  fieldRow('Método de Pago', metodoPagoLabel || cfdi.payment_method || '—');

  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.2);
  doc.line(ML, y, rightX, y);
  y += 6;

  // ═══════════════════════════════════════════
  // CONCEPTOS TABLE — Neutral header
  // ═══════════════════════════════════════════
  sectionTitle('Conceptos');

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Clave SAT', 'Descripción', 'Unidad', 'Cantidad', 'P. Unitario', 'IVA', 'IEPS', 'Importe']],
    body: lineas.map(l => [
      l.product_code,
      l.descripcion,
      `${l.unit_code} - ${l.unit_name}`,
      String(l.cantidad),
      `$${fmtCurrency(l.precio_unitario)}`,
      l.iva_pct > 0 ? `${l.iva_pct}%` : '—',
      l.ieps_pct > 0 ? `${l.ieps_pct}%` : '—',
      `$${fmtCurrency(l.subtotal)}`,
    ]),
    headStyles: {
      ...TABLE_HEAD_STYLE,
      fontSize: 6.5,
    },
    bodyStyles: { ...TABLE_BODY_STYLE, fontSize: 6.5 },
    alternateRowStyles: TABLE_ALT_STYLE,
    columnStyles: {
      0: { cellWidth: 18, fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 22 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 14, halign: 'right' },
      7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ═══════════════════════════════════════════
  // TOTALS — right aligned, clean
  // ═══════════════════════════════════════════
  const totalsX = rightX - 60;

  const drawTotalRow = (label: string, value: string, bold = false) => {
    doc.setFontSize(bold ? 9 : 7.5);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...(bold ? PDF.black : PDF.muted));
    doc.text(label, totalsX, y);
    doc.setTextColor(...PDF.black);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(value, rightX, y, { align: 'right' });
    y += bold ? 6 : 5;
  };

  drawTotalRow('Subtotal:', `$${fmtCurrency(cfdi.subtotal)}`);
  if (cfdi.ieps_total > 0) drawTotalRow('IEPS:', `$${fmtCurrency(cfdi.ieps_total)}`);
  if (cfdi.iva_total > 0) drawTotalRow('IVA 16%:', `$${fmtCurrency(cfdi.iva_total)}`);
  if (cfdi.retenciones_total > 0) drawTotalRow('Retenciones:', `-$${fmtCurrency(cfdi.retenciones_total)}`);

  // Total separator
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.3);
  doc.line(totalsX, y - 1, rightX, y - 1);
  y += 2;
  drawTotalRow('Total:', `$${fmtCurrency(cfdi.total)}`, true);

  // Amount in words
  y += 1;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...PDF.muted);
  doc.text(numberToWords(cfdi.total), ML, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.dark);
  doc.text(`Moneda: ${cfdi.currency || 'MXN'} — Peso Mexicano`, ML, y);
  y += 8;

  // ═══════════════════════════════════════════
  // TAX DETAIL TABLE
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 30);

  doc.setTextColor(...PDF.black);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Desglose de Impuestos', ML, y);
  y += 5;

  const taxRows = lineas.flatMap(l => {
    const rows: string[][] = [];
    if (l.iva_pct > 0) {
      rows.push(['IVA', 'Traslado', `$${fmtCurrency(l.subtotal)}`, `${(l.iva_pct / 100).toFixed(6)}`, `$${fmtCurrency(l.iva_monto)}`]);
    }
    if (l.ieps_pct > 0) {
      rows.push(['IEPS', 'Traslado', `$${fmtCurrency(l.subtotal)}`, `${(l.ieps_pct / 100).toFixed(6)}`, `$${fmtCurrency(l.ieps_monto)}`]);
    }
    return rows;
  });

  if (taxRows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Impuesto', 'Tipo', 'Base', 'Tasa', 'Importe']],
      body: taxRows,
      headStyles: { ...TABLE_HEAD_STYLE, fontSize: 6.5 },
      bodyStyles: { ...TABLE_BODY_STYLE, fontSize: 6.5 },
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 20 },
        1: { cellWidth: 20 },
        2: { halign: 'right', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 25 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ═══════════════════════════════════════════
  // SELLO / CADENA / QR — Clean bottom section
  // ═══════════════════════════════════════════
  if (cfdi.folio_fiscal) {
    y = checkPageBreak(doc, y, 55);

    // Thin top border
    doc.setDrawColor(...PDF.border);
    doc.setLineWidth(0.3);
    doc.line(ML, y, rightX, y);
    y += 5;

    // QR on the left
    const qrSize = 32;
    const qrUrl = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${cfdi.folio_fiscal}&re=${empresa.rfc || ''}&rr=${receiver.rfc || ''}&tt=${cfdi.total.toFixed(6)}`;
    const qrDataUrl = await generateQrDataUrl(qrUrl);

    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', ML, y - 2, qrSize, qrSize);
      } catch { /* ignore */ }
    }

    // Info right of QR
    const infoX = ML + qrSize + 5;

    const stampLabel = (lbl: string, val: string, ly: number) => {
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PDF.dark);
      doc.text(lbl, infoX, ly);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF.black);
      doc.setFontSize(6.5);
      // Wrap the value to fit
      const maxW = rightX - infoX;
      const split = doc.splitTextToSize(val, maxW);
      doc.text(split, infoX, ly + 3.5);
      return ly + 3.5 + split.length * 3;
    };

    let sy = y;
    sy = stampLabel('Folio Fiscal (UUID):', cfdi.folio_fiscal, sy);
    sy += 1;
    sy = stampLabel('Lugar de Expedición:', cfdi.expedition_place || '—', sy);
    sy += 1;
    sy = stampLabel('Efecto del comprobante:', cfdi.cfdi_type === 'I' ? 'I - Ingreso' : cfdi.cfdi_type === 'E' ? 'E - Egreso' : cfdi.cfdi_type || '—', sy);
    sy += 1;
    sy = stampLabel('Exportación:', '01 - No aplica', sy);

    y = Math.max(y + qrSize + 3, sy + 4);

    // Cadena original del complemento de certificación digital
    y = checkPageBreak(doc, y, 20);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF.dark);
    doc.text('Cadena Original del Complemento de Certificación Digital del SAT:', ML, y);
    y += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.muted);
    doc.setFontSize(5.5);
    // Simulated cadena — in a real implementation this would come from the XML
    const cadenaText = `||1.1|${cfdi.folio_fiscal}|${dateStr}|SAT970701NN3|...||`;
    const cadenaLines = doc.splitTextToSize(cadenaText, rightX - ML);
    doc.text(cadenaLines, ML, y);
    y += cadenaLines.length * 2.5 + 3;

    // Sello digital del CFDI
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF.dark);
    doc.text('Sello Digital del CFDI:', ML, y);
    y += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.muted);
    doc.setFontSize(5.5);
    // Placeholder — this would come from the actual XML data
    const selloText = 'Sello disponible en el archivo XML del CFDI';
    doc.text(selloText, ML, y);
    y += 5;

    // Sello del SAT
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF.dark);
    doc.text('Sello del SAT:', ML, y);
    y += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.muted);
    doc.setFontSize(5.5);
    doc.text('Sello disponible en el archivo XML del CFDI', ML, y);
    y += 6;

    // Legal notice
    doc.setFontSize(6);
    doc.setTextColor(...PDF.muted);
    doc.setFont('helvetica', 'italic');
    doc.text('Este documento es una representación impresa de un CFDI.', ML, y);
  }

  // ═══════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════
  drawFooter(doc, `${empresa.nombre} — Factura generada por Rutapp`);

  return doc.output('blob');
}
