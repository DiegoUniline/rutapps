/**
 * Shared PDF document utilities — Clean Odoo-style professional layout
 * No colored bars, neutral palette, logo support, clean tables
 */
import jsPDF from 'jspdf';

// ── Neutral color palette (no vivid colors) ──
export const PDF = {
  black: [33, 37, 41] as [number, number, number],
  dark: [52, 58, 64] as [number, number, number],
  muted: [134, 142, 150] as [number, number, number],
  light: [173, 181, 189] as [number, number, number],
  border: [222, 226, 230] as [number, number, number],
  bgAlt: [248, 249, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  success: [40, 167, 69] as [number, number, number],
  danger: [220, 53, 69] as [number, number, number],
};

export const ML = 14; // margin left
export const MR = 14; // margin right

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

// ── Format helpers ──
export const fmtCurrency = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format number with currency symbol. Pass symbol from getCurrencyConfig(empresa.moneda).symbol */
export const fmtMoney = (n: number, symbol: string = '$') =>
  `${symbol}${fmtCurrency(n)}`;

export const fmtDate = (d: string) => {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return d; }
};

export const fmtDateTime = (d: string) => {
  try {
    return new Date(d).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return d; }
};

/**
 * Draw clean header: Company name left, document type + folio right
 * Optional logo image (if pre-loaded as base64)
 */
export function drawHeader(
  doc: jsPDF,
  empresa: EmpresaInfo,
  docTitle: string,
  docReference: string,
  logoBase64?: string | null,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;
  let leftX = ML;

  // Logo if available
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 8, 20, 20);
      leftX = ML + 24;
    } catch { /* ignore bad image */ }
  }

  // Company name
  doc.setTextColor(...PDF.black);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre.toUpperCase(), leftX, y);

  // Company details line
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.muted);
  const details: string[] = [];
  if (empresa.razon_social) details.push(empresa.razon_social);
  if (empresa.rfc) details.push(`RFC: ${empresa.rfc}`);
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado, empresa.cp].filter(Boolean).join(', ');
  if (addr) details.push(addr);
  if (empresa.telefono) details.push(`Tel: ${empresa.telefono}`);
  if (empresa.email) details.push(empresa.email);

  let dy = y + 5;
  // Split details into max 2 lines
  const line1 = details.slice(0, 3).join('  ·  ');
  const line2 = details.slice(3).join('  ·  ');
  if (line1) { doc.text(line1, leftX, dy); dy += 4; }
  if (line2) { doc.text(line2, leftX, dy); dy += 4; }

  // Document type + reference on right side
  doc.setTextColor(...PDF.black);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(docTitle, pageW - MR, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.dark);
  doc.text(docReference, pageW - MR, 20, { align: 'right' });

  // Separator line
  const lineY = Math.max(dy, 26) + 2;
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.4);
  doc.line(ML, lineY, pageW - MR, lineY);

  return lineY + 6;
}

/**
 * Draw a clean info section with key-value rows (no colored background)
 */
export function drawInfoSection(
  doc: jsPDF,
  y: number,
  leftRows: [string, string][],
  rightRows: [string, string][],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const midX = pageW / 2;
  const labelW = 32;

  const maxRows = Math.max(leftRows.length, rightRows.length);
  for (let i = 0; i < maxRows; i++) {
    const ly = y + i * 5;
    if (leftRows[i]) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF.muted);
      doc.text(leftRows[i][0], ML, ly);
      doc.setTextColor(...PDF.black);
      doc.setFont('helvetica', 'bold');
      doc.text(leftRows[i][1], ML + labelW, ly);
    }
    if (rightRows[i]) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...PDF.muted);
      doc.text(rightRows[i][0], midX + 10, ly);
      doc.setTextColor(...PDF.black);
      doc.setFont('helvetica', 'bold');
      doc.text(rightRows[i][1], midX + 10 + labelW, ly);
    }
  }

  return y + maxRows * 5 + 4;
}

/**
 * Clean totals block aligned to right
 */
export function drawTotals(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string; bold?: boolean }[],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const labelX = rightX - 60;

  rows.forEach((row, i) => {
    const ry = y + i * 5.5;
    doc.setFontSize(row.bold ? 8.5 : 7.5);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setTextColor(...(row.bold ? PDF.black : PDF.muted));
    doc.text(row.label, labelX, ry);
    doc.setTextColor(...PDF.black);
    doc.text(row.value, rightX, ry, { align: 'right' });

    if (row.bold) {
      // Line above total
      doc.setDrawColor(...PDF.border);
      doc.setLineWidth(0.3);
      doc.line(labelX, ry - 3, rightX, ry - 3);
    }
  });

  return y + rows.length * 5.5 + 4;
}

/**
 * Draw a section title — simple bold text with a thin line
 */
export function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setTextColor(...PDF.dark);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(title, ML, y);

  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.2);
  doc.line(ML, y + 2, pageW - MR, y + 2);

  return y + 6;
}

/**
 * Clean table header styles (neutral gray)
 */
export const TABLE_HEAD_STYLE = {
  fillColor: [255, 255, 255] as [number, number, number],
  textColor: [33, 37, 41] as [number, number, number],
  fontSize: 7,
  fontStyle: 'bold' as const,
  cellPadding: 2.5,
  lineColor: [200, 200, 200] as [number, number, number],
  lineWidth: 0.3,
};

export const TABLE_BODY_STYLE = {
  fillColor: [255, 255, 255] as [number, number, number],
  fontSize: 7,
  cellPadding: 2.5,
  textColor: [33, 37, 41] as [number, number, number],
  lineColor: [238, 238, 238] as [number, number, number],
  lineWidth: 0.15,
};

export const TABLE_ALT_STYLE = {
  fillColor: [255, 255, 255] as [number, number, number],
};

/**
 * Footer on all pages — clean line + pagination
 */
export function drawFooter(doc: jsPDF, footerText = 'Elaborado por Uniline — uniline.app') {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF.border);
    doc.setLineWidth(0.3);
    doc.line(ML, pageH - 12, pageW - MR, pageH - 12);
    doc.setTextColor(...PDF.light);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(footerText, ML, pageH - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 8, { align: 'right' });
  }
}

/**
 * Notes section
 */
export function drawNotes(doc: jsPDF, y: number, notes: string, label = 'Notas'): number {
  const pageW = doc.internal.pageSize.getWidth();
  if (y > 240) { doc.addPage(); y = 14; }
  doc.setTextColor(...PDF.muted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(`${label}:`, ML, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.dark);
  const split = doc.splitTextToSize(notes, pageW - ML - MR);
  doc.text(split, ML, y + 4);
  return y + 4 + split.length * 3.2;
}

/**
 * Check page break
 */
export function checkPageBreak(doc: jsPDF, y: number, needed = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 14;
  }
  return y;
}

/**
 * Load logo from URL as base64 for PDF embedding
 */
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
