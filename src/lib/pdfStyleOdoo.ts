/**
 * Shared PDF utilities — Matching the HTML invoice design EXACTLY
 * Colors, spacing, and typography replicate the HTML template
 * Font sizes calibrated for professional A4/Letter output
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const ML = 14;
export const MR = 14;

// ── Colors matching the HTML design EXACTLY ──
export const C = {
  text: [26, 26, 26] as [number, number, number],         // #1a1a1a
  label: [85, 85, 85] as [number, number, number],         // #555
  muted: [102, 102, 102] as [number, number, number],      // #666
  sublabel: [136, 136, 136] as [number, number, number],   // #888
  light: [170, 170, 170] as [number, number, number],      // #aaa
  green: [46, 125, 50] as [number, number, number],        // #2e7d32
  greenBg: [232, 245, 233] as [number, number, number],    // #e8f5e9
  red: [192, 57, 43] as [number, number, number],          // #c0392b
  border: [224, 224, 224] as [number, number, number],      // #e0e0e0
  borderLight: [238, 238, 238] as [number, number, number], // #eee
  headBg: [247, 247, 247] as [number, number, number],     // #f7f7f7
  noteBg: [250, 250, 250] as [number, number, number],     // #fafafa
  noteBorder: [232, 232, 232] as [number, number, number], // #e8e8e8
  white: [255, 255, 255] as [number, number, number],
  success: [40, 167, 69] as [number, number, number],
  danger: [220, 53, 69] as [number, number, number],
};

export interface EmpresaInfo {
  nombre: string;
  razon_social?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  regimen_fiscal?: string | null;
}

export function createDoc(): jsPDF {
  return new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: false,
    putOnlyUsedFonts: true,
  });
}

export const fmtCurrency = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d: string) => {
  try {
    const dt = new Date(d + 'T12:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
};

// ══════════════════════════════════════════════════════════
// HEADER — Logo + Emisor left | DocType + Folio + Status right
// ══════════════════════════════════════════════════════════
export function drawDocHeader(
  doc: jsPDF,
  empresa: EmpresaInfo,
  docType: string,
  folio: string,
  logoBase64?: string | null,
  statusLabel?: string,
  statusColor?: 'green' | 'red' | 'neutral',
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  let y = 20;
  let emisorX = ML;
  const logoSize = 18;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, y - 6, logoSize, logoSize);
      emisorX = ML + logoSize + 5;
    } catch { /* ignore */ }
  }

  // Company name — .emisor-nombre: 12px, 600 → PDF 13pt
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  const companyName = empresa.razon_social || empresa.nombre;
  const maxNameW = (pageW * 0.52) - emisorX;
  const nameLines = doc.splitTextToSize(companyName, maxNameW);
  doc.text(nameLines[0], emisorX, y);
  y += 5;
  if (nameLines.length > 1) {
    doc.text(nameLines[1], emisorX, y);
    y += 5;
  }

  // RFC — .emisor-dato: #666, 10.5px → PDF 9.5pt
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  if (empresa.rfc) {
    doc.text(`RFC: ${empresa.rfc}`, emisorX, y);
    y += 4.5;
  }

  // Address
  const addrParts = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado].filter(Boolean);
  if (addrParts.length > 0) {
    const addrLine = addrParts.join(', ');
    const addrLines = doc.splitTextToSize(addrLine, maxNameW);
    doc.text(addrLines[0], emisorX, y);
    y += 4.5;
    if (addrLines.length > 1) {
      doc.text(addrLines[1], emisorX, y);
      y += 4.5;
    }
  }

  // Tel + email
  const metaItems: string[] = [];
  if (empresa.telefono) metaItems.push(`Tel: ${empresa.telefono}`);
  if (empresa.email) metaItems.push(empresa.email);
  if (metaItems.length > 0) {
    doc.text(metaItems.join(' · '), emisorX, y);
    y += 4.5;
  }

  // ── Right side ──
  // Doc type — .doc-tipo: 22px, 700 → PDF 22pt
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(docType, rightX, 20, { align: 'right' });

  // Folio — .doc-folio: 13px, #555, 600 → PDF 12pt
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.label);
  doc.text(`Folio: ${folio}`, rightX, 27, { align: 'right' });

  // Status chip
  if (statusLabel) {
    const chipY = 33;
    const chipFontSize = 8;
    doc.setFontSize(chipFontSize);
    doc.setFont('helvetica', 'bold');
    const chipW = doc.getTextWidth(statusLabel) + 10;
    const chipX = rightX - chipW;

    if (statusColor === 'green') {
      doc.setFillColor(...C.greenBg);
      doc.setDrawColor(200, 230, 201);
    } else if (statusColor === 'red') {
      doc.setFillColor(255, 235, 238);
      doc.setDrawColor(239, 154, 154);
    } else {
      doc.setFillColor(...C.headBg);
      doc.setDrawColor(...C.border);
    }
    doc.setLineWidth(0.3);
    doc.roundedRect(chipX, chipY - 3.5, chipW, 6.5, 3, 3, 'FD');

    if (statusColor === 'green') doc.setTextColor(...C.green);
    else if (statusColor === 'red') doc.setTextColor(...C.red);
    else doc.setTextColor(...C.label);
    doc.text(statusLabel, chipX + 5, chipY + 0.8);
  }

  return Math.max(y + 6, logoBase64 ? 44 : 40);
}

// ══════════════════════════════════════════════════════════
// INFO GRID — Two columns with top/bottom borders
// ══════════════════════════════════════════════════════════
export function drawInfoGrid(
  doc: jsPDF,
  y: number,
  leftTitle: string,
  leftRows: [string, string][],
  rightTitle: string,
  rightRows: [string, string][],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const midX = pageW / 2;
  const colL = ML;
  const colR = midX + 6;

  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 7;

  const gridTopY = y - 4;

  // Section titles — .info-label-sec: 10px, 700, #888, uppercase → PDF 8.5pt
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.sublabel);
  doc.text(leftTitle.toUpperCase(), colL, y);
  doc.text(rightTitle.toUpperCase(), colR, y);
  y += 6;

  // Left rows
  let ly = y;
  for (const [lbl, val] of leftRows) {
    if (lbl === '_name') {
      // Special: client name — .cliente-nombre: 600, 11.5px → PDF 11pt
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.text);
      doc.text(val, colL, ly);
      ly += 5;
    } else {
      // .cliente-dato: #555, 10.5px → PDF 9.5pt
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.label);
      doc.text(`${lbl} ${val}`, colL, ly);
      ly += 4.5;
    }
  }

  // Right rows — table style: .lbl #666, .val 600 #1a1a1a → PDF 9.5pt
  let ry = y;
  for (const [lbl, val] of rightRows) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(lbl, colR, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(val, colR + 42, ry);
    ry += 5;
  }

  y = Math.max(ly, ry) + 3;

  // Vertical divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(midX, gridTopY, midX, y - 3);

  // Bottom border
  doc.line(ML, y, rightX, y);
  return y + 8;
}

// ══════════════════════════════════════════════════════════
// TABLE — Clean table matching HTML exactly
// ══════════════════════════════════════════════════════════
export function drawCleanTable(
  doc: jsPDF,
  y: number,
  head: string[],
  body: any[][],
  columnStyles?: Record<number, any>,
  didParseCell?: (data: any) => void,
): number {
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    theme: 'plain',
    head: [head],
    body,
    styles: {
      fillColor: C.white,
      textColor: C.text,
      fontSize: 9.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      lineWidth: 0,
      font: 'helvetica',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: C.headBg,
      textColor: C.text,
      fontSize: 9,
      fontStyle: 'bold',
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      overflow: 'visible',
      minCellHeight: 0,
    },
    bodyStyles: { fillColor: C.white },
    alternateRowStyles: { fillColor: C.white },
    columnStyles: columnStyles || {},
    didParseCell: (data: any) => {
      // Sync header alignment with columnStyles so headers align with body values
      if (data.section === 'head' && columnStyles && columnStyles[data.column.index]?.halign) {
        data.cell.styles.halign = columnStyles[data.column.index].halign;
      }
      if (didParseCell) didParseCell(data);
    },
    didDrawCell: (data: any) => {
      if (data.section === 'head') {
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.6);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      if (data.section === 'body' && data.row.index < body.length - 1) {
        doc.setDrawColor(...C.borderLight);
        doc.setLineWidth(0.2);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
    
  });

  return (doc as any).lastAutoTable.finalY + 6;
}

// ══════════════════════════════════════════════════════════
// TOTALS BLOCK — Right-aligned with optional red discount
// ══════════════════════════════════════════════════════════
export function drawTotalsBlock(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string; bold?: boolean; red?: boolean; separator?: boolean }[],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const totLabelX = rightX - 56;

  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y - 2, rightX, y - 2);
  y += 3;

  for (const row of rows) {
    if (row.separator) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.line(totLabelX - 10, y, rightX, y);
      y += 4;
    }

    if (row.bold) {
      // Total row — border-top: 2px solid #1a1a1a
      doc.setDrawColor(...C.text);
      doc.setLineWidth(0.6);
      doc.line(totLabelX - 10, y - 1, rightX, y - 1);
      y += 4;

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.text);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 8;
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (row.red) {
        doc.setTextColor(...C.red);
      } else {
        doc.setTextColor(...C.muted);
      }
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      if (row.red) {
        doc.setTextColor(...C.red);
      } else {
        doc.setTextColor(...C.text);
      }
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 5.5;
    }
  }
  return y;
}

// ══════════════════════════════════════════════════════════
// IMPORTE CON LETRA
// ══════════════════════════════════════════════════════════
export function drawImporteConLetra(doc: jsPDF, y: number, text: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const midX = pageW / 2;

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(68, 68, 68); // #444
  doc.text(text.toUpperCase(), midX, y, { align: 'center' });
  y += 5;

  doc.line(ML, y, rightX, y);
  return y + 7;
}

// ══════════════════════════════════════════════════════════
// NOTES — Rounded box with gray background
// ══════════════════════════════════════════════════════════
export function drawNotes(doc: jsPDF, y: number, notes: string, title = 'NOTAS'): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const contentW = rightX - ML;
  y = checkPageBreak(doc, y, 25);

  // Calculate text height
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  const textLines = doc.splitTextToSize(notes, contentW - 12);
  const boxH = 8 + textLines.length * 4 + 5;

  // Box background
  doc.setFillColor(...C.noteBg);
  doc.setDrawColor(...C.noteBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, contentW, boxH, 2, 2, 'FD');

  // Title — .notas-lbl → PDF 8.5pt
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.sublabel);
  doc.text(title.toUpperCase(), ML + 6, y + 6);

  // Text — .notas-txt → PDF 9.5pt
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.label);
  doc.text(textLines, ML + 6, y + 11);

  return y + boxH + 6;
}

// ══════════════════════════════════════════════════════════
// SIGNATURES — Two columns with lines
// ══════════════════════════════════════════════════════════
export function drawSignatures(
  doc: jsPDF,
  y: number,
  left: { title: string; name?: string },
  right: { title: string; name?: string },
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  y = checkPageBreak(doc, y, 40);

  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 16;

  const sigW = (pageW - ML - MR - 28) / 2;

  // Left signature line
  doc.setDrawColor(...C.label);
  doc.setLineWidth(0.3);
  doc.line(ML + 8, y, ML + 8 + sigW, y);

  // Right signature line
  doc.line(pageW - MR - 8 - sigW, y, pageW - MR - 8, y);

  // Left labels → PDF 9pt
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'normal');
  doc.text(left.title, ML + 8 + sigW / 2, y + 5, { align: 'center' });
  if (left.name) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(left.name, ML + 8 + sigW / 2, y + 10, { align: 'center' });
  }

  // Right labels → PDF 9pt
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'normal');
  doc.text(right.title, pageW - MR - 8 - sigW / 2, y + 5, { align: 'center' });
  if (right.name) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(right.name, pageW - MR - 8 - sigW / 2, y + 10, { align: 'center' });
  }

  return y + 16;
}

// ══════════════════════════════════════════════════════════
// PAGE BREAK CHECK
// ══════════════════════════════════════════════════════════
export function checkPageBreak(doc: jsPDF, y: number, needed = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 16;
  }
  return y;
}

// ══════════════════════════════════════════════════════════
// FOOTER — Company info + page numbers
// ══════════════════════════════════════════════════════════
export function drawFooter(doc: jsPDF, empresa?: EmpresaInfo) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const midX = pageW / 2;
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Separator line
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 16, pageW - MR, pageH - 16);

    // Company info centered — .pie: 9px, #aaa → PDF 8pt
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.light);

    if (empresa) {
      const parts = [
        empresa.razon_social || empresa.nombre,
        empresa.rfc ? `RFC: ${empresa.rfc}` : '',
        [empresa.direccion, empresa.ciudad, empresa.estado].filter(Boolean).join(', '),
      ].filter(Boolean);
      doc.text(parts.join(' · '), midX, pageH - 11, { align: 'center' });
    } else {
      doc.text('Generado por Uniline — uniline.app', midX, pageH - 11, { align: 'center' });
    }

    // Page number → PDF 8pt
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 6, { align: 'right' });
  }
}

// ══════════════════════════════════════════════════════════
// NUMBER TO WORDS (Spanish)
// ══════════════════════════════════════════════════════════
export function numberToWords(n: number): string {
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

// ══════════════════════════════════════════════════════════
// LOAD LOGO
// ══════════════════════════════════════════════════════════
export async function loadLogoBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
