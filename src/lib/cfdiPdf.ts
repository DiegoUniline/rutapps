/**
 * Custom CFDI PDF generator — Exact replica of Facturama layout with logo support
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import {
  PDF, ML, MR, fmtCurrency,
  drawFooter, checkPageBreak,
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

// Number to spanish words
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
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} - ${hours}:${mins}:${secs}`;
  } catch {
    return dateStr;
  }
}

export async function generarCfdiPdf(params: CfdiPdfParams): Promise<Blob> {
  const { empresa, logoBase64, cfdi, receiver, lineas, formasPagoLabel, metodoPagoLabel, usoCfdiLabel, regimenEmisorLabel, regimenReceptorLabel } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const midX = pageW / 2;

  const folioDisplay = `FOLIO: ${cfdi.serie || 'A'}  ${cfdi.folio || '—'}`;

  // Colors
  const black: [number, number, number] = [33, 37, 41];
  const gray: [number, number, number] = [100, 100, 100];
  const lightGray: [number, number, number] = [180, 180, 180];
  const borderColor: [number, number, number] = [200, 200, 200];

  let y = 14;

  // ═══════════════════════════════════════════
  // TOP ROW: FACTURA (left) | FOLIO (right)
  // ═══════════════════════════════════════════
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...black);

  let logoEndX = ML;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 8, 18, 18);
      logoEndX = ML + 22;
    } catch { /* ignore */ }
  }

  doc.text('FACTURA', logoEndX, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(folioDisplay, rightX, y, { align: 'right' });

  y += 6;

  // ═══════════════════════════════════════════
  // EMISOR (left-center) | RECEPTOR (right)
  // ═══════════════════════════════════════════
  const emisorX = logoEndX;
  const receptorX = midX + 15;

  // Emisor header
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Emisor:', emisorX, y);

  // Receptor header
  doc.text('Receptor:', receptorX, y);
  y += 4;

  // Emisor name + RFC
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...black);
  doc.text((empresa.razon_social || empresa.nombre).toUpperCase(), emisorX, y);
  // Receptor name
  doc.text(receiver.name.toUpperCase(), receptorX, y);
  y += 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(empresa.rfc || '', emisorX, y);
  doc.text(receiver.rfc || '', receptorX, y);
  y += 6;

  // Emisor details
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Lugar de Expedición: ', emisorX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(cfdi.expedition_place || empresa.cp || '', emisorX + 33, y);

  // Receptor CP
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Código postal: ', receptorX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(receiver.tax_zip_code || '', receptorX + 24, y);
  y += 4;

  // Regimen fiscal emisor
  const regimenEmisorText = regimenEmisorLabel || `${empresa.regimen_fiscal || ''}`;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Régimen Fiscal: ', emisorX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  const regimenEmisorVal = `${empresa.regimen_fiscal || ''} - ${regimenEmisorText}`;
  doc.text(regimenEmisorVal, emisorX + 25, y);

  // Uso CFDI receptor
  const usoCfdiText = usoCfdiLabel || receiver.cfdi_use || '';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Uso del CFDI: ', receptorX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(`${receiver.cfdi_use || ''} - ${usoCfdiText}`, receptorX + 22, y);
  y += 4;

  // Efecto del comprobante
  const cfdiTypeLabel = cfdi.cfdi_type === 'I' ? 'I - Ingreso' : cfdi.cfdi_type === 'E' ? 'E - Egreso' : cfdi.cfdi_type || '';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Efecto del comprobante: ', emisorX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(cfdiTypeLabel, emisorX + 37, y);

  // Regimen fiscal receptor
  const regimenRecText = regimenReceptorLabel || receiver.fiscal_regime || '';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Regimen Fiscal: ', receptorX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(`${receiver.fiscal_regime || ''} - ${regimenRecText}`, receptorX + 25, y);

  y = Math.max(y, 28) + 2;
  // Ensure y is below logo
  if (logoBase64) y = Math.max(y, 32);
  y += 6;

  // ═══════════════════════════════════════════
  // SECOND INFO ROW: Folio Fiscal | Fecha | No. Certificado
  // ═══════════════════════════════════════════
  // Thin separator
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 5;

  const col1 = ML;
  const col2 = ML + 70;
  const col3 = ML + 130;

  // Folio Fiscal
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Folio Fiscal:', col1, y);
  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.setFontSize(6.5);
  doc.text(cfdi.folio_fiscal || '—', col1, y);

  // Fecha / Hora de Emisión
  const dateStr = formatCfdiDate(cfdi.fecha_timbrado || cfdi.created_at);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Fecha / Hora de Emisión:', col2, y - 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(dateStr, col2, y);

  // No. de Certificado Digital
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('No. de Certificado Digital:', col3, y - 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.setFontSize(6.5);
  doc.text(cfdi.no_certificado_emisor || cfdi.folio_fiscal || '—', col3, y);
  y += 5;

  // Exportación
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Exportación:', col1, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text('01 - No aplica', col1 + 20, y);
  y += 5;

  // Separator
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 2;

  // ═══════════════════════════════════════════
  // CONCEPTOS TABLE — matching Facturama layout
  // Each row shows product, then tax detail below
  // ═══════════════════════════════════════════
  const tableHead = [['Clave', 'Descripción', 'Cant.', 'Unidad', 'P. Unit.', 'Obj. Imp.', 'Impuesto', 'Importe']];
  const tableBody: any[][] = [];

  for (const l of lineas) {
    // Build tax string concisely
    let impuestoStr = '';
    if (l.iva_pct > 0) impuestoStr += `IVA ${l.iva_pct}%`;
    if (l.ieps_pct > 0) impuestoStr += (impuestoStr ? '\n' : '') + `IEPS ${l.ieps_pct}%`;
    if (!impuestoStr) impuestoStr = '—';

    tableBody.push([
      { content: l.product_code, styles: { halign: 'center', fontSize: 6.5 } },
      l.descripcion,
      { content: String(l.cantidad), styles: { halign: 'center' } },
      { content: `${l.unit_code}\n${l.unit_name}`, styles: { fontSize: 6.5 } },
      { content: `$${fmtCurrency(l.precio_unitario)}`, styles: { halign: 'right' } },
      { content: '02', styles: { halign: 'center', fontSize: 6.5 } },
      { content: impuestoStr, styles: { halign: 'center', fontSize: 6.5 } },
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
      fillColor: [255, 255, 255],
      textColor: [33, 37, 41],
      lineColor: [210, 210, 210],
      lineWidth: 0.2,
      fontSize: 7,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [33, 37, 41],
      fontSize: 7,
      fontStyle: 'bold',
      cellPadding: 2,
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 14 },
      3: { cellWidth: 18 },
      4: { cellWidth: 22 },
      5: { cellWidth: 14 },
      6: { cellWidth: 20 },
      7: { cellWidth: 22 },
    },
    didParseCell: (data: any) => {
      data.cell.styles.fillColor = [255, 255, 255];
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ═══════════════════════════════════════════
  // TOTALS — right aligned
  // ═══════════════════════════════════════════
  const totalsLabelX = rightX - 55;

  const drawTotal = (label: string, value: string, bold = false) => {
    doc.setFontSize(bold ? 9 : 7.5);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...(bold ? black : gray));
    doc.text(label, totalsLabelX, y, { align: 'right' });
    doc.setTextColor(...black);
    doc.text(value, rightX, y, { align: 'right' });
    y += bold ? 7 : 5;
  };

  drawTotal('Subtotal:', `$${fmtCurrency(cfdi.subtotal)}`);
  if (cfdi.ieps_total > 0) drawTotal('IEPS:', `$${fmtCurrency(cfdi.ieps_total)}`);
  drawTotal('IVA 16%:', `$${fmtCurrency(cfdi.iva_total)}`);
  if (cfdi.retenciones_total > 0) drawTotal('Retenciones:', `-$${fmtCurrency(cfdi.retenciones_total)}`);

  // Total line
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(totalsLabelX - 10, y - 2, rightX, y - 2);
  y += 1;
  drawTotal('Total:', `$${fmtCurrency(cfdi.total)}`, true);

  // ═══════════════════════════════════════════
  // AMOUNT IN WORDS + MONEDA ROW
  // ═══════════════════════════════════════════
  y += 2;
  const wordsY = y;

  // Moneda left
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...gray);
  doc.text('Moneda: MXN -', ML, wordsY);
  doc.text('Peso Mexicano', ML, wordsY + 4);

  // Amount in words center
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  const words = numberToWords(cfdi.total);
  const wordsWidth = doc.getTextWidth(words);
  doc.text(words, midX - wordsWidth / 2 + 10, wordsY + 2);

  y = wordsY + 10;

  // ═══════════════════════════════════════════
  // FORMA/MÉTODO DE PAGO ROW
  // ═══════════════════════════════════════════
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.2);
  doc.line(ML, y, rightX, y);
  y += 5;

  // Forma de Pago (left)
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Forma de Pago:', ML, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(formasPagoLabel || cfdi.payment_form || '—', ML, y + 4);

  // Método de Pago (right of center)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gray);
  doc.text('Método de Pago:', midX - 10, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...black);
  doc.text(metodoPagoLabel || cfdi.payment_method || '—', midX - 10, y + 4);

  y += 12;

  // ═══════════════════════════════════════════
  // QR + CADENA + SELLOS
  // ═══════════════════════════════════════════
  if (cfdi.folio_fiscal) {
    y = checkPageBreak(doc, y, 80);

    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.3);
    doc.line(ML, y, rightX, y);
    y += 4;

    // QR on left
    const qrSize = 30;
    const qrUrl = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${cfdi.folio_fiscal}&re=${empresa.rfc || ''}&rr=${receiver.rfc || ''}&tt=${cfdi.total.toFixed(6)}`;
    const qrDataUrl = await generateQrDataUrl(qrUrl);

    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', ML, y, qrSize, qrSize);
      } catch { /* ignore */ }
    }

    const infoX = ML + qrSize + 6;
    const maxTextW = rightX - infoX;

    // Cadena Original
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gray);
    doc.text('Cadena Original del complemento de Certificación Digital del SAT', infoX, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...black);
    doc.setFontSize(5);
    const cadenaText = cfdi.cadena_original || `||1.1|${cfdi.folio_fiscal}|...||`;
    const cadenaLines = doc.splitTextToSize(cadenaText, maxTextW);
    doc.text(cadenaLines, infoX, y + 6);
    let infoY = y + 6 + cadenaLines.length * 2.2 + 2;

    // Sello Digital del CFDI
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gray);
    doc.text('Sello Digital del CFDI', infoX, infoY);
    infoY += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...black);
    doc.setFontSize(5);
    const selloCfdiText = cfdi.sello_cfdi || 'Disponible en el archivo XML';
    const selloCfdiLines = doc.splitTextToSize(selloCfdiText, maxTextW);
    doc.text(selloCfdiLines, infoX, infoY);
    infoY += selloCfdiLines.length * 2.2 + 2;

    // Sello Digital del SAT
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gray);
    doc.text('Sello Digital del SAT', infoX, infoY);
    infoY += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...black);
    doc.setFontSize(5);
    const selloSatText = cfdi.sello_sat || 'Disponible en el archivo XML';
    const selloSatLines = doc.splitTextToSize(selloSatText, maxTextW);
    doc.text(selloSatLines, infoX, infoY);
    infoY += selloSatLines.length * 2.2 + 3;

    y = Math.max(y + qrSize + 4, infoY);

    // Bottom info row: Fecha certificación | No. Serie Cert SAT | RFC del PAC
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.2);
    doc.line(ML, y, rightX, y);
    y += 4;

    const bottomInfoX = ML;

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gray);
    doc.text('Fecha / Hora de Certificación:', bottomInfoX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...black);
    doc.text(formatCfdiDate(cfdi.fecha_timbrado || cfdi.created_at), bottomInfoX, y + 3.5);

    const certCol = bottomInfoX + 55;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gray);
    doc.text('Número de Serie Certificado del SAT:', certCol, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...black);
    doc.text(cfdi.no_certificado_sat || '—', certCol, y + 3.5);

    const pacCol = certCol + 60;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gray);
    doc.text('RFC del PAC:', pacCol, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...black);
    doc.text('SPR190613I52', pacCol, y + 3.5);

    y += 14;
  }

  // ═══════════════════════════════════════════
  // LEGAL NOTICE + FOOTER
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 20);
  doc.setFontSize(7);
  doc.setTextColor(...lightGray);
  doc.setFont('helvetica', 'normal');
  const legalText = 'Este documento es una representación impresa de un CFDI.';
  const legalW = doc.getTextWidth(legalText);
  doc.text(legalText, midX - legalW / 2, y);

  drawFooter(doc, `${empresa.nombre} — Factura generada por Rutapp`);

  return doc.output('blob');
}
