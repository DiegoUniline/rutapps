/**
 * Custom CFDI PDF generator — Professional layout with company logo
 * Matches Facturama structure but with branded Odoo-style design
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  // Labels from catalogs
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

export function generarCfdiPdf(params: CfdiPdfParams): Blob {
  const { empresa, logoBase64, cfdi, receiver, lineas, formasPagoLabel, metodoPagoLabel, usoCfdiLabel, regimenEmisorLabel, regimenReceptorLabel } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();

  const folioDisplay = `${cfdi.serie || 'A'}-${cfdi.folio || '—'}`;
  let y = 14;
  let leftStartX = ML;

  // ═══════════════════════════════════════════
  // HEADER — Logo + Emisor left, Folio right
  // ═══════════════════════════════════════════
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 8, 22, 22);
      leftStartX = ML + 26;
    } catch { /* ignore */ }
  }

  // Company name
  doc.setTextColor(...PDF.black);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre.toUpperCase(), leftStartX, y);

  // Company fiscal details
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.muted);
  y += 5;
  if (empresa.razon_social && empresa.razon_social !== empresa.nombre) {
    doc.text(empresa.razon_social, leftStartX, y); y += 3.5;
  }
  if (empresa.rfc) { doc.text(`RFC: ${empresa.rfc}`, leftStartX, y); y += 3.5; }
  if (empresa.regimen_fiscal) {
    doc.text(`Régimen: ${regimenEmisorLabel || empresa.regimen_fiscal}`, leftStartX, y); y += 3.5;
  }
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado].filter(Boolean).join(', ');
  if (addr) { doc.text(addr, leftStartX, y); y += 3.5; }
  if (empresa.cp) { doc.text(`C.P. ${empresa.cp}`, leftStartX, y); y += 3.5; }
  if (empresa.telefono) { doc.text(`Tel: ${empresa.telefono}`, leftStartX, y); y += 3.5; }

  // Right side — FACTURA badge + folio
  const rightX = pageW - MR;

  // Colored badge for "FACTURA"
  const badgeW = 38;
  const badgeH = 8;
  const badgeX = rightX - badgeW;
  doc.setFillColor(67, 56, 202); // indigo-600
  doc.roundedRect(badgeX, 10, badgeW, badgeH, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURA', badgeX + badgeW / 2, 16, { align: 'center' });

  // Folio
  doc.setTextColor(...PDF.black);
  doc.setFontSize(11);
  doc.text(folioDisplay, rightX, 24, { align: 'right' });

  // Date
  doc.setFontSize(7);
  doc.setTextColor(...PDF.muted);
  doc.setFont('helvetica', 'normal');
  const dateStr = (() => {
    try {
      return new Date(cfdi.created_at).toLocaleString('es-MX', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return cfdi.created_at; }
  })();
  doc.text(dateStr, rightX, 28, { align: 'right' });

  // UUID
  if (cfdi.folio_fiscal) {
    doc.setFontSize(6);
    doc.setTextColor(...PDF.muted);
    doc.text(`UUID: ${cfdi.folio_fiscal}`, rightX, 32, { align: 'right' });
  }

  // Separator line
  y = Math.max(y, 36) + 2;
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.4);
  doc.line(ML, y, rightX, y);
  y += 6;

  // ═══════════════════════════════════════════
  // RECEPTOR + FISCAL DATA — two columns
  // ═══════════════════════════════════════════
  const colW = (pageW - ML - MR - 8) / 2;
  const col1X = ML;
  const col2X = ML + colW + 8;

  // Left column — Receptor
  const drawLabel = (x: number, ly: number, label: string, value: string) => {
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.muted);
    doc.text(label, x, ly);
    doc.setTextColor(...PDF.black);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(value, x, ly + 3.5);
  };

  // Receptor box
  doc.setFillColor(...PDF.bgAlt);
  doc.roundedRect(col1X, y - 2, colW, 30, 1.5, 1.5, 'F');

  doc.setTextColor(...PDF.dark);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Receptor', col1X + 3, y + 2);

  let ry = y + 6;
  drawLabel(col1X + 3, ry, 'Razón Social', receiver.name);
  ry += 8;
  drawLabel(col1X + 3, ry, 'RFC', receiver.rfc);

  // CP and Régimen on same row
  const halfCol = (colW - 6) / 2;
  drawLabel(col1X + 3 + halfCol + 2, ry, 'C.P. Fiscal', receiver.tax_zip_code || '—');
  ry += 8;
  drawLabel(col1X + 3, ry, 'Régimen Fiscal', regimenReceptorLabel || receiver.fiscal_regime || '—');

  // Right column — Datos fiscales del comprobante
  doc.setFillColor(...PDF.bgAlt);
  doc.roundedRect(col2X, y - 2, colW, 30, 1.5, 1.5, 'F');

  doc.setTextColor(...PDF.dark);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Datos del Comprobante', col2X + 3, y + 2);

  ry = y + 6;
  drawLabel(col2X + 3, ry, 'Uso CFDI', usoCfdiLabel || receiver.cfdi_use || '—');
  ry += 8;
  drawLabel(col2X + 3, ry, 'Forma de Pago', formasPagoLabel || cfdi.payment_form || '—');
  ry += 8;
  drawLabel(col2X + 3, ry, 'Método de Pago', metodoPagoLabel || cfdi.payment_method || '—');

  y += 34;

  // ═══════════════════════════════════════════
  // CONCEPTOS TABLE
  // ═══════════════════════════════════════════
  doc.setTextColor(...PDF.dark);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Conceptos', ML, y);
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.2);
  doc.line(ML, y + 2, rightX, y + 2);
  y += 5;

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
      fillColor: [67, 56, 202] as [number, number, number], // indigo header
      textColor: [255, 255, 255] as [number, number, number],
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
  // TOTALS — right aligned with tax breakdown
  // ═══════════════════════════════════════════
  const totalsX = rightX - 65;

  const drawTotalRow = (label: string, value: string, bold = false, color?: [number, number, number]) => {
    doc.setFontSize(bold ? 9 : 7.5);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...(color || (bold ? PDF.black : PDF.muted)));
    doc.text(label, totalsX, y);
    doc.setTextColor(...(color || PDF.black));
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(value, rightX, y, { align: 'right' });
    y += bold ? 6 : 5;
  };

  drawTotalRow('Subtotal:', `$${fmtCurrency(cfdi.subtotal)}`);
  if (cfdi.ieps_total > 0) drawTotalRow('IEPS:', `$${fmtCurrency(cfdi.ieps_total)}`);
  drawTotalRow('IVA 16%:', `$${fmtCurrency(cfdi.iva_total)}`);
  if (cfdi.retenciones_total > 0) drawTotalRow('Retenciones:', `-$${fmtCurrency(cfdi.retenciones_total)}`);

  // Total line
  doc.setDrawColor(67, 56, 202);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 1, rightX, y - 1);
  y += 2;
  drawTotalRow('Total:', `$${fmtCurrency(cfdi.total)}`, true);

  // Amount in words
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...PDF.muted);
  const words = numberToWords(cfdi.total);
  doc.text(words, ML, y);
  y += 3.5;
  doc.setTextColor(...PDF.dark);
  doc.setFont('helvetica', 'normal');
  doc.text(`Moneda: ${cfdi.currency || 'MXN'} — Peso Mexicano`, ML, y);
  y += 8;

  // ═══════════════════════════════════════════
  // TAX DETAIL — Per-line breakdown
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 30);
  doc.setTextColor(...PDF.dark);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Desglose de Impuestos', ML, y);
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.2);
  doc.line(ML, y + 2, rightX, y + 2);
  y += 5;

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Impuesto', 'Tipo', 'Base', 'Tasa', 'Importe']],
    body: lineas.flatMap(l => {
      const rows: string[][] = [];
      if (l.iva_pct > 0) {
        rows.push(['IVA', 'Traslado', `$${fmtCurrency(l.subtotal)}`, `${(l.iva_pct / 100).toFixed(6)}`, `$${fmtCurrency(l.iva_monto)}`]);
      }
      if (l.ieps_pct > 0) {
        rows.push(['IEPS', 'Traslado', `$${fmtCurrency(l.subtotal)}`, `${(l.ieps_pct / 100).toFixed(6)}`, `$${fmtCurrency(l.ieps_monto)}`]);
      }
      return rows;
    }),
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

  // ═══════════════════════════════════════════
  // DIGITAL STAMPS (UUID, cadena, sellos)
  // ═══════════════════════════════════════════
  if (cfdi.folio_fiscal) {
    y = checkPageBreak(doc, y, 35);

    doc.setFillColor(...PDF.bgAlt);
    doc.roundedRect(ML, y - 2, pageW - ML - MR, 28, 1.5, 1.5, 'F');

    doc.setTextColor(...PDF.dark);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Folio Fiscal (UUID):', ML + 3, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF.black);
    doc.setFontSize(7.5);
    doc.text(cfdi.folio_fiscal, ML + 35, y + 2);

    doc.setTextColor(...PDF.muted);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    y += 7;
    doc.text('Lugar de Expedición: ' + (cfdi.expedition_place || '—'), ML + 3, y);
    y += 3.5;
    doc.text('Efecto del comprobante: ' + (cfdi.cfdi_type === 'I' ? 'I - Ingreso' : cfdi.cfdi_type || '—'), ML + 3, y);
    y += 3.5;
    doc.text('Exportación: 01 - No aplica', ML + 3, y);
    y += 3.5;
    doc.text('Este documento es una representación impresa de un CFDI.', ML + 3, y);

    y += 8;
  }

  // ═══════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════
  drawFooter(doc, `${empresa.nombre} — Factura generada por Rutapp`);

  return doc.output('blob');
}
