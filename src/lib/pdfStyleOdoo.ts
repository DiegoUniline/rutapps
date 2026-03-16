/**
 * Shared PDF utilities — Professional, clean layout
 * Matching the HTML invoice design: big logo, bold text, generous spacing
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const ML = 16;
export const MR = 16;

// ── All text is solid black ──
export const C = {
  text: [26, 26, 26] as [number, number, number],
  label: [26, 26, 26] as [number, number, number],
  muted: [26, 26, 26] as [number, number, number],
  sublabel: [26, 26, 26] as [number, number, number],
  light: [26, 26, 26] as [number, number, number],
  border: [210, 210, 210] as [number, number, number],
  borderLight: [230, 230, 230] as [number, number, number],
  headBg: [245, 245, 245] as [number, number, number],
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

// ── Create a high-quality doc ──
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

// ── Draw Header: Logo + Full Emisor left, DocType + Folio right ──
export function drawDocHeader(
  doc: jsPDF,
  empresa: EmpresaInfo,
  docType: string,
  folio: string,
  logoBase64?: string | null,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  let y = 18;
  let emisorX = ML;
  const logoSize = 18;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, y - 6, logoSize, logoSize);
      emisorX = ML + logoSize + 5;
    } catch { /* ignore */ }
  }

  // Company name — big and bold
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  const companyName = empresa.razon_social || empresa.nombre;
  // Truncate if too long for available width
  const maxNameW = (pageW / 2) - emisorX;
  const nameLines = doc.splitTextToSize(companyName, maxNameW);
  doc.text(nameLines[0], emisorX, y);
  y += nameLines.length > 1 ? 5 : 5;
  if (nameLines.length > 1) {
    doc.text(nameLines[1], emisorX, y);
    y += 5;
  }

  // RFC
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  if (empresa.rfc) {
    doc.text(`RFC: ${empresa.rfc}`, emisorX, y);
    y += 4.5;
  }

  // Address line
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);
  const addrParts = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado].filter(Boolean);
  if (addrParts.length > 0) {
    const addrLine = addrParts.join(', ');
    const addrLines = doc.splitTextToSize(addrLine, maxNameW);
    doc.text(addrLines[0], emisorX, y);
    y += 4;
    if (addrLines.length > 1) {
      doc.text(addrLines[1], emisorX, y);
      y += 4;
    }
  }

  // CP + Régimen + Teléfono + Email
  const metaItems: string[] = [];
  if (empresa.cp) metaItems.push(`C.P. ${empresa.cp}`);
  if (empresa.telefono) metaItems.push(`Tel: ${empresa.telefono}`);
  if (metaItems.length > 0) {
    doc.text(metaItems.join(' · '), emisorX, y);
    y += 4;
  }
  if (empresa.email) {
    doc.text(empresa.email, emisorX, y);
    y += 4;
  }

  // ── Right side: Doc type + folio ──
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(docType, rightX, 18, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(`Folio: ${folio}`, rightX, 25, { align: 'right' });

  return Math.max(y + 6, logoBase64 ? 42 : 38);
}

// ── Draw two-column info grid ──
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
  doc.setLineWidth(0.4);
  doc.line(ML, y, rightX, y);
  y += 7;

  const gridTopY = y - 3;

  // Section titles
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(leftTitle.toUpperCase(), colL, y);
  doc.text(rightTitle.toUpperCase(), colR, y);
  y += 6;

  // Left rows
  let ly = y;
  for (const [lbl, val] of leftRows) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text);
    doc.text(lbl, colL, ly);
    doc.setFont('helvetica', 'bold');
    const lblW = Math.max(doc.getTextWidth(lbl) + 3, 32);
    doc.text(val, colL + lblW, ly);
    ly += 5;
  }

  // Right rows
  let ry = y;
  for (const [lbl, val] of rightRows) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text);
    doc.text(lbl, colR, ry);
    doc.setFont('helvetica', 'bold');
    doc.text(val, colR + 42, ry);
    ry += 5;
  }

  y = Math.max(ly, ry) + 3;

  // Vertical divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(midX, gridTopY, midX, y - 3);

  // Bottom border
  doc.setLineWidth(0.4);
  doc.line(ML, y, rightX, y);
  return y + 7;
}

// ── Draw a clean table ──
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
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      lineWidth: 0,
      font: 'helvetica',
    },
    headStyles: {
      fillColor: C.headBg,
      textColor: C.text,
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
    },
    bodyStyles: { fillColor: C.white },
    alternateRowStyles: { fillColor: C.white },
    columnStyles: columnStyles || {},
    didDrawCell: (data: any) => {
      if (data.section === 'head') {
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.7);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      if (data.section === 'body' && data.row.index < body.length - 1) {
        doc.setDrawColor(...C.borderLight);
        doc.setLineWidth(0.25);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
    didParseCell,
  });

  return (doc as any).lastAutoTable.finalY + 7;
}

// ── Draw totals block ──
export function drawTotalsBlock(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string; bold?: boolean }[],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const totLabelX = rightX - 55;

  // Top border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(ML, y - 2, rightX, y - 2);
  y += 3;

  for (const row of rows) {
    if (row.bold) {
      // Heavy line before total
      doc.setDrawColor(...C.text);
      doc.setLineWidth(0.8);
      doc.line(totLabelX - 15, y, rightX, y);
      y += 5;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.text);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 8;
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.text);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 5.5;
    }
  }
  return y;
}

// ── Notes section ──
export function drawNotes(doc: jsPDF, y: number, notes: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  y = checkPageBreak(doc, y, 20);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('NOTAS', ML, y);
  y += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);
  const split = doc.splitTextToSize(notes, pageW - ML - MR);
  doc.text(split, ML, y);
  return y + split.length * 3.8 + 5;
}

// ── Signature lines ──
export function drawSignatures(doc: jsPDF, y: number, left: string, right: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  y = checkPageBreak(doc, y, 30);
  const sigW = (pageW - ML - MR - 24) / 2;
  doc.setDrawColor(...C.text);
  doc.setLineWidth(0.4);
  doc.line(ML, y, ML + sigW, y);
  doc.line(pageW - MR - sigW, y, pageW - MR, y);

  doc.setFontSize(8);
  doc.setTextColor(...C.text);
  doc.setFont('helvetica', 'bold');
  doc.text(left, ML + sigW / 2, y + 6, { align: 'center' });
  doc.text(right, pageW - MR - sigW / 2, y + 6, { align: 'center' });
  return y + 14;
}

// ── Page break check ──
export function checkPageBreak(doc: jsPDF, y: number, needed = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 16;
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
    doc.setLineWidth(0.3);
    doc.line(ML, pageH - 14, pageW - MR, pageH - 14);
    doc.setTextColor(...C.text);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(footerText, ML, pageH - 9);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 9, { align: 'right' });
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
