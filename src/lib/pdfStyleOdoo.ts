/**
 * Shared Odoo-style PDF utilities — Clean, minimal, professional
 * All documents use these helpers for consistent design
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const ML = 14;
export const MR = 14;

// ── Colors matching the HTML design exactly ──
export const C = {
  text: [26, 26, 26] as [number, number, number],
  label: [85, 85, 85] as [number, number, number],
  muted: [102, 102, 102] as [number, number, number],
  sublabel: [136, 136, 136] as [number, number, number],
  light: [170, 170, 170] as [number, number, number],
  border: [224, 224, 224] as [number, number, number],
  borderLight: [238, 238, 238] as [number, number, number],
  headBg: [247, 247, 247] as [number, number, number],
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
}

// ── Create a high-quality doc (compress false for sharper text) ──
export function createDoc(): jsPDF {
  return new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: false,
    putOnlyUsedFonts: true,
  });
}

// ── Format helpers ──
export const fmtCurrency = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d: string) => {
  try {
    const dt = new Date(d + 'T12:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
};

// ── Draw Header: Logo + Emisor left, DocType + Folio right ──
export function drawDocHeader(
  doc: jsPDF,
  empresa: EmpresaInfo,
  docType: string,
  folio: string,
  logoBase64?: string | null,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  let y = 16;
  let emisorX = ML;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, y - 5, 16, 16);
      emisorX = ML + 20;
    } catch { /* ignore */ }
  }

  // Emisor name
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(empresa.razon_social || empresa.nombre, emisorX, y);
  y += 4;

  // RFC
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  if (empresa.rfc) { doc.text(`RFC: ${empresa.rfc}`, emisorX, y); y += 3.5; }

  // Address
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado].filter(Boolean).join(', ');
  if (addr) { doc.text(addr, emisorX, y); y += 3.5; }
  if (empresa.cp) { doc.text(`C.P. ${empresa.cp}`, emisorX, y); y += 3.5; }

  // Doc type + folio on right
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(docType, rightX, 16, { align: 'right' });

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.label);
  doc.text(`Folio: ${folio}`, rightX, 22, { align: 'right' });

  return Math.max(y + 4, logoBase64 ? 34 : 30);
}

// ── Draw two-column info grid with borders ──
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
  const colR = midX + 4;

  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, rightX, y);
  y += 6;

  const gridTopY = y - 3;

  // Left title
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.sublabel);
  doc.text(leftTitle.toUpperCase(), colL, y);

  // Right title
  doc.text(rightTitle.toUpperCase(), colR, y);
  y += 5;

  // Left rows
  let ly = y;
  for (const [lbl, val] of leftRows) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(lbl, colL, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    const lblW = Math.max(doc.getTextWidth(lbl) + 2, 30);
    doc.text(val, colL + lblW, ly);
    ly += 4.5;
  }

  // Right rows
  let ry = y;
  for (const [lbl, val] of rightRows) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(lbl, colR, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(val, colR + 38, ry);
    ry += 4.5;
  }

  y = Math.max(ly, ry) + 2;

  // Vertical divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(midX, gridTopY, midX, y - 2);

  // Bottom border
  doc.line(ML, y, rightX, y);
  return y + 6;
}

// ── Draw a clean table matching the HTML style ──
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
      fontSize: 7.5,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      lineWidth: 0,
    },
    headStyles: {
      fillColor: C.headBg,
      textColor: C.text,
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    bodyStyles: { fillColor: C.white },
    alternateRowStyles: { fillColor: C.white },
    columnStyles: columnStyles || {},
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
    didParseCell,
  });

  return (doc as any).lastAutoTable.finalY + 6;
}

// ── Draw totals block (right-aligned, with bold total line) ──
export function drawTotalsBlock(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string; bold?: boolean }[],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const totLabelX = rightX - 50;

  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y - 2, rightX, y - 2);
  y += 2;

  for (const row of rows) {
    if (row.bold) {
      // Heavy line before total
      doc.setDrawColor(...C.text);
      doc.setLineWidth(0.6);
      doc.line(totLabelX - 15, y - 1, rightX, y - 1);
      y += 3;

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.muted);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.setTextColor(...C.text);
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 7;
    } else {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.muted);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.setTextColor(...C.text);
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 5;
    }
  }
  return y;
}

// ── Notes section ──
export function drawNotes(doc: jsPDF, y: number, notes: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  y = checkPageBreak(doc, y, 20);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.sublabel);
  doc.text('NOTAS', ML, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  const split = doc.splitTextToSize(notes, pageW - ML - MR);
  doc.text(split, ML, y);
  return y + split.length * 3.2 + 4;
}

// ── Signature lines ──
export function drawSignatures(doc: jsPDF, y: number, left: string, right: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  y = checkPageBreak(doc, y, 30);
  const sigW = (pageW - ML - MR - 20) / 2;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, ML + sigW, y);
  doc.line(pageW - MR - sigW, y, pageW - MR, y);

  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'normal');
  doc.text(left, ML + sigW / 2, y + 5, { align: 'center' });
  doc.text(right, pageW - MR - sigW / 2, y + 5, { align: 'center' });
  return y + 12;
}

// ── Page break check ──
export function checkPageBreak(doc: jsPDF, y: number, needed = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 14;
  }
  return y;
}

// ── Footer on all pages ──
export function drawFooter(doc: jsPDF, footerText = 'Generado por Uniline — uniline.app') {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 12, pageW - MR, pageH - 12);
    doc.setTextColor(...C.light);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(footerText, ML, pageH - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 8, { align: 'right' });
  }
}

// ── Load logo from URL as base64 ──
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
